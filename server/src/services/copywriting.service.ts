import { getDb, query, queryOne, run } from '../db/connection.js';
import { llmService } from './llm.service.js';
import { logger } from '../core/logger.js';
import { scoreAiFlavor } from './deai.service.js';
import type { CopywritingGenerateRequest, CopywritingKnob, CopywritingQuality, CopywritingScene } from '@smg/shared';

const SCENE_COLS = `id, name, category, category_label AS categoryLabel, description, structure,
  hooks, tone, forbidden, compliance, need_line_break AS needLineBreak, built_in AS builtIn,
  enabled, created_at AS createdAt, updated_at AS updatedAt`;

const KNOB_LABELS: Record<CopywritingKnob, string> = {
  hook: '开头钩子',
  emotion: '情绪基调',
  rhythm: '节奏',
  ending: '结尾方式',
  colloquial: '口语度',
};

export type KnobValue = { knob: CopywritingKnob; label: string; value: string };

type QualityInput = { content: string; scene: CopywritingScene; knobs: KnobValue[] };

class CopywritingService {
  list(category?: string): CopywritingScene[] {
    return category
      ? query<CopywritingScene>(
          `SELECT ${SCENE_COLS} FROM copywriting_scenes WHERE category = ? ORDER BY id`,
          [category],
        )
      : query<CopywritingScene>(`SELECT ${SCENE_COLS} FROM copywriting_scenes ORDER BY category, id`);
  }

  get(id: number): CopywritingScene | undefined {
    return queryOne<CopywritingScene>(`SELECT ${SCENE_COLS} FROM copywriting_scenes WHERE id = ?`, [id]);
  }

  knobs(sceneId: number): KnobValue[] {
    const rows = query<{ knob: string; value: string }>(
      'SELECT knob, value FROM copywriting_knobs WHERE scene_id = ? ORDER BY knob, order_index',
      [sceneId],
    );
    return rows.map((r) => ({
      knob: r.knob as CopywritingKnob,
      label: KNOB_LABELS[r.knob as CopywritingKnob] ?? r.knob,
      value: r.value,
    }));
  }

  create(data: Partial<CopywritingScene> & { name: string; category: string; categoryLabel: string }) {
    const res = run(
      `INSERT INTO copywriting_scenes (name, category, category_label, description, structure,
        hooks, tone, forbidden, compliance, need_line_break, built_in, enabled)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,1)`,
      [
        data.name,
        data.category,
        data.categoryLabel,
        data.description ?? '',
        data.structure ?? '',
        data.hooks ?? '',
        data.tone ?? '',
        data.forbidden ?? '',
        data.compliance ?? '',
        data.needLineBreak ? 1 : 0,
      ],
    );
    return this.get(Number(res.lastInsertRowid))!;
  }

  update(id: number, patch: Partial<CopywritingScene>) {
    const cur = this.get(id);
    if (!cur) throw new Error('场景不存在');
    run(
      `UPDATE copywriting_scenes SET name=?, category=?, category_label=?, description=?, structure=?,
              hooks=?, tone=?, forbidden=?, compliance=?, need_line_break=?, enabled=?,
              updated_at=datetime('now','localtime')
       WHERE id = ?`,
      [
        patch.name ?? cur.name,
        patch.category ?? cur.category,
        patch.categoryLabel ?? cur.categoryLabel,
        patch.description ?? cur.description,
        patch.structure ?? cur.structure,
        patch.hooks ?? cur.hooks,
        patch.tone ?? cur.tone,
        patch.forbidden ?? cur.forbidden,
        patch.compliance ?? cur.compliance,
        patch.needLineBreak ?? cur.needLineBreak,
        patch.enabled ?? cur.enabled,
        id,
      ],
    );
    return this.get(id);
  }

  remove(id: number) {
    const cur = this.get(id);
    if (!cur) throw new Error('场景不存在');
    if (cur.builtIn) throw new Error('内置场景不可删除');
    run('DELETE FROM copywriting_scenes WHERE id = ?', [id]);
  }

  setKnobs(sceneId: number, knobs: { knob: CopywritingKnob; values: string[] }) {
    run('DELETE FROM copywriting_knobs WHERE scene_id = ? AND knob = ?', [sceneId, knobs.knob]);
    const stmt = getDb().prepare(
      'INSERT OR IGNORE INTO copywriting_knobs (scene_id, knob, label, value, order_index) VALUES (?,?,?,?,?)',
    );
    knobs.values.forEach((v, i) => stmt.run(sceneId, knobs.knob, KNOB_LABELS[knobs.knob] ?? knobs.knob, v, i));
    return this.knobs(sceneId);
  }

  /* ---------------- 成品沉淀 ---------------- */

  presets(sceneId: number) {
    return query<any>(
      `SELECT id, scene_id AS sceneId, title, structure, hooks, body, source, created_at AS createdAt
       FROM copywriting_presets WHERE scene_id = ? ORDER BY id DESC`,
      [sceneId],
    );
  }

  addPreset(data: { sceneId: number; title: string; structure?: string; hooks?: string; body: string; source?: string }) {
    const res = run(
      'INSERT INTO copywriting_presets (scene_id, title, structure, hooks, body, source) VALUES (?,?,?,?,?,?)',
      [data.sceneId, data.title, data.structure ?? '', data.hooks ?? '', data.body, data.source ?? 'imitate'],
    );
    return Number(res.lastInsertRowid);
  }

  removePreset(id: number) {
    run('DELETE FROM copywriting_presets WHERE id = ?', [id]);
  }

