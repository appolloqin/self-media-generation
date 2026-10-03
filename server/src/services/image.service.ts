import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PATHS } from '../config/env.js';
import { query, queryOne, run } from '../db/connection.js';
import { configService } from './config.service.js';
import { logger } from '../core/logger.js';
import { downloadBinary } from '../utils/http.js';
import { uid } from '../utils/id.js';
import type { ImageAsset, ImageStylePreset, Paged } from '@smg/shared';

const ASSET_COLS = `id, title, file_name AS fileName, url, prompt, source, style, tags,
  width, height, size, created_at AS createdAt`;

class ImageService {
  list(q: { page?: number; pageSize?: number; source?: string; style?: string; keyword?: string } = {}): Paged<ImageAsset> {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(120, Math.max(1, q.pageSize ?? 24));
    const where: string[] = [];
    const params: any[] = [];
    if (q.source) {
      where.push('source = ?');
      params.push(q.source);
    }
    if (q.style) {
      where.push('style = ?');
      params.push(q.style);
    }
    if (q.keyword) {
      where.push('(title LIKE ? OR prompt LIKE ? OR tags LIKE ?)');
      const like = `%${q.keyword}%`;
      params.push(like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM image_assets ${whereSql}`, params)?.c ?? 0;
    const items = query<ImageAsset>(
      `SELECT ${ASSET_COLS} FROM image_assets ${whereSql}
       ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return { items, total, page, pageSize };
  }

  get(id: number): ImageAsset | undefined {
    return queryOne<ImageAsset>(`SELECT ${ASSET_COLS} FROM image_assets WHERE id = ?`, [id]);
  }

  /** 保存本地文件到图库 */
  async saveFile(buffer: Buffer, meta: Partial<ImageAsset> & { fileName?: string }): Promise<ImageAsset> {
    const fileName = meta.fileName ?? `${uid(14)}.jpg`;
    fs.mkdirSync(PATHS.images, { recursive: true });
    fs.writeFileSync(path.join(PATHS.images, fileName), buffer);

    let width = 0;
    let height = 0;
    try {
      const m = await sharp(buffer, { failOn: 'none' }).metadata();
      width = m.width ?? 0;
      height = m.height ?? 0;
    } catch {
      /* ignore */
    }

    run(
      `INSERT INTO image_assets (title, file_name, url, prompt, source, style, tags, width, height, size)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        meta.title ?? '',
        fileName,
        `/uploads/images/${fileName}`,
        meta.prompt ?? '',
        meta.source ?? 'upload',
        meta.style ?? '',
        meta.tags ?? '',
        width,
        height,
        buffer.length,
      ],
    );
    return this.get(Number(queryOne<{ id: number }>('SELECT last_insert_rowid() AS id')!.id))!;
  }

  async saveUpload(file: { originalname: string; buffer: Buffer; mimetype: string }, tags = ''): Promise<ImageAsset> {
    return this.saveFile(file.buffer, {
      title: file.originalname.replace(/\.[^.]+$/, '').slice(0, 60),
      fileName: `${uid(14)}${extFromMime(file.mimetype)}`,
      source: 'upload',
      tags,
    });
  }

  /** 远程图片下载入库 */
  async importUrl(url: string, meta: Partial<ImageAsset> = {}): Promise<ImageAsset> {
    const buf = await downloadBinary(url, { timeoutMs: 30_000 });
    return this.saveFile(buf, {
      ...meta,
      fileName: `${uid(14)}${extFromUrl(url)}`,
      source: meta.source ?? 'upload',
      title: meta.title ?? decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').slice(0, 60),
    });
  }

  /* ---------------- AI 生成 ---------------- */

  async generate(prompt: string, opts: { size?: string; style?: string; count?: number } = {}) {
    const cfg = configService.get().imgApi;
    if (cfg.type === 'none') throw new Error('图片生成已关闭，请在【系统设置 → 图片生成】中配置');
    if ((cfg.type === 'openai' || cfg.type === 'ali') && !cfg.apiKey?.trim()) {
      throw new Error('未配置图片 API Key，请在【系统设置 → 图片生成】中填写');
    }
    if (cfg.type === 'openai' && !cfg.apiBase?.trim()) {
      throw new Error('未配置图片接口地址，请在【系统设置 → 图片生成】中填写 OpenAI 兼容地址');
    }

    const [w, h] = parseSize(opts.size ?? cfg.size);
    const count = Math.min(4, Math.max(1, opts.count ?? 1));
    const created: ImageAsset[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const buf = await this.renderOne(prompt, cfg, w, h, i);
        created.push(
          await this.saveFile(buf, {
            title: prompt.slice(0, 40),
            prompt,
            source: 'ai',
            style: opts.style ?? '',
          }),
        );
      } catch (err) {
        logger.warn(`生成第 ${i + 1} 张图失败：${(err as Error).message}`);
        if (count === 1) throw err;
      }
    }

    if (!created.length) throw new Error('图片生成失败，请检查图片 API 配置');
    return created;
  }

  /**
   * 为文章生成封面：按配置生图 → 裁切 900×384 → 入库并返回资源
   */
  async generateCover(prompt: string): Promise<ImageAsset> {
    const cfg = configService.get().imgApi;
    const size = cfg.size?.includes('1792') || cfg.size?.includes('900') ? cfg.size : '1792x1024';
    const [w, h] = parseSize(size);
    const raw = await this.renderOne(prompt, cfg, w, h, 0);
    const cropped = await sharp(raw, { failOn: 'none' })
      .resize(900, 384, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 92 })
      .toBuffer();
    return this.saveFile(cropped, {
      title: `封面-${prompt.slice(0, 24)}`,
      prompt,
      source: 'ai',
      style: '封面',
      tags: '封面',
      fileName: `${uid(14)}.jpg`,
    });
  }

  private async renderOne(
    prompt: string,
    cfg: { type: string; apiKey: string; apiBase?: string; model: string },
    w: number,
    h: number,
    seed: number,
  ): Promise<Buffer> {
    const full = `${prompt}${seed ? ` #${seed}` : ''}`;
    const type = cfg.type;
    const apiKey = cfg.apiKey;
    const model = cfg.model;

    if (type === 'openai') {
      return this.renderOpenAiCompatible(full, cfg.apiBase || '', apiKey, model, w, h);
    }

    if (type === 'ali' && apiKey) {
      const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'wanx2.0-t2i-turbo',
          input: { prompt: full, negative_prompt: '低质量、畸形、多余肢体、文字水印' },
          parameters: { size: `${w}*${h}`, n: 1 },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const data = (await res.json()) as any;
      const url = data?.output?.results?.[0]?.url;
      if (!url) throw new Error(data?.message ?? '阿里图像接口无返回');
      return downloadBinary(url, { timeoutMs: 40_000 });
    }

    if (type === 'pollinations') {
      return downloadBinary(
        `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=${w}&height=${h}&nologo=true&seed=${seed}`,
        { timeoutMs: 60_000 },
      );
    }

    // picsum / none：占位图
    return downloadBinary(`https://picsum.photos/seed/${encodeURIComponent(full.slice(0, 12))}/${w}/${h}`, {
      timeoutMs: 30_000,
    });
  }

  /** OpenAI 兼容文生图：POST {base}/images/generations */
  private async renderOpenAiCompatible(
    prompt: string,
    apiBase: string,
    apiKey: string,
    model: string,
    w: number,
    h: number,
  ): Promise<Buffer> {
    let base = (apiBase || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('未配置图片接口地址');
    if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
    base = base.replace(/\/images\/generations$/i, '');
    if (!/\/v\d+$/i.test(base) && !/\/(openai|compatible-mode|paas|api)$/i.test(base)) {
      base = `${base}/v1`;
    }
    const endpoint = `${base}/images/generations`;
    const size = `${w}x${h}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'seedream-3.0',
        prompt,
        n: 1,
        size,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`图片接口失败 HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as any;
    const item = data?.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
    if (item?.url) return downloadBinary(String(item.url), { timeoutMs: 40_000 });
    throw new Error(data?.error?.message ?? data?.message ?? '图片接口未返回有效数据');
  }

  /* ---------------- 风格预设 ---------------- */

  presets(): ImageStylePreset[] {
    return query<ImageStylePreset>(
      `SELECT id, name, prompt_template AS promptTemplate, negative_prompt AS negativePrompt,
              category, builtin, created_at AS createdAt
       FROM image_style_presets ORDER BY builtin DESC, id`,
    );
  }

  createPreset(data: Partial<ImageStylePreset> & { name: string }) {
    const res = run(
      'INSERT INTO image_style_presets (name, prompt_template, negative_prompt, category, builtin) VALUES (?,?,?,?,0)',
      [data.name, data.promptTemplate ?? '', data.negativePrompt ?? '', data.category ?? '通用'],
    );
    return queryOne<ImageStylePreset>('SELECT * FROM image_style_presets WHERE id = ?', [
      Number(res.lastInsertRowid),
    ]);
  }

  updatePreset(id: number, patch: Partial<ImageStylePreset>) {
    const cur = queryOne<any>('SELECT * FROM image_style_presets WHERE id = ?', [id]);
    if (!cur) throw new Error('预设不存在');
    run(
      'UPDATE image_style_presets SET name=?, prompt_template=?, negative_prompt=?, category=? WHERE id = ?',
      [
        patch.name ?? cur.name,
        patch.promptTemplate ?? cur.prompt_template,
        patch.negativePrompt ?? cur.negative_prompt,
        patch.category ?? cur.category,
        id,
      ],
    );
    return queryOne<ImageStylePreset>('SELECT * FROM image_style_presets WHERE id = ?', [id]);
  }

  removePreset(id: number) {
    const cur = queryOne<ImageStylePreset>('SELECT * FROM image_style_presets WHERE id = ?', [id]);
    if (!cur) throw new Error('预设不存在');
    if (cur.builtin) throw new Error('内置预设不可删除');
    run('DELETE FROM image_style_presets WHERE id = ?', [id]);
  }

  /* ---------------- 管理 ---------------- */

  update(id: number, patch: Partial<ImageAsset>) {
    const cur = this.get(id);
    if (!cur) throw new Error('图片不存在');
    run('UPDATE image_assets SET title=?, prompt=?, style=?, tags=? WHERE id = ?', [
      patch.title ?? cur.title,
      patch.prompt ?? cur.prompt,
      patch.style ?? cur.style,
      patch.tags ?? cur.tags,
      id,
    ]);
    return this.get(id);
  }

  remove(id: number) {
    const cur = this.get(id);
    if (!cur) throw new Error('图片不存在');
    run('DELETE FROM image_assets WHERE id = ?', [id]);
    try {
      const file = path.join(PATHS.images, path.basename(cur.url));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }

  stats() {
    const total = queryOne<{ c: number }>('SELECT COUNT(*) as c FROM image_assets')?.c ?? 0;
    const size = queryOne<{ s: number }>('SELECT COALESCE(SUM(size),0) as s FROM image_assets')?.s ?? 0;
    const bySource = query<{ source: string; c: number }>(
      'SELECT source, COUNT(*) AS c FROM image_assets GROUP BY source',
    );
    return { total, size, bySource };
  }

  /** 把文章 HTML 中的远程图片缓存到本地 */
  async localizeArticleImages(html: string): Promise<string> {
    const urls = [...new Set([...html.matchAll(/<img[^>]*?src=["']([^"']+)["']/gi)].map((m) => m[1]))];
    let out = html;
    for (const src of urls) {
      if (src.startsWith('/uploads/')) continue;
      try {
        const asset = await this.importUrl(src, { source: 'render' });
        out = out.split(src).join(asset.url);
      } catch (err) {
        logger.warn(`图片本地化失败 ${src}：${(err as Error).message}`);
      }
    }
    return out;
  }
}

function parseSize(size: string): [number, number] {
  const m = size.match(/(\d+)\s*[*x×]\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2])];
  return [1024, 1024];
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = { 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
  return map[mime] ?? '.jpg';
}

function extFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (['.png', '.gif', '.webp', '.jpg', '.jpeg'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  } catch {
    /* ignore */
  }
  return '.jpg';
}

void 0;

export const imageService = new ImageService();
