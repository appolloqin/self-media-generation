import { Router } from 'express';
import { z } from 'zod';
import { novelService } from '../services/novel.service.js';
import { articleService } from '../services/article.service.js';
import { ok, wrap, num, HttpError } from './helpers.js';
import { textToHtml } from '../utils/content.js';
import { NOVEL_THEMES } from '@smg/shared';

const r = Router();

/* ---------------- 小说 ---------------- */

r.get('/novels', wrap((_req, res) => ok(res, novelService.list())));

/** 必须在 `/novels/:id` 之前注册，否则 "themes" 会被当作 id */
r.get('/novels/themes', wrap((_req, res) => ok(res, NOVEL_THEMES)));

r.get(
  '/novels/:id',
  wrap((req, res) => {
    const id = num(req.params.id);
    const novel = novelService.get(id);
    if (!novel) throw new HttpError('小说不存在', 404);
    ok(res, {
      ...novel,
      volumes: novelService.volumes(id),
      characters: novelService.characters(id),
      chapters: novelService.chapters(id),
      foreshadows: novelService.foreshadows(id),
      memories: novelService.memories(id),
    });
  }),
);

const novelSchema = z.object({
  title: z.string().min(1, '书名不能为空'),
  genre: z.string().optional(),
  synopsis: z.string().optional(),
  worldSetting: z.string().optional(),
  style: z.string().optional(),
  theme: z.string().optional(),
  targetWords: z.number().int().min(1000).optional(),
});

r.post(
  '/novels',
  wrap(async (req, res) => ok(res, await novelService.create(novelSchema.parse(req.body)), 201)),
);

r.put(
  '/novels/:id',
  wrap((req, res) => ok(res, novelService.update(num(req.params.id), req.body))),
);

r.delete(
  '/novels/:id',
  wrap((req, res) => {
    novelService.remove(num(req.params.id));
    ok(res, { removed: true });
  }),
);

/* ---------------- 分卷 ---------------- */

r.post(
  '/novels/:id/volumes',
  wrap((req, res) => {
    const body = z.object({ title: z.string().min(1, '卷名不能为空'), summary: z.string().optional() }).parse(req.body);
    ok(res, novelService.addVolume(num(req.params.id), body.title, body.summary), 201);
  }),
);

r.put(
  '/novels/volumes/:id',
  wrap((req, res) => ok(res, novelService.updateVolume(num(req.params.id), req.body))),
);

r.delete(
  '/novels/volumes/:id',
  wrap((req, res) => {
    novelService.removeVolume(num(req.params.id));
    ok(res, { removed: true });
  }),
);

/* ---------------- 人物 ---------------- */

r.post(
  '/novels/:id/characters',
  wrap((req, res) => {
    const body = z.object({ name: z.string().min(1, '人物名不能为空') }).passthrough().parse(req.body);
    ok(res, novelService.addCharacter(num(req.params.id), body as any), 201);
  }),
);

r.put(
  '/novels/characters/:id',
  wrap((req, res) => ok(res, novelService.updateCharacter(num(req.params.id), req.body))),
);

r.delete(
  '/novels/characters/:id',
  wrap((req, res) => {
    novelService.removeCharacter(num(req.params.id));
    ok(res, { removed: true });
  }),
);

/* ---------------- 章节 ---------------- */

r.post(
  '/novels/:id/chapters',
  wrap((req, res) => {
    const body = z.object({ title: z.string().min(1, '章节标题不能为空'), outline: z.string().optional(), volumeId: z.number().int().nullish() }).parse(req.body);
    ok(res, novelService.addChapter(num(req.params.id), body as any), 201);
  }),
);

r.get(
  '/novels/chapters/:id',
  wrap((req, res) => {
    const chapter = novelService.getChapter(num(req.params.id));
    if (!chapter) throw new HttpError('章节不存在', 404);
    ok(res, chapter);
  }),
);

r.put(
  '/novels/chapters/:id',
  wrap((req, res) => ok(res, novelService.updateChapter(num(req.params.id), req.body))),
);

r.delete(
  '/novels/chapters/:id',
  wrap((req, res) => {
    novelService.removeChapter(num(req.params.id));
    ok(res, { removed: true });
  }),
);

r.post(
  '/novels/chapters/:id/write',
  wrap(async (req, res) => {
    const { words } = z.object({ words: z.number().int().min(300).max(8000).optional() }).parse(req.body ?? {});
    ok(res, await novelService.writeChapter(num(req.params.id), words ?? 2500));
  }),
);

r.post(
  '/novels/:id/plan-next',
  wrap(async (req, res) => {
    const { count } = z.object({ count: z.number().int().min(1).max(5).optional() }).parse(req.body ?? {});
    ok(res, await novelService.planNextChapter(num(req.params.id), count ?? 1), 201);
  }),
);

/** 章节一键转文章（用于番茄等平台发布） */
r.post(
  '/novels/chapters/:id/to-article',
  wrap((req, res) => {
    const chapter = novelService.getChapter(num(req.params.id));
    if (!chapter) throw new HttpError('章节不存在', 404);
    const novel = novelService.get(chapter.novelId);
    const { platform, format } = z
      .object({ platform: z.string().optional(), format: z.enum(['html', 'markdown', 'txt']).optional() })
      .parse(req.body ?? {});
    const fmt = format ?? 'txt';
    const content = fmt === 'html' ? textToHtml(chapter.content) : chapter.content;

    const article = articleService.create({
      title: `${novel?.title ?? ''} · ${chapter.title}`.trim(),
      content,
      topic: novel?.title ?? '',
      platform: platform ?? 'fanqie',
      category: '小说连载',
      format: fmt,
      source: 'novel',
      status: 'draft',
    });
    ok(res, article, 201);
  }),
);

/* ---------------- 伏笔 / 记忆 ---------------- */

r.post(
  '/novels/:id/foreshadows',
  wrap((req, res) => {
    const body = z.object({ name: z.string().min(1, '伏笔名不能为空') }).passthrough().parse(req.body);
    const id = novelService.addForeshadow(num(req.params.id), body as any);
    ok(res, { id }, 201);
  }),
);

r.put(
  '/novels/foreshadows/:id',
  wrap((req, res) => {
    novelService.updateForeshadow(num(req.params.id), req.body);
    ok(res, { updated: true });
  }),
);

r.delete(
  '/novels/foreshadows/:id',
  wrap((req, res) => {
    novelService.removeForeshadow(num(req.params.id));
    ok(res, { removed: true });
  }),
);

r.post(
  '/novels/:id/memories',
  wrap((req, res) => {
    const body = z.object({ title: z.string().min(1), content: z.string().min(1) }).passthrough().parse(req.body);
    const id = novelService.addMemory(num(req.params.id), body as any);
    ok(res, { id }, 201);
  }),
);

r.delete(
  '/novels/memories/:id',
  wrap((req, res) => {
    novelService.removeMemory(num(req.params.id));
    ok(res, { removed: true });
  }),
);

r.post(
  '/novels/:id/distill',
  wrap(async (req, res) => {
    const ids = await novelService.distillMemories(num(req.params.id));
    ok(res, { created: ids.length, ids });
  }),
);

export default r;
