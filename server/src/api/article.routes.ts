import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PUBLISH_PLATFORMS, PLATFORM_LABELS, type ArticleFormat, type PublishPlatform } from '@smg/shared';
import { articleService } from '../services/article.service.js';
import { publishService } from '../services/publish.service.js';
import { imageService } from '../services/image.service.js';
import { writerService } from '../services/writer.service.js';
import { layoutService } from '../services/layout.service.js';
import { logger } from '../core/logger.js';
import { PATHS } from '../config/env.js';
import { countWords, extractSummary, markdownToHtml, textToHtml } from '../utils/content.js';
import { ok, wrap, num, intParam, HttpError } from './helpers.js';
import type { Article } from '@smg/shared';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/* ---------------- CRUD ---------------- */

/** 必须在 `/articles/:id` 之前注册，否则 "stats" 会被当作 id */
r.get(
  '/articles/stats',
  wrap((_req, res) => ok(res, articleService.stats())),
);

r.get(
  '/articles',
  wrap((req, res) => {
    const q = req.query as Record<string, string>;
    ok(
      res,
      articleService.list({
        page: intParam(q.page, 1),
        pageSize: intParam(q.pageSize, 20, 1, 200),
        platform: q.platform,
        status: q.status,
        source: q.source,
        category: q.category,
        keyword: q.keyword,
        trackId: q.trackId ? num(q.trackId, 'trackId') : undefined,
        sceneId: q.sceneId ? num(q.sceneId, 'sceneId') : undefined,
      }),
    );
  }),
);

r.get(
  '/articles/:id',
  wrap((req, res) => {
    const article = articleService.get(num(req.params.id));
    if (!article) throw new HttpError('文章不存在', 404);
    ok(res, { ...article, publishHistory: articleService.publishHistory(article.id) });
  }),
);

r.post(
  '/articles',
  wrap((req, res) => {
    const body = req.body as Partial<Article> & { content: string };
    if (!body.content?.trim()) throw new HttpError('文章内容不能为空');
    const format: ArticleFormat = body.format ?? 'html';
    const title = (body.title ?? '').trim() || extractSummary(body.content, 24) || '未命名文章';
    const content = normalizeContent(body.content, format);

    const article = articleService.create({
      title,
      content,
      topic: body.topic ?? '',
      platform: body.platform ?? 'wechat',
      category: body.category ?? '手动录入',
      format,
      summary: body.summary,
      source: body.source ?? 'manual',
      trackId: body.trackId ?? null,
      sceneId: body.sceneId ?? null,
      status: body.status ?? 'draft',
    });
    ok(res, article, 201);
  }),
);

r.put(
  '/articles/:id',
  wrap((req, res) => {
    const id = num(req.params.id);
    const body = req.body as Partial<Article>;
    const patch: Parameters<typeof articleService.update>[1] = {};

    if (body.title !== undefined) patch.title = body.title;
    if (body.topic !== undefined) patch.topic = body.topic;
    if (body.platform !== undefined) patch.platform = body.platform;
    if (body.category !== undefined) patch.category = body.category;
    if (body.summary !== undefined) patch.summary = body.summary;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.status !== undefined) patch.status = body.status;
    if (body.coverPath !== undefined) patch.coverPath = body.coverPath;
    if (body.format !== undefined) patch.format = body.format;
    if (body.content !== undefined) {
      const current = articleService.get(id);
      if (!current) throw new HttpError('文章不存在', 404);
      const format = body.format ?? current.format;
      patch.content = normalizeContent(body.content, format);
      patch.format = format;
    }
    ok(res, articleService.update(id, patch));
  }),
);

r.delete(
  '/articles/:id',
  wrap((req, res) => {
    articleService.remove(num(req.params.id));
    ok(res, { removed: true });
  }),
);

r.post(
  '/articles/batch-delete',
  wrap((req, res) => {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || !ids.length) throw new HttpError('请选择要删除的文章');
    articleService.removeMany(ids.map((i) => num(i)));
    ok(res, { removed: ids.length });
  }),
);

/* ---------------- 导入导出 ---------------- */

