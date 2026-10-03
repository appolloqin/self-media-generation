import { run, query, transaction } from './connection.js';
import { runMigrations } from './migrate.js';
import { buildDefaultConfig } from '@smg/shared';
import { SEED_IMAGE_PRESETS, SEED_PROMPTS, SEED_SCENES, SEED_TEMPLATES, SEED_TRACKS } from './seed-data.js';
import { logger } from '../core/logger.js';

const KNOB_LABELS: Record<string, string> = {
  hook: '开头钩子',
  emotion: '情绪基调',
  rhythm: '节奏',
  ending: '结尾方式',
  colloquial: '口语度',
};

const CATEGORY_LABELS: Record<string, string> = {
  TechDigital: '科技数码',
  FinanceInvestment: '财经投资',
  EducationLearning: '教育学习',
  HealthWellness: '健康养生',
  FoodTravel: '美食旅行',
  FashionLifestyle: '时尚生活',
  CareerDevelopment: '职场发展',
  EmotionPsychology: '情感心理',
  EntertainmentGossip: '娱乐八卦',
  NewsCurrentAffairs: '新闻时事',
  Others: '其他',
};

/** 依据模板名生成有辨识度的 HTML 骨架 */
function buildTemplateHtml(name: string, categoryLabel: string): string {
  const pick = (keyword: string) => name.includes(keyword);

  const head = `<section style="margin:0 0 24px;padding:0 0 16px;border-bottom:2px solid #3a7bd5;">
  <h1 style="margin:0;font-size:24px;line-height:1.5;font-weight:800;color:#1a1a1a;letter-spacing:0.5px;">{{TITLE}}</h1>
  <p style="margin:8px 0 0;font-size:13px;color:#3a7bd5;letter-spacing:2px;">{{DATE}} · ${categoryLabel}</p>
</section>`;

  const paragraph = `<section style="margin:0 0 18px;">
  <p style="margin:0;font-size:16px;line-height:1.95;color:#333;letter-spacing:0.6px;text-align:justify;">{{CONTENT}}</p>
</section>`;

  const card = (label: string, value = '{{CONTENT}}') => `<section style="margin:0 0 20px;padding:18px 20px;background:#f7f9fc;border-left:4px solid #3a7bd5;border-radius:6px;">
  <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#3a7bd5;">${label}</p>
  <p style="margin:0;font-size:15px;line-height:1.9;color:#444;">${value}</p>
</section>`;

  const bulletList = `<section style="margin:0 0 20px;">
  <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1a1a1a;">要点速览</p>
  <ul style="margin:0;padding-left:20px;font-size:15px;line-height:2;color:#444;">
    <li style="margin:4px 0;">要点一：{{CONTENT}}</li>
    <li style="margin:4px 0;">要点二</li>
    <li style="margin:4px 0;">要点三</li>
  </ul>
</section>`;

  const timeline = `<section style="margin:0 0 24px;padding:20px;background:#fafafa;border-radius:8px;">
  <p style="margin:0 0 14px;font-size:15px;font-weight:700;color:#1a1a1a;">时间线</p>
  <section style="display:flex;margin:0 0 12px;">
    <section style="width:6px;background:#3a7bd5;border-radius:3px;"></section>
    <section style="flex:1;padding-left:14px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#3a7bd5;">阶段一</p>
      <p style="margin:0;font-size:15px;line-height:1.85;color:#444;">{{CONTENT}}</p>
    </section>
  </section>
  <section style="display:flex;margin:0 0 12px;">
    <section style="width:6px;background:#00b09b;border-radius:3px;"></section>
    <section style="flex:1;padding-left:14px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#00b09b;">阶段二</p>
      <p style="margin:0;font-size:15px;line-height:1.85;color:#444;">承接上文，展开分析</p>
    </section>
  </section>
</section>`;

  const quote = `<section style="margin:0 0 22px;padding:16px 20px;background:#f0f7ff;border-radius:8px;">
  <p style="margin:0;font-size:15px;line-height:1.9;color:#2b5c8a;font-style:italic;">「{{CONTENT}}」</p>
</section>`;

  const cover = `<section style="margin:0 0 20px;text-align:center;">
  <img src="{{COVER}}" alt="{{TITLE}}" style="max-width:100%;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.08);" />
</section>`;

  let body = paragraph;
  if (pick('快讯')) body = card('一句话速览') + card('详情');
  else if (pick('数据')) body = card('关键数据', '数据 A：{{CONTENT}}　数据 B：——　数据 C：——') + quote;
  else if (pick('图集')) body = cover + paragraph;
  else if (pick('清单')) body = bulletList + paragraph;
  else if (pick('留白')) body = quote + paragraph;
  else if (pick('时间线')) body = timeline + paragraph;
  else if (pick('步骤')) body = bulletList + card('执行清单');
  else if (pick('杂志')) body = quote + cover + paragraph;
  else body = card('核心结论') + card('延伸思考') + paragraph;

  return `<section style="max-width:677px;margin:0 auto;padding:20px 16px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#3a3a3a;">${head}${body}
<section style="margin-top:32px;padding-top:18px;border-top:1px solid #ececec;text-align:center;">
  <p style="margin:0;font-size:12px;color:#bbb;letter-spacing:1px;">— END —</p>
</section>
</section>`;
}

function seedTemplates(): number {
  let count = 0;
  for (const t of SEED_TEMPLATES) {
    const exists = query('SELECT id FROM templates WHERE name = ? AND category = ?', [t.name, t.category]);
    if (exists.length) continue;
    const content = t.content || buildTemplateHtml(t.name, CATEGORY_LABELS[t.category] ?? t.category);
    run('INSERT INTO templates (name, category, content, builtin) VALUES (?,?,?,1)', [t.name, t.category, content]);
    count++;
  }
  return count;
}

