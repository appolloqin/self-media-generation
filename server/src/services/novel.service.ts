import { NOVEL_THEMES } from '@smg/shared';
import { query, queryOne, run } from '../db/connection.js';
import { llmService } from './llm.service.js';
import { logger } from '../core/logger.js';
import { countWords, stripTags } from '../utils/content.js';
import type { Novel, NovelChapter, NovelCharacter, NovelForeshadow, NovelMemory, NovelVolume } from '@smg/shared';

const NOVEL_COLS = `id, title, genre, synopsis, world_setting AS worldSetting, style, theme,
  status, target_words AS targetWords, finished_words AS finishedWords,
  created_at AS createdAt, updated_at AS updatedAt`;

const CHAPTER_COLS = `id, novel_id AS novelId, volume_id AS volumeId, title, outline, content,
  word_count AS wordCount, status, order_index AS orderIndex,
  created_at AS createdAt, updated_at AS updatedAt`;

const CHAR_COLS = `id, novel_id AS novelId, name, role, appearance, personality, background,
  motivation, speech_style AS speechStyle, arc, order_index AS orderIndex, created_at AS createdAt`;

type CreateNovelInput = {
  title: string;
  genre?: string;
  synopsis?: string;
  worldSetting?: string;
  style?: string;
  theme?: string;
  targetWords?: number;
};

