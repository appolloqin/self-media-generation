import { Router } from 'express';
import { z } from 'zod';
import { templateService, DEFAULT_TEMPLATE } from '../services/template.service.js';
import { trackService } from '../services/track.service.js';
import { ok, wrap, num, HttpError } from './helpers.js';

const r = Router();

/* ================= 模板 ================= */

r.get(
  '/templates/categories',
  wrap((_req, res) => ok(res, templateService.listCategories())),
);

r.get(
  '/templates',
  wrap((req, res) => {
    const category = req.query.category as string | undefined;
    ok(res, templateService.list(category));
  }),
);

/** 必须在 `/templates/:id` 之前注册 */
r.get(
  '/templates/default/preview',
  wrap((_req, res) => ok(res, { content: DEFAULT_TEMPLATE })),
);

r.get(
  '/templates/:id',
  wrap((req, res) => {
    const tpl = templateService.get(num(req.params.id));
    if (!tpl) throw new HttpError('模板不存在', 404);
    ok(res, tpl);
  }),
);

r.post(
  '/templates',
  wrap((req, res) => {
    const body = z
      .object({ name: z.string().min(1, '模板名不能为空'), category: z.string().min(1, '请选择分类'), content: z.string().optional() })
      .parse(req.body);
    ok(res, templateService.create(body), 201);
  }),
);

r.put(
  '/templates/:id',
  wrap((req, res) => {
    const body = z
      .object({ name: z.string().optional(), category: z.string().optional(), content: z.string().optional() })
      .parse(req.body);
    ok(res, templateService.update(num(req.params.id), body));
  }),
);

r.delete(
  '/templates/:id',
  wrap((req, res) => {
    templateService.remove(num(req.params.id));
    ok(res, { removed: true });
  }),
);

r.post(
  '/templates/:id/copy',
  wrap((req, res) => {
    const { name, category } = z
      .object({ name: z.string().min(1, '请填写新模板名'), category: z.string().min(1, '请选择目标分类') })
      .parse(req.body);
    ok(res, templateService.copy(num(req.params.id), name, category), 201);
  }),
);

r.post(
  '/templates/:id/move',
  wrap((req, res) => {
    const { category } = z.object({ category: z.string().min(1) }).parse(req.body);
    ok(res, templateService.move(num(req.params.id), category));
  }),
);

r.post(
  '/template-categories',
  wrap((req, res) => {
    const { name } = z.object({ name: z.string().min(1, '分类名不能为空') }).parse(req.body);
    templateService.createCategory(name);
    ok(res, templateService.listCategories(), 201);
  }),
);

r.put(
  '/template-categories/:name',
  wrap((req, res) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    ok(res, templateService.renameCategory(decodeURIComponent(req.params.name), name));
  }),
);

r.delete(
  '/template-categories/:name',
  wrap((req, res) => {
    const force = req.query.force === '1';
    templateService.deleteCategory(decodeURIComponent(req.params.name), force);
    ok(res, { removed: true });
  }),
);

/* ================= 专家赛道 ================= */

r.get(
  '/tracks',
  wrap((req, res) => ok(res, trackService.list(req.query.enabled === '1'))),
);

r.get(
  '/tracks/:id',
  wrap((req, res) => {
    const track = trackService.get(num(req.params.id));
    if (!track) throw new HttpError('赛道不存在', 404);
    ok(res, { ...track, templates: trackService.templates(track.id) });
  }),
);

const trackSchema = z.object({
  name: z.string().min(1, '赛道名不能为空'),
  slug: z.string().optional(),
  description: z.string().optional(),
  audience: z.string().optional(),
  boundary: z.string().optional(),
  structure: z.string().optional(),
  style: z.string().optional(),
  qualityBar: z.string().optional(),
  compliance: z.string().optional(),
  examples: z.string().optional(),
  defaultParams: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

r.post(
  '/tracks',
  wrap((req, res) => ok(res, trackService.create(trackSchema.parse(req.body) as any), 201)),
);

r.put(
  '/tracks/:id',
  wrap((req, res) => ok(res, trackService.update(num(req.params.id), req.body))),
);

r.delete(
  '/tracks/:id',
  wrap((req, res) => {
    trackService.remove(num(req.params.id));
    ok(res, { removed: true });
  }),
);

r.post(
  '/tracks/:id/copy',
  wrap((req, res) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    ok(res, trackService.copy(num(req.params.id), name), 201);
  }),
);

/* ---- 赛道模板 ---- */

r.get(
  '/track-templates',
  wrap((req, res) => {
    const trackId = req.query.trackId ? num(req.query.trackId, 'trackId') : undefined;
    ok(res, trackService.templates(trackId));
  }),
);

const tplSchema = z.object({
  trackId: z.number().int().positive(),
  name: z.string().min(1, '模板名不能为空'),
  audience: z.string().optional(),
  depth: z.enum(['basic', 'standard', 'deep']).optional(),
  platform: z.string().optional(),
  style: z.string().optional(),
  strategy: z.string().optional(),
  wordMin: z.number().int().min(100).optional(),
  wordMax: z.number().int().min(200).optional(),
});

r.post(
  '/track-templates',
  wrap((req, res) => ok(res, trackService.createTemplate(tplSchema.parse(req.body) as any), 201)),
);

r.put(
  '/track-templates/:id',
  wrap((req, res) => ok(res, trackService.updateTemplate(num(req.params.id), req.body))),
);

r.delete(
  '/track-templates/:id',
  wrap((req, res) => {
    trackService.removeTemplate(num(req.params.id));
    ok(res, { removed: true });
  }),
);

r.put(
  '/tracks/:id/templates',
  wrap((req, res) => {
    const { templates } = z.object({ templates: z.array(z.record(z.unknown())) }).parse(req.body);
    ok(res, trackService.replaceTemplates(num(req.params.id), templates as any));
  }),
);

export default r;
