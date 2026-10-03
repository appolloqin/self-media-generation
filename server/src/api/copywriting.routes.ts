import { Router } from 'express';
import { z } from 'zod';
import { copywritingService } from '../services/copywriting.service.js';
import { articleService } from '../services/article.service.js';
import { markdownToHtml } from '../utils/content.js';
import { ok, wrap, num, HttpError } from './helpers.js';

const r = Router();

r.get(
  '/copywriting/scenes',
  wrap((req, res) => {
    const category = req.query.category as string | undefined;
    const scenes = copywritingService.list(category);
    ok(
      res,
      scenes.map((s) => ({ ...s, knobs: copywritingService.knobs(s.id) })),
    );
  }),
);

r.get(
  '/copywriting/scenes/:id',
  wrap((req, res) => {
    const id = num(req.params.id);
    const scene = copywritingService.get(id);
    if (!scene) throw new HttpError('场景不存在', 404);
    ok(res, { ...scene, knobs: copywritingService.knobs(id), presets: copywritingService.presets(id) });
  }),
);

const sceneSchema = z.object({
  name: z.string().min(1, '场景名不能为空'),
  category: z.string().min(1),
  categoryLabel: z.string().min(1),
  description: z.string().optional(),
  structure: z.string().optional(),
  hooks: z.string().optional(),
  tone: z.string().optional(),
  forbidden: z.string().optional(),
  compliance: z.string().optional(),
  needLineBreak: z.boolean().optional(),
});

r.post(
  '/copywriting/scenes',
  wrap((req, res) => ok(res, copywritingService.create(sceneSchema.parse(req.body) as any), 201)),
);

r.put(
  '/copywriting/scenes/:id',
  wrap((req, res) => ok(res, copywritingService.update(num(req.params.id), req.body))),
);

r.delete(
  '/copywriting/scenes/:id',
  wrap((req, res) => {
    copywritingService.remove(num(req.params.id));
    ok(res, { removed: true });
  }),
);

r.put(
  '/copywriting/scenes/:id/knobs',
  wrap((req, res) => {
    const id = num(req.params.id);
    const body = z
      .object({
        knob: z.enum(['hook', 'emotion', 'rhythm', 'ending', 'colloquial']),
        values: z.array(z.string()).min(1, '至少提供一个档位'),
      })
      .parse(req.body);
    ok(res, copywritingService.setKnobs(id, body));
  }),
);

const generateSchema = z.object({
  sceneId: z.number().int().positive(),
  mode: z.enum(['original', 'imitate', 'transform']).default('original'),
  topic: z.string().min(1, '请填写主题'),
  referenceContent: z.string().optional(),
  targetForm: z.string().optional(),
  knobs: z.record(z.string()).optional(),
});

r.post(
  '/copywriting/generate',
  wrap(async (req, res) => {
    const body = generateSchema.parse(req.body);
    const result = await copywritingService.generate(body as any);
    ok(res, result);
  }),
);

r.post(
  '/copywriting/evaluate',
  wrap((req, res) => {
    const { content, sceneId } = z
      .object({ content: z.string().min(1), sceneId: z.number().int().positive() })
      .parse(req.body);
    const scene = copywritingService.get(sceneId);
    if (!scene) throw new HttpError('场景不存在', 404);
    ok(res, copywritingService.evaluate({ content, scene, knobs: [] }));
  }),
);

/* ---- 成品沉淀 ---- */

r.get(
  '/copywriting/scenes/:id/presets',
  wrap((req, res) => ok(res, copywritingService.presets(num(req.params.id)))),
);

r.post(
  '/copywriting/scenes/:id/presets',
  wrap((req, res) => {
    const id = num(req.params.id);
    const body = z
      .object({ title: z.string().min(1, '请填写标题'), body: z.string().min(1), structure: z.string().optional(), hooks: z.string().optional(), source: z.string().optional() })
      .parse(req.body);
    ok(res, { id: copywritingService.addPreset({ sceneId: id, ...(body as any) }) }, 201);
  }),
);

r.delete(
  '/copywriting/presets/:id',
  wrap((req, res) => {
    copywritingService.removePreset(num(req.params.id));
    ok(res, { removed: true });
  }),
);

/* ---- 转文章 ---- */

r.post(
  '/copywriting/to-article',
  wrap((req, res) => {
    const { content, title, sceneId, platform, format } = z
      .object({
        content: z.string().min(1, '内容不能为空'),
        title: z.string().min(1, '标题不能为空'),
        sceneId: z.number().int().positive().optional(),
        platform: z.string().optional(),
        format: z.enum(['html', 'markdown', 'txt']).optional(),
      })
      .parse(req.body);

    const scene = sceneId ? copywritingService.get(sceneId) : undefined;
    const fmt = format ?? 'html';
    const html = fmt === 'markdown' ? markdownToHtml(content) : fmt === 'txt' ? content : `<p style="line-height:1.9;">${content.replace(/\n/g, '</p><p style="line-height:1.9;">')}</p>`;

    const article = articleService.create({
      title,
      content: html,
      topic: title,
      platform: platform ?? 'wechat',
      category: scene?.name ?? '文案武库',
      format: fmt,
      source: 'copywriting',
      sceneId: sceneId ?? null,
      status: 'draft',
    });
    ok(res, article, 201);
  }),
);

export default r;