/** 用 LLM 生成小说的世界观与人物档案 */
async function bootstrapWorld(novel: Novel) {
  const sys = `你是资深网络文学策划师，擅长在开书前搭建世界观与人物体系。
只输出 JSON，不要任何解释：
{
  "worldSetting": "世界观设定，300字以内",
  "synopsis": "一句话故事梗概",
  "characters": [
    { "name":"姓名","role":"定位","appearance":"外貌","personality":"性格",
      "background":"背景","motivation":"动机","speechStyle":"语言风格","arc":"成长弧线" }
  ],
  "foreshadows": [ { "name":"伏笔名","description":"伏笔内容" } ]
}`;

  const user = `书名：${novel.title}
题材：${novel.genre || '未指定'}
风格：${novel.style || '未指定'}
已有梗概：${novel.synopsis || '无'}

请生成完整的世界观、3~5 个核心人物与 2~3 条伏笔。`;

  const raw = await llmService.chat({ system: sys, user, temperature: 0.85, json: true, maxTokens: 4000 });
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

class NovelService {
  list(): Novel[] {
    return query<Novel>(`SELECT ${NOVEL_COLS} FROM novels ORDER BY updated_at DESC`);
  }

  get(id: number): Novel | undefined {
    return queryOne<Novel>(`SELECT ${NOVEL_COLS} FROM novels WHERE id = ?`, [id]);
  }

  async create(input: CreateNovelInput): Promise<Novel> {
    const res = run(
      `INSERT INTO novels (title, genre, synopsis, world_setting, style, theme, target_words)
       VALUES (?,?,?,?,?,?,?)`,
      [
        input.title,
        input.genre ?? '',
        input.synopsis ?? '',
        input.worldSetting ?? '',
        input.style ?? '',
        input.theme ?? 'paper',
        input.targetWords ?? 200000,
      ],
    );
    const id = Number(res.lastInsertRowid);
    const novel = this.get(id)!;

    if (configlessBootstrap(input)) {
      try {
        const world = await bootstrapWorld(novel);
        if (world) {
          run(
            `UPDATE novels SET synopsis = ?, world_setting = ? WHERE id = ?`,
            [world.synopsis || novel.synopsis, world.worldSetting || novel.worldSetting, id],
          );
          for (const c of (world.characters ?? []).slice(0, 6)) {
            this.addCharacter(id, c);
          }
          for (const f of (world.foreshadows ?? []).slice(0, 4)) {
            run(
              'INSERT INTO novel_foreshadows (novel_id, name, description, status) VALUES (?,?,?,?)',
              [id, f.name ?? '伏笔', f.description ?? '', 'planted'],
            );
          }
          logger.success(`《${novel.title}》世界观与人物已生成`);
        }
      } catch (err) {
        logger.warn(`世界观生成失败，可稍后手动补充：${(err as Error).message}`);
      }
    }

    return this.get(id)!;
  }

  update(id: number, patch: Partial<Novel>): Novel {
    const cur = this.get(id);
    if (!cur) throw new Error('小说不存在');
    run(
      `UPDATE novels SET title=?, genre=?, synopsis=?, world_setting=?, style=?, theme=?,
              status=?, target_words=?, updated_at=datetime('now','localtime')
       WHERE id = ?`,
      [
        patch.title ?? cur.title,
        patch.genre ?? cur.genre,
        patch.synopsis ?? cur.synopsis,
        patch.worldSetting ?? cur.worldSetting,
        patch.style ?? cur.style,
        patch.theme ?? cur.theme,
        patch.status ?? cur.status,
        patch.targetWords ?? cur.targetWords,
        id,
      ],
    );
    this.recalcWords(id);
    return this.get(id)!;
  }

  remove(id: number) {
    if (!this.get(id)) throw new Error('小说不存在');
    run('DELETE FROM novels WHERE id = ?', [id]);
  }

  /* ---------------- 卷 ---------------- */

  volumes(novelId: number): NovelVolume[] {
    return query<NovelVolume>(
      `SELECT id, novel_id AS novelId, title, summary, order_index AS orderIndex, created_at AS createdAt
       FROM novel_volumes WHERE novel_id = ? ORDER BY order_index, id`,
      [novelId],
    );
  }

  addVolume(novelId: number, title: string, summary = ''): NovelVolume {
    const next =
      (queryOne<{ m: number }>('SELECT COALESCE(MAX(order_index),-1) as m FROM novel_volumes WHERE novel_id = ?', [novelId])
        ?.m ?? -1) + 1;
    const res = run('INSERT INTO novel_volumes (novel_id, title, summary, order_index) VALUES (?,?,?,?)', [
      novelId,
      title,
      summary,
      next,
    ]);
    return queryOne<NovelVolume>(
      `SELECT id, novel_id AS novelId, title, summary, order_index AS orderIndex, created_at AS createdAt
       FROM novel_volumes WHERE id = ?`,
      [Number(res.lastInsertRowid)],
    )!;
  }

  updateVolume(id: number, patch: { title?: string; summary?: string; orderIndex?: number }) {
    const cur = queryOne<any>('SELECT * FROM novel_volumes WHERE id = ?', [id]);
    if (!cur) throw new Error('卷不存在');
    run('UPDATE novel_volumes SET title=?, summary=?, order_index=? WHERE id = ?', [
      patch.title ?? cur.title,
      patch.summary ?? cur.summary,
      patch.orderIndex ?? cur.order_index,
      id,
    ]);
    return this.volumes(cur.novel_id);
  }

  removeVolume(id: number) {
    run('UPDATE novel_chapters SET volume_id = NULL WHERE volume_id = ?', [id]);
    run('DELETE FROM novel_volumes WHERE id = ?', [id]);
  }

  /* ---------------- 人物 ---------------- */

  characters(novelId: number): NovelCharacter[] {
    return query<NovelCharacter>(`SELECT ${CHAR_COLS} FROM novel_characters WHERE novel_id = ? ORDER BY order_index, id`, [novelId]);
  }

  addCharacter(novelId: number, data: Partial<NovelCharacter> & { name: string }): NovelCharacter {
    const next =
      (queryOne<{ m: number }>('SELECT COALESCE(MAX(order_index),-1) as m FROM novel_characters WHERE novel_id = ?', [novelId])
        ?.m ?? -1) + 1;
    const res = run(
      `INSERT INTO novel_characters (novel_id, name, role, appearance, personality, background,
         motivation, speech_style, arc, order_index)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        novelId,
        data.name,
        data.role ?? '',
        data.appearance ?? '',
        data.personality ?? '',
        data.background ?? '',
        data.motivation ?? '',
        data.speechStyle ?? '',
        data.arc ?? '',
        next,
      ],
    );
    return queryOne<NovelCharacter>(`SELECT ${CHAR_COLS} FROM novel_characters WHERE id = ?`, [
      Number(res.lastInsertRowid),
    ])!;
  }

  updateCharacter(id: number, patch: Partial<NovelCharacter>) {
    const cur = queryOne<any>('SELECT * FROM novel_characters WHERE id = ?', [id]);
    if (!cur) throw new Error('人物不存在');
    run(
      `UPDATE novel_characters SET name=?, role=?, appearance=?, personality=?, background=?,
              motivation=?, speech_style=?, arc=?, order_index=?, updated_at=datetime('now','localtime')
       WHERE id = ?`,
      [
        patch.name ?? cur.name,
        patch.role ?? cur.role,
        patch.appearance ?? cur.appearance,
        patch.personality ?? cur.personality,
        patch.background ?? cur.background,
        patch.motivation ?? cur.motivation,
        patch.speechStyle ?? cur.speech_style,
        patch.arc ?? cur.arc,
        patch.orderIndex ?? cur.order_index,
        id,
      ],
    );
    return this.characters(cur.novel_id);
  }

  removeCharacter(id: number) {
    run('DELETE FROM novel_characters WHERE id = ?', [id]);
  }

  /* ---------------- 章节 ---------------- */

  chapters(novelId: number, withContent = false): NovelChapter[] {
    const cols = withContent ? CHAPTER_COLS : CHAPTER_COLS.replace('content,', "'' AS content,");
    return query<NovelChapter>(
      `SELECT ${cols} FROM novel_chapters WHERE novel_id = ? ORDER BY order_index, id`,
      [novelId],
    );
  }

  getChapter(id: number): NovelChapter | undefined {
    return queryOne<NovelChapter>(`SELECT ${CHAPTER_COLS} FROM novel_chapters WHERE id = ?`, [id]);
  }

  addChapter(novelId: number, data: { title: string; outline?: string; volumeId?: number | null }): NovelChapter {
    const next =
      (queryOne<{ m: number }>('SELECT COALESCE(MAX(order_index),-1) as m FROM novel_chapters WHERE novel_id = ?', [novelId])
        ?.m ?? -1) + 1;
    const res = run(
      'INSERT INTO novel_chapters (novel_id, volume_id, title, outline, status, order_index) VALUES (?,?,?,?,?,?)',
      [novelId, data.volumeId ?? null, data.title, data.outline ?? '', 'outline', next],
    );
    return this.getChapter(Number(res.lastInsertRowid))!;
  }

  updateChapter(id: number, patch: Partial<NovelChapter>): NovelChapter {
    const cur = this.getChapter(id);
    if (!cur) throw new Error('章节不存在');
    const content = patch.content ?? cur.content;
    run(
      `UPDATE novel_chapters SET title=?, outline=?, content=?, word_count=?, status=?,
              volume_id=?, order_index=?, updated_at=datetime('now','localtime')
       WHERE id = ?`,
      [
        patch.title ?? cur.title,
        patch.outline ?? cur.outline,
        content,
        countWords(content),
        patch.status ?? cur.status,
        patch.volumeId === undefined ? cur.volumeId : patch.volumeId,
        patch.orderIndex ?? cur.orderIndex,
        id,
      ],
    );
    this.recalcWords(cur.novelId);
    return this.getChapter(id)!;
  }

  removeChapter(id: number) {
    const cur = this.getChapter(id);
    if (!cur) throw new Error('章节不存在');
    run('DELETE FROM novel_chapters WHERE id = ?', [id]);
    this.recalcWords(cur.novelId);
  }

  /** LLM 生成章节正文（带人物与伏笔上下文） */
  async writeChapter(chapterId: number, targetWords = 2500): Promise<NovelChapter> {
    const chapter = this.getChapter(chapterId);
    if (!chapter) throw new Error('章节不存在');
    const novel = this.get(chapter.novelId);
    if (!novel) throw new Error('小说不存在');

    const chars = this.characters(novel.id);
    const foreshadows = this.foreshadows(novel.id);
    const recent = query<{ title: string; content: string }>(
      `SELECT title, content FROM novel_chapters
       WHERE novel_id = ? AND id != ? AND content != '' ORDER BY order_index DESC LIMIT 2`,
      [novel.id, chapterId],
    );
    const memory = this.memories(novel.id, 'global');

    const sys = [
      `你是「${novel.title}」的执笔作者。${novel.style ? `文风要求：${novel.style}` : ''}`,
      '直接输出章节正文，不要任何解释、标题行或总结。',
      '',
      '## 铁律',
      '- 视角严格统一，禁止中途跳视角',
      '- 人物言行必须符合其设定',
      '- 对话推动剧情，避免大段独白',
      '- 场景要有具体感官细节（视觉、听觉、触觉）',
      '- 禁止使用「综上所述」「值得注意的是」等 AI 味词汇',
      `- 本章目标 ${targetWords} 字左右`,
    ].join('\n');

    const user = [
      `书名：${novel.title}｜题材：${novel.genre}`,
      novel.worldSetting ? `\n世界观：${novel.worldSetting}` : '',
      chars.length
        ? `\n人物设定：\n${chars.map((c) => `- ${c.name}（${c.role}）：${c.personality}；口头禅/语气：${c.speechStyle}`).join('\n')}`
        : '',
      foreshadows.length
        ? `\n待回收伏笔：\n${foreshadows.filter((f) => f.status === 'planted').map((f) => `- ${f.name}：${f.description}`).join('\n')}`
        : '',
      memory.length ? `\n全局设定备忘：\n${memory.map((m) => `- ${m.title}：${m.content}`).join('\n')}` : '',
      recent.length
        ? `\n前情提要：\n${recent.map((c) => `${c.title}：${stripTags(c.content).slice(-300)}`).join('\n')}`
        : '',
      `\n本章标题：${chapter.title}`,
      chapter.outline ? `\n本章大纲：${chapter.outline}` : '',
      '\n请输出本章正文。',
    ]
      .filter(Boolean)
      .join('\n');

    const content = await llmService.chat({ system: sys, user, temperature: 0.9, maxTokens: targetWords * 3 });
    return this.updateChapter(chapterId, { content, status: 'draft' });
  }

  /** LLM 生成下一章大纲 */
  async planNextChapter(novelId: number, count = 1): Promise<NovelChapter[]> {
    const novel = this.get(novelId);
    if (!novel) throw new Error('小说不存在');
    const last = this.chapters(novelId).slice(-1)[0];
    const foreshadows = this.foreshadows(novelId).filter((f) => f.status === 'planted');

    const raw = await llmService.chat({
      system: `你是网络小说大纲师。只输出 JSON 数组：
[{"title":"章节标题","outline":"200字左右的章节大纲，包含冲突与转折"}]`,
      user: `《${novel.title}》题材：${novel.genre}
${last ? `上一章：${last.title}——${last.outline || stripTags(last.content).slice(0, 200)}` : '尚未开写'}
${foreshadows.length ? `待回收伏笔：${foreshadows.map((f) => f.name).join('、')}` : ''}
请规划接下来 ${count} 章。`,
      temperature: 0.9,
      json: true,
      maxTokens: 2000,
    });

    const m = raw.match(/\[[\s\S]*\]/);
    let parsed: any[] = [];
    try {
      parsed = m ? JSON.parse(m[0]) : [];
    } catch {
      parsed = [];
    }

    return parsed
      .filter((x) => x?.title)
      .slice(0, count)
      .map((x) => this.addChapter(novelId, { title: x.title, outline: x.outline ?? '' }));
  }

  /* ---------------- 伏笔 ---------------- */

  foreshadows(novelId: number): NovelForeshadow[] {
    return query<NovelForeshadow>(
      `SELECT id, novel_id AS novelId, name, description, plant_chapter AS plantChapter,
              payoff_chapter AS payoffChapter, status, created_at AS createdAt
       FROM novel_foreshadows WHERE novel_id = ? ORDER BY id`,
      [novelId],
    );
  }

  addForeshadow(novelId: number, data: Partial<NovelForeshadow> & { name: string }) {
    const res = run(
      'INSERT INTO novel_foreshadows (novel_id, name, description, plant_chapter, payoff_chapter, status) VALUES (?,?,?,?,?,?)',
      [novelId, data.name, data.description ?? '', data.plantChapter ?? '', data.payoffChapter ?? '', data.status ?? 'planted'],
    );
    return Number(res.lastInsertRowid);
  }

  updateForeshadow(id: number, patch: Partial<NovelForeshadow>) {
    const cur = queryOne<any>('SELECT * FROM novel_foreshadows WHERE id = ?', [id]);
    if (!cur) throw new Error('伏笔不存在');
    run(
      'UPDATE novel_foreshadows SET name=?, description=?, plant_chapter=?, payoff_chapter=?, status=? WHERE id = ?',
      [
        patch.name ?? cur.name,
        patch.description ?? cur.description,
        patch.plantChapter ?? cur.plant_chapter,
        patch.payoffChapter ?? cur.payoff_chapter,
        patch.status ?? cur.status,
        id,
      ],
    );
  }

  removeForeshadow(id: number) {
    run('DELETE FROM novel_foreshadows WHERE id = ?', [id]);
  }

  /* ---------------- 记忆 ---------------- */

  memories(novelId: number, scope?: NovelMemory['scope']): NovelMemory[] {
    return scope
      ? query<NovelMemory>(
          `SELECT id, novel_id AS novelId, scope, title, content, weight, created_at AS createdAt
           FROM novel_memories WHERE novel_id = ? AND scope = ? ORDER BY weight DESC, id`,
          [novelId, scope],
        )
      : query<NovelMemory>(
          `SELECT id, novel_id AS novelId, scope, title, content, weight, created_at AS createdAt
           FROM novel_memories WHERE novel_id = ? ORDER BY scope, weight DESC, id`,
          [novelId],
        );
  }

  addMemory(novelId: number, data: { scope?: NovelMemory['scope']; title: string; content: string; weight?: number }) {
    const res = run(
      'INSERT INTO novel_memories (novel_id, scope, title, content, weight) VALUES (?,?,?,?,?)',
      [novelId, data.scope ?? 'short', data.title, data.content, data.weight ?? 1],
    );
    return Number(res.lastInsertRowid);
  }

  removeMemory(id: number) {
    run('DELETE FROM novel_memories WHERE id = ?', [id]);
  }

  /** 从已完成章节自动抽取记忆（LLM 摘要） */
  async distillMemories(novelId: number) {
    const chapters = query<{ id: number; title: string; content: string }>(
      `SELECT id, title, content FROM novel_chapters
       WHERE novel_id = ? AND content != '' ORDER BY order_index DESC LIMIT 5`,
      [novelId],
    );
    if (!chapters.length) throw new Error('暂无已写章节内容');

    const raw = await llmService.chat({
      system: `你是小说连续性管理员。只输出 JSON 数组：
[{"scope":"short|mid|global","title":"记忆标题","content":"内容","weight":1.0}]`,
      user: `以下是最近章节，请提炼需要长期记住的设定与剧情：
${chapters.map((c) => `## ${c.title}\n${stripTags(c.content).slice(0, 1500)}`).join('\n\n')}`,
      temperature: 0.5,
      json: true,
      maxTokens: 2000,
    });

    const m = raw.match(/\[[\s\S]*\]/);
    let parsed: any[] = [];
    try {
      parsed = m ? JSON.parse(m[0]) : [];
    } catch {
      parsed = [];
    }

    const ids: number[] = [];
    for (const x of parsed.slice(0, 10)) {
      if (!x?.title) continue;
      ids.push(
        this.addMemory(novelId, {
          scope: x.scope,
          title: x.title,
          content: String(x.content ?? ''),
          weight: Number(x.weight ?? 1),
        }),
      );
    }
    return ids;
  }

  static get themes() {
    return NOVEL_THEMES;
  }

  private recalcWords(novelId: number) {
    const total = queryOne<{ w: number }>(
      'SELECT COALESCE(SUM(word_count),0) as w FROM novel_chapters WHERE novel_id = ?',
      [novelId],
    )?.w ?? 0;
    run(`UPDATE novels SET finished_words = ?, updated_at = datetime('now','localtime') WHERE id = ?`, [
      total,
      novelId,
    ]);
  }
}

function configlessBootstrap(input: CreateNovelInput): boolean {
  return Boolean(input.title?.trim());
}

export const novelService = new NovelService();
