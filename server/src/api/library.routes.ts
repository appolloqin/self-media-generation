import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { libraryService } from '../services/library.service.js';
import { imageService } from '../services/image.service.js';
import { searchService } from '../services/search.service.js';
import { ok, wrap, num, intParam, HttpError } from './helpers.js';
import { isValidUrl } from '../utils/content.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/* ================= 素材文库 ================= */

r.get(
  '/library/articles',
  wrap((req, res) => {
    const q = req.query as Record<string, string>;
    ok(
      res,
      libraryService.list({
        page: intParam(q.page, 1),
        pageSize: intParam(q.pageSize, 20, 1, 100),
        keyword: q.keyword,
        accountName: q.accountName,
      }),
    );
  }),
);

r.get(
  '/library/articles/:id',
  wrap((req, res) => {
    const item = libraryService.get(num(req.params.id));
    if (!item) throw new HttpError('素材不存在', 404);
    ok(res, item);
  }),
);

const collectSchema = z.object({
  urls: z.array(z.string().min(1)).min(1, '请至少填写一个链接'),
});

r.post(
  '/library/collect',
  wrap(async (req, res) => {
    const { urls } = collectSchema.parse(req.body);
    for (const u of urls) {
      if (!isValidUrl(u)) throw new HttpError(`无效链接：${u}`);
    }
    ok(res, await libraryService.collectMany(urls));
  }),
);

r.put(
  '/library/articles/:id',
  wrap((req, res) => {
    const body = z.object({ title: z.string().optional(), tags: z.string().optional() }).parse(req.body);
    ok(res, libraryService.update(num(req.params.id), body));
  }),
);

r.delete(
  '/library/articles/:id',
  wrap((req, res) => {
    libraryService.remove(num(req.params.id));
    ok(res, { removed: true });
  }),
);

r.get(
  '/library/search',
  wrap((req, res) => {
    const keyword = String(req.query.keyword ?? '').trim();
    if (!keyword) throw new HttpError('请输入关键词');
    ok(res, libraryService.search(keyword, intParam(req.query.limit, 20, 1, 100)));
  }),
);

/** 抓取任意网页正文（不落库） */
r.post(
  '/library/fetch',
  wrap(async (req, res) => {
    const { url } = z.object({ url: z.string().min(1) }).parse(req.body);
    if (!isValidUrl(url)) throw new HttpError('无效链接');
    ok(res, await searchService.fetchUrl(url, 'web'));
  }),
);

/* ---- 公众号订阅 ---- */

r.get('/library/accounts', wrap((_req, res) => ok(res, libraryService.accounts())));

r.post(
  '/library/accounts',
  wrap((req, res) => {
    const body = z.object({ name: z.string().min(1, '请填写公众号名称'), biz: z.string().optional(), wechatId: z.string().optional() }).parse(req.body);
    ok(res, libraryService.addAccount(body), 201);
  }),
);

r.patch(
  '/library/accounts/:id',
  wrap((req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    libraryService.toggleAccount(num(req.params.id), enabled);
    ok(res, { updated: true });
  }),
);

r.delete(
  '/library/accounts/:id',
  wrap((req, res) => {
    libraryService.removeAccount(num(req.params.id));
    ok(res, { removed: true });
  }),
);

r.post(
  '/library/accounts/:id/track',
  wrap(async (req, res) => {
    const id = num(req.params.id);
    ok(res, await libraryService.trackAccount(id));
  }),
);

/* ================= 资源图库 ================= */

r.get(
  '/images',
  wrap((req, res) => {
    const q = req.query as Record<string, string>;
    ok(
      res,
      imageService.list({
        page: intParam(q.page, 1),
        pageSize: intParam(q.pageSize, 24, 1, 120),
        source: q.source,
        style: q.style,
        keyword: q.keyword,
      }),
    );
  }),
);

r.get('/images/stats', wrap((_req, res) => ok(res, imageService.stats())));

r.get('/images/presets', wrap((_req, res) => ok(res, imageService.presets())));

r.get(
  '/images/:id',
  wrap((req, res) => {
    const id = num(req.params.id);
    if (!/^\d+$/.test(String(id))) throw new HttpError('图片 ID 无效');
    const item = imageService.get(id);
    if (!item) throw new HttpError('图片不存在', 404);
    ok(res, item);
  }),
);
r.post(
  '/images/upload',
  upload.array('files', 20),
  wrap(async (req, res) => {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw new HttpError('请选择要上传的图片');
    const out = [];
    for (const f of files) {
      out.push(await imageService.saveUpload({ originalname: f.originalname, buffer: f.buffer, mimetype: f.mimetype }, '上传'));
    }
    ok(res, out, 201);
  }),
);

r.post(
  '/images/import-url',
  wrap(async (req, res) => {
    const { url, prompt, style } = z.object({ url: z.string().min(1), prompt: z.string().optional(), style: z.string().optional() }).parse(req.body);
    if (!isValidUrl(url)) throw new HttpError('无效图片地址');
    ok(res, await imageService.importUrl(url, { prompt, style, source: 'upload' }), 201);
  }),
);

r.post(
  '/images/generate',
  wrap(async (req, res) => {
    const body = z
      .object({
        prompt: z.string().min(1, '请输入图片描述'),
        size: z.string().optional(),
        style: z.string().optional(),
        count: z.number().int().min(1).max(4).optional(),
        presetId: z.number().int().optional(),
      })
      .parse(req.body);

    let prompt = body.prompt;
    let style = body.style ?? '';
    if (body.presetId) {
      const preset = imageService.presets().find((p) => p.id === body.presetId);
      if (preset) {
        prompt = preset.promptTemplate.replace(/\{prompt\}/g, body.prompt);
        style = style || preset.name;
      }
    }
    ok(res, await imageService.generate(prompt, { size: body.size, style, count: body.count }), 201);
  }),
);

r.put(
  '/images/:id',
  wrap((req, res) => {
    const body = z.object({ title: z.string().optional(), prompt: z.string().optional(), style: z.string().optional(), tags: z.string().optional() }).parse(req.body);
    ok(res, imageService.update(num(req.params.id), body));
  }),
);

r.delete(
  '/images/:id',
  wrap((req, res) => {
    imageService.remove(num(req.params.id));
    ok(res, { removed: true });
  }),
);

/* ---- 风格预设 ---- */

r.get('/images/presets', wrap((_req, res) => ok(res, imageService.presets())));

r.post(
  '/images/presets',
  wrap((req, res) => {
    const body = z
      .object({ name: z.string().min(1, '请填写预设名'), promptTemplate: z.string().optional(), negativePrompt: z.string().optional(), category: z.string().optional() })
      .parse(req.body);
    ok(res, imageService.createPreset(body as any), 201);
  }),
);

r.put(
  '/images/presets/:id',
  wrap((req, res) => ok(res, imageService.updatePreset(num(req.params.id), req.body))),
);

r.delete(
  '/images/presets/:id',
  wrap((req, res) => {
    imageService.removePreset(num(req.params.id));
    ok(res, { removed: true });
  }),
);

export default r;
