import path from 'node:path';
import fs from 'node:fs';
import * as cheerio from 'cheerio';
import { uid } from '../utils/id.js';
import { query, run } from '../db/connection.js';
import { logger } from '../core/logger.js';
import { httpGetText, downloadBinary } from '../utils/http.js';
import { htmlToMarkdown, htmlToText, extractSummary } from '../utils/content.js';
import { PATHS } from '../config/env.js';
import type { ImageAsset, LibraryArticle } from '@smg/shared';

export type SearchResult = {
  url: string;
  title: string;
  summary: string;
  content: string;
  images: string[];
  publishedAt: string;
  kind: 'reference' | 'web';
};

class SearchService {
  /** 抓取网页 / 公众号文章正文 */
  async fetchUrl(url: string, kind: SearchResult['kind'] = 'web'): Promise<SearchResult> {
    const html = await httpGetText(url, { timeoutMs: 25_000 });
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('title').text().trim() ||
      $('h1').first().text().trim() ||
      '未命名文章';

    const publishedAt =
      $('meta[property="article:published_time"]').attr('content')?.trim() ||
      $('time').first().attr('datetime')?.trim() ||
      $('meta[name="pubdate"]').attr('content')?.trim() ||
      '';

    $('script, style, nav, header, footer, aside, .advertisement, .ad, #comments').remove();

    const body =
      $('#js_content').first().html() ||
      $('article').first().html() ||
      $('.article-content, .post-content, .content, #content, main').first().html() ||
      $('body').html() ||
      '';

    const images: string[] = [];
    $(body)
      .find('img')
      .each((_i, el) => {
        const src =
          $(el).attr('data-src') || $(el).attr('src') || $(el).attr('data-original') || '';
        if (src) images.push(src.startsWith('//') ? `https:${src}` : src);
      });

    return {
      url,
      title,
      summary: extractSummary(body, 200),
      content: htmlToMarkdown(body) || htmlToText(body),
      images: [...new Set(images)],
      publishedAt,
      kind,
    };
  }

  /** 批量抓取（并发，失败不中断） */
  async fetchMany(urls: string[], kind: SearchResult['kind'] = 'reference') {
    const results: SearchResult[] = [];
    const failed: string[] = [];

    await Promise.all(
      urls.map(async (url) => {
        try {
          const r = await this.fetchUrl(url, kind);
          results.push(r);
          logger.info(`已抓取参考文章：${r.title}`);
        } catch (err) {
          failed.push(url);
          logger.warn(`抓取失败 ${url}: ${(err as Error).message}`);
        }
      }),
    );

    return { results, failed };
  }

  /** 将抓取结果写入素材文库（URL 去重） */
  saveToLibrary(result: SearchResult): number {
    const existing = query<{ id: number }>('SELECT id FROM library_articles WHERE url = ?', [
      result.url,
    ]);
    if (existing.length) return existing[0].id;

    const meta = parseWechatMeta(result.content);
    const res = run(
      `INSERT INTO library_articles
        (title, author, account_name, account_biz, url, content_html, content_text,
         content_markdown, images, publish_time, digest, word_count, tags)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        result.title,
        meta.author,
        meta.accountName,
        meta.biz,
        result.url,
        result.content,
        htmlToText(result.content),
        result.content,
        JSON.stringify(result.images),
        result.publishedAt || new Date().toISOString().slice(0, 10),
        result.summary,
        result.content.length,
        '',
      ],
    );
    return Number(res.lastInsertRowid);
  }

  /** 素材库检索（bigram TF 打分，标题命中加权） */
  searchLibrary(keyword: string, limit = 20) {
    const terms = tokenize(keyword);
    if (terms.length === 0) return [];

    const rows = query<any>(
      `SELECT id, title, account_name, url, digest, content_text, word_count
       FROM library_articles ORDER BY created_at DESC LIMIT 800`,
    );

    return rows
      .map((row) => {
        const haystack = `${row.title} ${row.digest} ${row.content_text ?? ''}`
          .slice(0, 6000)
          .toLowerCase();
        const titleLower = String(row.title).toLowerCase();

        let score = 0;
        for (const term of terms) {
          const count = countOccurrences(haystack, term);
          if (count > 0) score += Math.log(1 + count);
          if (titleLower.includes(term)) score += 3;
        }

        return {
          id: row.id,
          title: row.title,
          accountName: row.account_name,
          url: row.url,
          digest: row.digest,
          wordCount: row.word_count,
          score: Number(score.toFixed(3)),
        };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** 下载远程图片并登记到资源图库 */
  async downloadImageToLibrary(
    url: string,
    meta: { title?: string; prompt?: string; source?: ImageAsset['source']; style?: string } = {},
  ): Promise<ImageAsset | null> {
    try {
      const buf = await downloadBinary(url, { timeoutMs: 25_000 });
      if (buf.length < 1024) return null;

      const fileName = `${uid()}${guessExt(url, buf)}`;
      fs.writeFileSync(path.join(PATHS.images, fileName), buf);

      run(
        `INSERT INTO image_assets (title, file_name, url, prompt, source, style, tags, width, height, size)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          meta.title ?? decodeURIComponent(new URL(url).pathname.split('/').pop() ?? 'image').slice(0, 60),
          fileName,
          `/uploads/images/${fileName}`,
          meta.prompt ?? '',
          meta.source ?? 'upload',
          meta.style ?? '',
          '',
          0,
          0,
          buf.length,
        ],
      );

      return query<ImageAsset>('SELECT * FROM image_assets WHERE file_name = ?', [fileName])[0] ?? null;
    } catch (err) {
      logger.warn(`图片下载失败 ${url}: ${(err as Error).message}`);
      return null;
    }
  }
}

function parseWechatMeta(markdown: string) {
  return {
    author: markdown.match(/^作者[：:]\s*(.+)$/m)?.[1]?.trim() ?? '',
    accountName: markdown.match(/^公众号[：:]\s*(.+)$/m)?.[1]?.trim() ?? '',
    biz: markdown.match(/__biz=([A-Za-z0-9+/=]+)/)?.[1] ?? '',
  };
}

/** 中英文混合分词：中文 bigram + 英文单词 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const grams = new Set<string>();

  for (const seg of text.match(/[\u4e00-\u9fa5]{2,}/g) ?? []) {
    if (seg.length <= 4) {
      grams.add(seg);
      continue;
    }
    for (let i = 0; i < seg.length - 1; i++) grams.add(seg.slice(i, i + 2));
  }
  for (const w of (text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).slice(0, 12)) grams.add(w);

  return [...grams].slice(0, 24);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
    if (count > 50) break;
  }
  return count;
}

function guessExt(url: string, buf: Buffer): string {
  try {
    const fromUrl = path.extname(new URL(url, 'http://x').pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(fromUrl)) return fromUrl;
  } catch {
    /* ignore */
  }
  if (buf[0] === 0x89 && buf[1] === 0x50) return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
  if (buf.slice(0, 3).toString() === 'GIF') return '.gif';
  if (buf.slice(0, 4).toString() === 'RIFF') return '.webp';
  return '.jpg';
}

export const searchService = new SearchService();
