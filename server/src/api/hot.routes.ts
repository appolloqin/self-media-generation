import { Router } from 'express';
import { z } from 'zod';
import { hotNewsService } from '../services/hotnews.service.js';
import { ok, wrap, intParam, num, HttpError } from './helpers.js';

const r = Router();

r.get(
  '/hot/list',
  wrap(async (req, res) => {
    const limit = intParam(req.query.limit, 15, 1, 50);
    const groups = await hotNewsService.fetchAll(limit);
    ok(res, groups);
  }),
);

r.get(
  '/hot/black-horses',
  wrap(async (req, res) => {
    const limit = intParam(req.query.limit, 15, 1, 50);
    const topN = intParam(req.query.topN, 10, 1, 50);
    const groups = await hotNewsService.fetchAll(limit);
    ok(res, hotNewsService.findBlackHorses(groups, topN));
  }),
);

r.get(
  '/hot/trend',
  wrap(async (req, res) => {
    const limit = intParam(req.query.limit, 15, 1, 50);
    const groups = await hotNewsService.fetchAll(limit);
    ok(res, hotNewsService.predictTrend(groups));
  }),
);

r.get(
  '/hot/pick',
  wrap(async (req, res) => {
    const cnt = intParam(req.query.count, 5, 1, 30);
    ok(res, await hotNewsService.pickTopic(cnt));
  }),
);

r.post(
  '/hot/refresh',
  wrap((_req, res) => {
    hotNewsService.clearCache();
    ok(res, { cleared: true });
  }),
);

/* ---------------- 选题灵感 ---------------- */

const ideaSchema = z.object({
  keyword: z.string().min(1, '请输入关键词'),
  count: z.number().int().min(1).max(10).optional().default(6),
});

r.post(
  '/hot/ideas/generate',
  wrap(async (req, res) => {
    const body = ideaSchema.parse(req.body);
    const { libraryService } = await import('../services/library.service.js');
    ok(res, await libraryService.generateIdeas(body.keyword, body.count));
  }),
);

r.get(
  '/hot/ideas',
  wrap(async (req, res) => {
    const { libraryService } = await import('../services/library.service.js');
    ok(res, libraryService.ideas(intParam(req.query.limit, 30, 1, 100)));
  }),
);

r.patch(
  '/hot/ideas/:id',
  wrap(async (req, res) => {
    const { status } = req.body as { status: number };
    (await import('../services/library.service.js')).libraryService.setIdeaStatus(num(req.params.id), status);
    ok(res, { updated: true });
  }),
);

r.delete(
  '/hot/ideas/:id',
  wrap(async (req, res) => {
    (await import('../services/library.service.js')).libraryService.removeIdea(num(req.params.id));
    ok(res, { removed: true });
  }),
);

r.post(
  '/hot/use',
  wrap(async (req, res) => {
    const { topic, count } = req.body as { topic?: string; count?: number };
    if (topic?.trim()) {
      return ok(res, { platform: '手动输入', topic: topic.trim() });
    }
    const picked = await hotNewsService.pickTopic(intParam(count, 5, 1, 30));
    if (!picked.topic) throw new HttpError('暂无可用热点，请稍后重试');
    ok(res, picked);
  }),
);

export default r;