  /* ---------------- 生成 ---------------- */

  async generate(req: CopywritingGenerateRequest) {
    const scene = this.get(req.sceneId);
    if (!scene) throw new Error('文案场景不存在');
    if (!req.topic?.trim()) throw new Error('请填写主题');

    const knobList = Object.entries(req.knobs ?? {})
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => ({ knob: k as CopywritingKnob, label: KNOB_LABELS[k as CopywritingKnob] ?? k, value: String(v) }));

    const system = buildSystemPrompt(scene, knobList, req.mode);
    const user = buildUserPrompt(req, scene);

    const content = await llmService.chat({
      system,
      user,
      temperature: req.mode === 'imitate' ? 0.75 : 0.88,
      maxTokens: 6000,
    });

    const quality = this.evaluate({ content, scene, knobs: knobList });
    return { content, quality, scene, knobs: knobList };
  }

  /** 本地质量评估：钩子、节奏、去AI味 */
  evaluate(input: QualityInput): CopywritingQuality {
    const { content, scene } = input;
    const first = content.split('\n').find((l) => l.trim()) ?? '';
    const hookScore = this.scoreHook(first, scene);
    const rhythmScore = this.scoreRhythm(content);
    const flavor = scoreAiFlavor(content);
    const detailScore = this.scoreDetail(content);

    const score = Math.round(hookScore * 0.3 + rhythmScore * 0.25 + detailScore * 0.2 + flavor.humanScore * 0.25);
    const issues: string[] = [];
    if (hookScore < 60) issues.push('开头钩子偏弱，建议加入反差或具体场景');
    if (rhythmScore < 60) issues.push('句子长度过于均匀，读起来像模板');
    if (flavor.humanScore < 70) issues.push('AI 味偏重，建议口语化改写');
    if (detailScore < 60) issues.push('细节不足，缺少具体数字与场景');

    return {
      score,
      hookScore,
      rhythmScore,
      detailScore,
      deAiScore: flavor.humanScore,
      issues,
      passed: score >= 70,
    };
  }

  private scoreHook(first: string, scene: CopywritingScene): number {
    let s = 40;
    const len = first.length;
    if (len >= 8 && len <= 40) s += 20;
    if (/[？?！!]/.test(first)) s += 12;
    if (/\d/.test(first)) s += 10;
    if (/但是|其实|居然|竟然|别再|千万别|你以为|真相/.test(first)) s += 15;
    if (scene.hooks && first.includes(scene.hooks.slice(0, 2))) s += 5;
    if (len > 60) s -= 15;
    return Math.max(0, Math.min(100, s));
  }

  private scoreRhythm(content: string): number {
    const sentences = content.split(/[。！？!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 1);
    if (!sentences.length) return 0;
    const lens = sentences.map((s) => s.length);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    const cv = avg > 0 ? Math.sqrt(lens.reduce((a, l) => a + (l - avg) ** 2, 0) / lens.length) / avg : 0;
    return Math.max(0, Math.min(100, Math.round(cv * 110)));
  }

  private scoreDetail(content: string): number {
    let s = 45;
    if (/\d/.test(content)) s += 20;
    if (content.length >= 400) s += 15;
    if (/比如|例如|举个例子|我有个朋友|上周|昨天/.test(content)) s += 15;
    if (content.length < 150) s -= 25;
    return Math.max(0, Math.min(100, s));
  }
}

function buildSystemPrompt(scene: CopywritingScene, knobs: KnobValue[], mode: string): string {
  const knobText = knobs.length
    ? `\n## 旋钮设定\n${knobs.map((k) => `- ${k.label}：${k.value}`).join('\n')}`
    : '';
    const modeText =
    mode === 'imitate'
      ? '按参考内容的信息骨架与口气仿写，只换你要写的主题细节，不要抄原句，不要另起文学场景。'
      : mode === 'transform'
        ? '保留原意换表达，但不要改成无关的故事、剧本或氛围描写。'
        : '完全原创，不模仿任何已有内容。';

  return [
    `你是「文案武库」的执行者，专精场景化短文案。`,
    '',
    `## 场景：${scene.name}（${scene.categoryLabel}）`,
    scene.description ? `场景说明：${scene.description}` : '',
    scene.structure ? `结构要求：${scene.structure}` : '',
    scene.hooks ? `钩子类型：${scene.hooks}` : '',
    scene.tone ? `语气基调：${scene.tone}` : '',
    scene.forbidden ? `禁止出现：${scene.forbidden}` : '',
    scene.compliance ? `合规红线：${scene.compliance}` : '',
    scene.needLineBreak ? '排版要求：短句之间必须换行，适配手机阅读。' : '',
    knobText,
    '',
    `## 创作模式\n${modeText}`,
    '',
    '## 硬性要求',
    '- 直接输出文案正文，不要任何解释、前言、序号',
    '- 禁止使用「综上所述」「值得注意的是」等 AI 味连接词',
    '- 内容必须具体，给出数字、步骤或可感知细节，禁止无关文学场景',
    '- 禁止 Markdown 代码块',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserPrompt(req: CopywritingGenerateRequest, scene: CopywritingScene): string {
  const parts = [`主题：${req.topic}`];
  if (req.targetForm) parts.push(`目标形式：${req.targetForm}`);
  if (req.referenceContent?.trim()) {
    parts.push(`\n参考内容：\n${req.referenceContent.slice(0, 8000)}`);
  }
  parts.push('\n请输出文案。');
  void scene;
  return parts.join('\n');
}

export const copywritingService = new CopywritingService();
