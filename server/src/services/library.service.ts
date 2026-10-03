import { query, queryOne, run } from '../db/connection.js';
import { llmService } from './llm.service.js';
import { searchService } from './search.service.js';
import { logger } from '../core/logger.js';
import { extractSummary, htmlToMarkdown, htmlToText } from '../utils/content.js';
import type { LibraryAccount, LibraryArticle, Paged } from '@smg/shared';

const LIB_COLS = `id, title, author, account_name AS accountName, account_biz AS accountBiz, url,
  content_html AS contentHtml, content_text AS contentText, content_markdown AS contentMarkdown,
  images, publish_time AS publishTime, digest, word_count AS wordCount, tags,
  used_count AS usedCount, created_at AS createdAt, updated_at AS updatedAt`;

class LibraryService {
  list(q: { page?: number; pageSize?: number; keyword?: string; accountName?: string } = {}): Paged<LibraryArticle> {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const where: string[] = [];
    const params: any[] = [];

    if (q.accountName) {
      where.push('account_name = ?');
      params.push(q.accountName);
    }
    if (q.keyword) {
      where.push('(title LIKE ? OR digest LIKE ? OR content_text LIKE ?)');
      const like = `%${q.keyword}%`;
      params.push(like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM library_articles ${whereSql}`, params)?.c ?? 0;
    const items = query<LibraryArticle>(
      `SELECT id, title, author, account_name AS accountName, account_biz AS accountBiz, url,
              '' AS contentHtml, '' AS contentText, '' AS contentMarkdown,
              images, publish_time AS publishTime, digest, word_count AS wordCount, tags,
              used_count AS usedCount, created_at AS createdAt, updated_at AS updatedAt
       FROM library_articles ${whereSql}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return { items, total, page, pageSize };
  }

  get(id: number): LibraryArticle | undefined {
    return queryOne<LibraryArticle>(`SELECT ${LIB_COLS} FROM library_articles WHERE id = ?`, [id]);
  }

  /** 按 URL 采集公众号文章并入库 */
  async collectUrl(url: string): Promise<{ id: number; created: boolean; title: string }> {
    const exists = queryOne<{ id: number; title: string }>(
      'SELECT id, title FROM library_articles WHERE url = ?',
      [url],
    );
    if (exists) return { id: exists.id, created: false, title: exists.title };

    const result = await searchService.fetchUrl(url, 'reference');
    const id = this.save(result);
    return { id, created: true, title: result.title };
  }

  async collectMany(urls: string[]) {
    const out: { url: string; ok: boolean; id?: number; title?: string; error?: string }[] = [];
    for (const url of urls) {
      try {
        const r = await this.collectUrl(url);
        out.push({ url, ok: true, ...r });
      } catch (err) {
        const message = (err as Error).message;
        logger.warn(`采集失败 ${url}：${message}`);
        out.push({ url, ok: false, error: message });
      }
    }
    return out;
  }

  save(result: { url: string; title: string; content: string; images: string[]; publishedAt: string; summary: string }) {
    const text = htmlToText(result.content);
    const digest = result.summary || extractSummary(result.content, 150);
    const biz = result.url.match(/__biz=([A-Za-z0-9+/=_-]+)/)?.[1] ?? '';
    const accountName = result.content.match(/公众号[：:]\s*(.+)/)?.[1]?.trim() ?? '';

    run(
      `INSERT OR IGNORE INTO library_articles
        (title, author, account_name, account_biz, url, content_html, content_text, content_markdown,
         images, publish_time, digest, word_count, tags)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        result.title,
        '',
        accountName,
        biz,
        result.url,
        result.content,
        text,
        htmlToMarkdown(result.content),
        JSON.stringify(result.images ?? []),
        result.publishedAt || new Date().toISOString().slice(0, 10),
        digest,
        text.length,
        '',
      ],
    );
    return queryOne<{ id: number }>('SELECT id FROM library_articles WHERE url = ?', [result.url])!.id;
  }

  search(keyword: string, limit = 20) {
    return searchService.searchLibrary(keyword, limit);
  }

  /** 标记为已使用（供选题/参考时统计） */
  markUsed(id: number) {
    run(
      `UPDATE library_articles SET used_count = used_count + 1, updated_at = datetime('now','localtime') WHERE id = ?`,
      [id],
    );
  }

  update(id: number, patch: { title?: string; tags?: string }) {
    const cur = this.get(id);
    if (!cur) throw new Error('素材不存在');
    run(
      `UPDATE library_articles SET title=?, tags=?, updated_at=datetime('now','localtime') WHERE id = ?`,
      [patch.title ?? cur.title, patch.tags ?? cur.tags, id],
    );
    return this.get(id);
  }

  remove(id: number) {
    const cur = this.get(id);
    if (!cur) throw new Error('素材不存在');
    run('DELETE FROM library_articles WHERE id = ?', [id]);
  }

  /* ---------------- 公众号订阅 ---------------- */

  accounts(): LibraryAccount[] {
    return query<LibraryAccount>(
      `SELECT id, name, biz, wechat_id AS wechatId, last_fetch_at AS lastFetchAt,
              last_article_url AS lastArticleUrl, enabled, created_at AS createdAt
       FROM library_accounts ORDER BY id`,
    );
  }

  addAccount(data: { name: string; biz?: string; wechatId?: string }) {
    const res = run('INSERT INTO library_accounts (name, biz, wechat_id) VALUES (?,?,?)', [
      data.name,
      data.biz ?? '',
      data.wechatId ?? '',
    ]);
    return queryOne<LibraryAccount>(
      `SELECT id, name, biz, wechat_id AS wechatId, last_fetch_at AS lastFetchAt,
              last_article_url AS lastArticleUrl, enabled, created_at AS createdAt
       FROM library_accounts WHERE id = ?`,
      [Number(res.lastInsertRowid)],
    )!;
  }

  removeAccount(id: number) {
    run('DELETE FROM library_accounts WHERE id = ?', [id]);
  }

  toggleAccount(id: number, enabled: boolean) {
    run('UPDATE library_accounts SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
  }

  /** 追踪公众号：读取历史文章链接并入库 */
  async trackAccount(id: number) {
    const acc = queryOne<LibraryAccount & { lastArticleUrl: string | null }>(
      'SELECT * FROM library_accounts WHERE id = ?',
      [id],
    );
    if (!acc) throw new Error('公众号不存在');

    const profileUrl = acc.biz
      ? `https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=${encodeURIComponent(acc.biz)}`
      : acc.lastArticleUrl;
    if (!profileUrl) throw new Error('缺少 __biz 或历史文章链接，无法追踪');

    const { httpGetText } = await import('../utils/http.js');
    const html = await httpGetText(profileUrl, { timeoutMs: 25_000 });
    const urls = extractHistoryUrls(html);
    if (!urls.length) throw new Error('未解析到历史文章链接，请手动粘贴文章 URL 采集');

    const results = await this.collectMany(urls.slice(0, 10));
    run(
      `UPDATE library_accounts SET last_fetch_at = datetime('now','localtime'), last_article_url = ? WHERE id = ?`,
      [urls[0] ?? null, id],
    );
    return results;
  }

  /* ---------------- 选题灵感 ---------------- */

  ideas(limit = 30) {
    return query<any>(
      `SELECT id, topic, score, reason, angles, ref_article_ids AS refArticleIds, status,
              created_at AS createdAt
       FROM topic_ideas ORDER BY score DESC, id DESC LIMIT ?`,
      [limit],
    );
  }

  addIdea(data: { topic: string; score: number; reason: string; angles: string; refArticleIds?: number[] }) {
    const res = run(
      'INSERT INTO topic_ideas (topic, score, reason, angles, ref_article_ids) VALUES (?,?,?,?,?)',
      [data.topic, data.score, data.reason, data.angles, JSON.stringify(data.refArticleIds ?? [])],
    );
    return Number(res.lastInsertRowid);
  }

  setIdeaStatus(id: number, status: number) {
    run('UPDATE topic_ideas SET status = ? WHERE id = ?', [status, id]);
  }

  removeIdea(id: number) {
    run('DELETE FROM topic_ideas WHERE id = ?', [id]);
  }

  /** 用 LLM 基于素材库生成选题灵感 */
  async generateIdeas(keyword: string, count = 6) {
    const hits = searchService.searchLibrary(keyword, 8);
    if (!hits.length) throw new Error('素材库中没有相关内容，请先采集素材');

    const corpus = hits
      .map((h, i) => `${i + 1}. ${h.title}\n   摘要：${h.digest}`)
      .join('\n');

    const raw = await llmService.chat({
      system: `你是自媒体选题策划。基于给定的素材标题与摘要，挖掘可写的选题。
只输出 JSON 数组，每个元素形如：
{"topic":"选题标题","score":85,"reason":"为什么值得写","angles":"切入角度"}
score 为 0-100 的可写性评分。不要输出任何解释文字。`,
      user: `关键词：${keyword}\n\n素材：\n${corpus}\n\n请生成 ${count} 个选题。`,
      temperature: 0.85,
      json: true,
      maxTokens: 2000,
    });

    const match = raw.match(/\[[\s\S]*\]/);
    let parsed: any[] = [];
    try {
      parsed = match ? JSON.parse(match[0]) : [];
    } catch {
      parsed = [];
    }

    const saved = parsed
      .filter((x) => x && typeof x.topic === 'string')
      .slice(0, count)
      .map((x) => {
        const id = this.addIdea({
          topic: x.topic,
          score: Number(x.score ?? 70),
          reason: String(x.reason ?? ''),
          angles: String(x.angles ?? ''),
          refArticleIds: hits.slice(0, 3).map((h) => h.id),
        });
        return { id, ...x };
      });

    return saved;
  }
}

/** 从公众号历史页 HTML 中提取文章链接 */
function extractHistoryUrls(html: string): string[] {
  const urls: string[] = [];
  const re = /(https?:\/\/mp\.weixin\.qq\.com\/s[?][^"'\\\s<>]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const clean = m[1].replace(/&amp;/g, '&');
    if (!urls.includes(clean)) urls.push(clean);
  }
  return urls;
}

export const libraryService = new LibraryService();