function seedTracks(): number {
  let count = 0;
  for (const t of SEED_TRACKS) {
    const exists = query<{ id: number }>('SELECT id FROM expert_tracks WHERE name = ?', [t.name]);
    let trackId: number;
    if (exists.length) {
      trackId = exists[0].id;
    } else {
      const res = run(
        `INSERT INTO expert_tracks (name, slug, description, audience, boundary, structure, style,
           quality_bar, compliance, default_params, enabled, is_builtin)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,1)`,
        [
          t.name,
          `builtin-${t.name.length}-${count}-${Date.now().toString(36).slice(-4)}`,
          t.description,
          t.audience,
          t.boundary,
          t.structure,
          t.style,
          t.qualityBar,
          t.compliance,
          JSON.stringify({ platform: t.templates[0]?.platform ?? 'wechat' }),
        ],
      );
      trackId = Number(res.lastInsertRowid);
      count++;
    }
    for (const tpl of t.templates) {
      const dup = query('SELECT id FROM expert_track_templates WHERE track_id = ? AND name = ?', [trackId, tpl.name]);
      if (dup.length) continue;
      run(
        `INSERT INTO expert_track_templates (track_id, name, audience, depth, platform, style, strategy, word_min, word_max)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [trackId, tpl.name, tpl.audience, tpl.depth, tpl.platform, tpl.style, tpl.strategy, tpl.wordMin, tpl.wordMax],
      );
    }
  }
  return count;
}

function seedScenes(): number {
  let count = 0;
  for (const s of SEED_SCENES) {
    const exists = query('SELECT id FROM copywriting_scenes WHERE name = ? AND category = ?', [s.name, s.category]);
    if (exists.length) continue;
    const res = run(
      `INSERT INTO copywriting_scenes (name, category, category_label, description, structure, hooks,
         tone, forbidden, compliance, need_line_break, built_in, enabled)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,1)`,
      [
        s.name,
        s.category,
        s.categoryLabel,
        s.description,
        s.structure,
        s.hooks,
        s.tone,
        s.forbidden,
        s.compliance,
        s.needLineBreak ? 1 : 0,
      ],
    );
    const sceneId = Number(res.lastInsertRowid);
    count++;
    for (const [knob, values] of Object.entries(s.knobs)) {
      values.forEach((value, i) => {
        run(
          'INSERT OR IGNORE INTO copywriting_knobs (scene_id, knob, label, value, order_index) VALUES (?,?,?,?,?)',
          [sceneId, knob, KNOB_LABELS[knob] ?? knob, value, i],
        );
      });
    }
  }
  return count;
}

function seedImagePresets(): number {
  let count = 0;
  for (const p of SEED_IMAGE_PRESETS) {
    const exists = query('SELECT id FROM image_style_presets WHERE name = ?', [p.name]);
    if (exists.length) continue;
    run(
      'INSERT INTO image_style_presets (name, prompt_template, negative_prompt, category, builtin) VALUES (?,?,?,?,1)',
      [p.name, p.promptTemplate, p.negativePrompt, p.category],
    );
    count++;
  }
  return count;
}

function seedPrompts(): number {
  let count = 0;
  for (const p of SEED_PROMPTS) {
    const exists = query('SELECT id FROM prompt_presets WHERE title = ?', [p.title]);
    if (exists.length) continue;
    run('INSERT INTO prompt_presets (title, category, content, builtin) VALUES (?,?,?,1)', [p.title, p.category, p.content]);
    count++;
  }
  return count;
}

function seedConfig(): number {
  const exists = query('SELECT key FROM app_config WHERE key = ?', ['app']);
  if (exists.length) return 0;
  run('INSERT INTO app_config (key, value) VALUES (?, ?)', ['app', JSON.stringify(buildDefaultConfig())]);
  return 1;
}

const RESET_TABLES = [
  'workflow_metrics',
  'tasks',
  'article_publish_records',
  'articles',
  'templates',
  'expert_track_templates',
  'expert_tracks',
  'copywriting_presets',
  'copywriting_knobs',
  'copywriting_scenes',
  'image_assets',
  'image_style_presets',
  'library_articles',
  'library_accounts',
  'topic_ideas',
  'novel_chapters',
  'novel_volumes',
  'novel_characters',
  'novel_foreshadows',
  'novel_memories',
  'novels',
  'hot_topic_cache',
  'rss_subscriptions',
  'prompt_presets',
  'app_config',
];

export function runSeed(reset = false): Record<string, number> {
  runMigrations();

  if (reset) {
    transaction(() => {
      for (const t of RESET_TABLES) run(`DELETE FROM ${t}`);
      run('DELETE FROM sqlite_sequence');
    });
    logger.warn('已清空业务数据（表结构保留）');
  }

  const result = {
    templates: seedTemplates(),
    tracks: seedTracks(),
    scenes: seedScenes(),
    imagePresets: seedImagePresets(),
    prompts: seedPrompts(),
    config: seedConfig(),
  };

  const total = Object.values(result).reduce((a, b) => a + b, 0);
  if (total > 0) {
    logger.success(
      `种子数据写入完成：模板 +${result.templates}，赛道 +${result.tracks}，文案场景 +${result.scenes}，` +
        `图库预设 +${result.imagePresets}，提示词 +${result.prompts}，默认配置 +${result.config}`,
    );
  } else {
    logger.info('种子数据已是最新，无需写入');
  }
  return result;
}