r.post(
  '/articles/import',
  upload.single('file'),
  wrap(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError('请选择要上传的文件');
    const ext = path.extname(file.originalname).toLowerCase();
    const raw = file.buffer.toString('utf-8');
    const format: ArticleFormat = ext === '.md' ? 'markdown' : ext === '.txt' ? 'txt' : 'html';
    const content = normalizeContent(raw, format);

    const titleLine =
      format === 'markdown'
        ? (raw.match(/^\s*#\s+(.+)$/m)?.[1] ?? '')
        : format === 'html'
          ? (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
          : (raw.split('\n').find((l) => l.trim()) ?? '');

    const article = articleService.create({
      title: (titleLine || file.originalname.replace(/\.[^.]+$/, '')).trim().slice(0, 64),
      content,
      topic: (req.body?.topic as string) ?? '',
      platform: (req.body?.platform as string) ?? 'wechat',
      category: '文件导入',
      format,
      source: 'manual',
      status: 'draft',
    });
    ok(res, article, 201);
  }),
);

r.get(
  '/articles/:id/export',
  wrap((req, res) => {
    const article = articleService.get(num(req.params.id));
    if (!article) throw new HttpError('文章不存在', 404);
    const ext = article.format === 'markdown' ? 'md' : article.format === 'txt' ? 'txt' : 'html';
    const fileName = `${article.id}_${article.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50)}.${ext}`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(`<h1>${article.title}</h1>\n${article.content}`);
  }),
);

/* ---------------- 生成 ---------------- */

r.post(
  '/generate',
  wrap(async (req, res) => {
    if (writerService.isRunning()) throw new HttpError('已有生成任务在执行，请等待完成或先停止', 409);
    const body = req.body as Record<string, any>;
    if (!body.topic?.trim() && body.mode !== 'hot') {
      throw new HttpError('请填写选题，或选择「热点自动选题」模式');
    }
    const platform = (body.platform ?? 'wechat') as PublishPlatform;
    if (!PUBLISH_PLATFORMS.includes(platform)) throw new HttpError(`不支持的平台：${platform}`);

    logger.info(`启动生成任务：${body.topic || '（自动选题）'} → ${PLATFORM_LABELS[platform]}`);
    const result = await writerService.generate({
      topic: body.topic ?? '',
      platform,
      mode: body.mode ?? 'custom',
      reference: body.reference,
      dimensions: body.dimensions,
      trackId: body.trackId ? num(body.trackId, 'trackId') : undefined,
      trackTemplateId: body.trackTemplateId ? num(body.trackTemplateId, 'trackTemplateId') : undefined,
      deAi: body.deAi,
      autoPublish: body.autoPublish,
    });
    ok(res, result);
  }),
);

r.post(
  '/generate/stop',
  wrap((_req, res) => {
    writerService.stopAll();
    ok(res, { stopping: true });
  }),
);

r.get(
  '/generate/status',
  wrap((_req, res) => ok(res, { running: writerService.isRunning() })),
);

/* ---------------- 去 AI 味（独立调试） ---------------- */

r.post(
  '/deai/analyze',
  wrap(async (req, res) => {
    const { content, config, reference } = req.body as {
      content: string;
      config?: Record<string, unknown>;
      reference?: string;
    };
    if (!content?.trim()) throw new HttpError('请输入待检测内容');
    const { deAiEngine, scoreAiFlavor } = await import('../services/deai.service.js');
    const score = scoreAiFlavor(content);
    const result = await deAiEngine.run(content, { config, reference });
    ok(res, { before: score, after: result });
  }),
);

/* ---------------- 排版 ---------------- */

r.post(
  '/layout/preview',
  wrap(async (req, res) => {
    const { content, title, platform, design } = req.body as {
      content: string;
      title?: string;
      platform?: PublishPlatform;
      design?: any;
    };
    if (!content?.trim()) throw new HttpError('请输入内容');
    const html = await layoutService.designHtml(content, title ?? '未命名', platform ?? 'wechat', design);
    ok(res, { html });
  }),
);

r.post(
  '/layout/local',
  wrap((req, res) => {
    const { content, title, design } = req.body as { content: string; title?: string; design?: any };
    ok(res, { html: layoutService.localHtml(content, title ?? '未命名', design) });
  }),
);

/* ---------------- 发布 ---------------- */

r.post(
  '/publish/:id',
  wrap(async (req, res) => {
    const id = num(req.params.id);
    const article = articleService.get(id);
    if (!article) throw new HttpError('文章不存在', 404);

    const platform = ((req.body?.platform ?? article.platform) as PublishPlatform);
    if (!PUBLISH_PLATFORMS.includes(platform)) throw new HttpError(`不支持的平台：${platform}`);

    const outcome = await publishService.publish(article, platform);
    ok(res, outcome, outcome.success ? 200 : 200);
  }),
);

r.post(
  '/publish/:id/preview',
  wrap((req, res) => {
    const id = num(req.params.id);
    const article = articleService.get(id);
    if (!article) throw new HttpError('文章不存在', 404);
    const platform = (req.body?.platform ?? article.platform) as PublishPlatform;
    const preview = publishService.preview(article, platform);
    if (!preview) throw new HttpError(`不支持的平台：${platform}`);
    ok(res, preview);
  }),
);

r.get(
  '/publish/:id/history',
  wrap((req, res) => ok(res, articleService.publishHistory(num(req.params.id)))),
);

r.get(
  '/publish/platforms',
  wrap((_req, res) =>
    ok(
      res,
      publishService.platforms.map((a) => ({
        id: a.id,
        label: a.label,
        note: PUBLISH_NOTES[a.id] ?? '',
      })),
    ),
  ),
);

r.post(
  '/publish/:id/cover',
  upload.single('file'),
  wrap(async (req, res) => {
    const id = num(req.params.id);
    const article = articleService.get(id);
    if (!article) throw new HttpError('文章不存在', 404);
    if (!req.file) throw new HttpError('请选择封面图片');

    const asset = await imageService.saveUpload(
      { originalname: req.file.originalname, buffer: req.file.buffer, mimetype: req.file.mimetype },
      '封面',
    );
    const updated = articleService.update(id, { coverPath: asset.url });
    ok(res, { article: updated, asset });
  }),
);

r.post(
  '/publish/:id/cover/generate',
  wrap(async (req, res) => {
    const id = num(req.params.id);
    const article = articleService.get(id);
    if (!article) throw new HttpError('文章不存在', 404);

    const body = z
      .object({
        prompt: z.string().max(800).optional(),
      })
      .parse(req.body ?? {});

    const title = (article.title || '').trim() || '文章';
    const digest = (article.summary || article.content || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    const prompt =
      body.prompt?.trim() ||
      `主题:${title}。内容:${digest || title}。高质量中文公众号封面图，简洁高级，无文字水印。`;

    const asset = await imageService.generateCover(prompt);
    const updated = articleService.update(id, { coverPath: asset.url });
    ok(res, { article: updated, asset }, 201);
  }),
);

r.post(
  '/publish/:id/long-image',
  wrap(async (req, res) => {
    const id = num(req.params.id);
    const article = articleService.get(id);
    if (!article) throw new HttpError('文章不存在', 404);
    const dataUrl = await publishService.longImageDataUrl(article);
    const file = `long_${id}_${Date.now()}.png`;
    fs.writeFileSync(path.join(PATHS.images, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    ok(res, { url: `/uploads/images/${file}` });
  }),
);

const PUBLISH_NOTES: Record<string, string> = {
  wechat: '草稿箱 / 发布 / 群发',
  xiaohongshu: '图文 + 长图（需开放平台）',
  douyin: '短视频脚本（需开放平台）',
  toutiao: 'MD 稿件导出',
  baijiahao: 'MD 稿件导出',
  zhihu: '纯文本长文',
  douban: '纯文本长文',
  weibo: '纯文本长文',
  fanqie: '小说章节稿件',
};

function normalizeContent(content: string, format: ArticleFormat): string {
  if (format === 'markdown') return markdownToHtml(content);
  if (format === 'txt') return textToHtml(content);
  return content;
}

export default r;
