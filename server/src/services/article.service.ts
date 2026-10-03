import fs from 'node:fs';
import path from 'node:path';
import { query, queryOne, run } from '../db/connection.js';
import { PATHS } from '../config/env.js';
import { countWords, extractSummary } from '../utils/content.js';
import { logger } from '../core/logger.js';
import type { Article, ArticleFormat, Paged } from '@smg/shared';

const EXT_MAP: Record<ArticleFormat, string> = { html: '.html', markdown: '.md', txt: '.txt' };

export type ArticleQuery = {
  page?: number;
  pageSize?: number;
  platform?: string;
  status?: string;
  source?: string;
  trackId?: number;
  sceneId?: number;
  keyword?: string;
  category?: string;
};

function safeName(title: string): string {
  return title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80);
}

class ArticleService {
  list(q: ArticleQuery = {}): Paged<Article> {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 20));
    const where: string[] = [];
    const params: any[] = [];

    if (q.platform) {
      where.push('platform = ?');
      params.push(q.platform);
    }
    if (q.status) {
      where.push('status = ?');
      params.push(q.status);
    }
    if (q.source) {
      where.push('source = ?');
      params.push(q.source);
    }
    if (q.trackId) {
      where.push('track_id = ?');
      params.push(q.trackId);
    }
    if (q.sceneId) {
      where.push('scene_id = ?');
      params.push(q.sceneId);
    }
    if (q.category) {
      where.push('category = ?');
      params.push(q.category);
    }
    if (q.keyword) {
      where.push('(title LIKE ? OR topic LIKE ? OR summary LIKE ?)');
      const like = `%${q.keyword}%`;
      params.push(like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total =
      queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM articles ${whereSql}`, params)?.c ?? 0;

    const items = query<Article>(
      `SELECT id, title, topic, platform, category, format, '' AS content, summary,
              cover_path AS coverPath, tags, source, track_id AS trackId, scene_id AS sceneId,
              word_count AS wordCount, status, created_at AS createdAt, updated_at AS updatedAt
       FROM articles ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    return { items, total, page, pageSize };
  }

  get(id: number): Article | undefined {
    return queryOne<Article>(
      `SELECT id, title, topic, platform, category, format, content, summary,
              cover_path AS coverPath, tags, source, track_id AS trackId, scene_id AS sceneId,
              word_count AS wordCount, status, created_at AS createdAt, updated_at AS updatedAt
       FROM articles WHERE id = ?`,
      [id],
    );
  }

  create(data: {
    title: string;
    content: string;
    topic?: string;
    platform?: string;
    category?: string;
    format?: ArticleFormat;
    summary?: string;
    coverPath?: string | null;
    tags?: string;
    source?: Article['source'];
    trackId?: number | null;
    sceneId?: number | null;
    status?: Article['status'];
  }): Article {
    const format = data.format ?? 'html';
    const words = countWords(data.content);
    const summary = data.summary?.trim() || extractSummary(data.content, 150);

    const res = run(
      `INSERT INTO articles
        (title, topic, platform, category, format, content, summary, cover_path, tags,
         source, track_id, scene_id, word_count, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.title,
        data.topic ?? '',
        data.platform ?? 'wechat',
        data.category ?? '',
        format,
        data.content,
        summary,
        data.coverPath ?? null,
        data.tags ?? '',
        data.source ?? 'ai',
        data.trackId ?? null,
        data.sceneId ?? null,
        words,
        data.status ?? 'draft',
      ],
    );

    const id = Number(res.lastInsertRowid);
    this.writeFile(id, data.title, format, data.content);
    return this.get(id)!;
  }

  update(
    id: number,
    patch: Partial<{
      title: string;
      content: string;
      topic: string;
      platform: string;
      category: string;
      format: ArticleFormat;
      summary: string;
      coverPath: string | null;
      tags: string;
      status: Article['status'];
    }>,
  ): Article {
    const current = this.get(id);
    if (!current) throw new Error('文章不存在');

    const title = patch.title ?? current.title;
    const content = patch.content ?? current.content;
    const format = patch.format ?? current.format;
    const summary = patch.summary ?? extractSummary(content, 150);
    const words = countWords(content);

    run(
      `UPDATE articles SET title=?, topic=?, platform=?, category=?, format=?, content=?,
              summary=?, cover_path=?, tags=?, status=?, word_count=?,
              updated_at=datetime('now','localtime')
       WHERE id = ?`,
      [
        title,
        patch.topic ?? current.topic,
        patch.platform ?? current.platform,
        patch.category ?? current.category,
        format,
        content,
        summary,
        patch.coverPath === undefined ? current.coverPath : patch.coverPath,
        patch.tags ?? current.tags,
        patch.status ?? current.status,
        words,
        id,
      ],
    );

    this.writeFile(id, title, format, content);
    return this.get(id)!;
  }

  remove(id: number) {
    const article = this.get(id);
    if (!article) throw new Error('文章不存在');
    run('DELETE FROM articles WHERE id = ?', [id]);
    this.cleanupFiles(article.title);
  }

  removeMany(ids: number[]) {
    for (const id of ids) {
      try {
        this.remove(id);
      } catch {
        /* ignore */
      }
    }
  }

  stats() {
    const total = queryOne<{ c: number }>('SELECT COUNT(*) as c FROM articles')?.c ?? 0;
    const words =
      queryOne<{ w: number }>('SELECT COALESCE(SUM(word_count),0) as w FROM articles')?.w ?? 0;
    const published =
      queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM articles WHERE status='published'`)?.c ?? 0;
    const byPlatform = query<{ platform: string; c: number }>(
      'SELECT platform, COUNT(*) AS c FROM articles GROUP BY platform ORDER BY c DESC',
    );
    const bySource = query<{ source: string; c: number }>(
      'SELECT source, COUNT(*) AS c FROM articles GROUP BY source ORDER BY c DESC',
    );
    return { total, words, published, byPlatform, bySource };
  }

  private writeFile(id: number, title: string, format: ArticleFormat, content: string) {
    try {
      fs.mkdirSync(PATHS.articles, { recursive: true });
      fs.writeFileSync(path.join(PATHS.articles, `${id}_${safeName(title)}${EXT_MAP[format]}`), content, 'utf-8');
    } catch (err) {
      logger.warn(`文章静态文件写入失败: ${(err as Error).message}`);
    }
  }

  private cleanupFiles(title: string) {
    try {
      const needle = safeName(title);
      for (const f of fs.readdirSync(PATHS.articles)) {
        if (f.includes(needle)) fs.unlinkSync(path.join(PATHS.articles, f));
      }
    } catch {
      /* ignore */
    }
  }

  addPublishRecord(rec: {
    articleId: number;
    platform: string;
    accountInfo: Record<string, unknown>;
    success: boolean;
    error?: string | null;
    publishId?: string | null;
    url?: string | null;
  }) {
    const res = run(
      `INSERT INTO article_publish_records (article_id, platform, account_info, success, error, publish_id, url)
       VALUES (?,?,?,?,?,?,?)`,
      [
        rec.articleId,
        rec.platform,
        JSON.stringify(rec.accountInfo),
        rec.success ? 1 : 0,
        rec.error ?? null,
        rec.publishId ?? null,
        rec.url ?? null,
      ],
    );
    return Number(res.lastInsertRowid);
  }

  publishHistory(articleId: number) {
    return query(
      `SELECT id, article_id AS articleId, platform, account_info AS accountInfo,
              success, error, publish_id AS publishId, url, created_at AS createdAt
       FROM article_publish_records WHERE article_id = ? ORDER BY created_at DESC`,
      [articleId],
    );
  }

  syncStatusFromRecords(articleId: number) {
    const latest = queryOne<{ success: number }>(
      'SELECT success FROM article_publish_records WHERE article_id = ? ORDER BY created_at DESC LIMIT 1',
      [articleId],
    );
    if (!latest) return;
    run(`UPDATE articles SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`, [
      latest.success ? 'published' : 'failed',
      articleId,
    ]);
  }
}

export const articleService = new ArticleService();
