import { STAGE_PROGRESS, WORKFLOW_STAGES } from '@smg/shared';
import { run, queryOne } from '../db/connection.js';
import { logger } from '../core/logger.js';
import { broadcast } from '../core/ws.js';
import { configService } from './config.service.js';
import { llmService } from './llm.service.js';
import { hotNewsService } from './hotnews.service.js';
import { searchService } from './search.service.js';
import { creativeService } from './creative.service.js';
import { deAiEngine } from './deai.service.js';
import { templateService } from './template.service.js';
import { layoutService } from './layout.service.js';
import { articleService } from './article.service.js';
import { publishService } from './publish.service.js';
import { countWords, extractSummary, removeCodeBlocks } from '../utils/content.js';
import type {
  Article,
  ArticleFormat,
  ContentResult,
  GenerateRequest,
  PublishPlatform,
  SelectedDimension,
  TaskRecord,
  TaskStatus,
} from '@smg/shared';

/* ============================================================
 * 阶段进度广播
 * ========================================================== */

type StageReporter = (stage: string, message?: string) => void;

function createReporter(taskId: number): StageReporter {
  return (stage, message) => {
    const progress = STAGE_PROGRESS[stage] ?? 0;
    run('UPDATE tasks SET stage = ?, progress = ? WHERE id = ?', [stage, progress, taskId]);
    broadcast({ type: 'progress', stage, progress, message });
    const label = WORKFLOW_STAGES.find((s) => s.key === stage)?.label ?? stage;
    logger.info(`[${label}]${message ? ' ' + message : ''}`);
  };
}

/* ============================================================
 * 多智能体工作流
 * ========================================================== */

export type WorkflowOptions = {
  request: GenerateRequest;
  report: StageReporter;
  /** 允许自动发布 */
  allowPublish?: boolean;
};

export type WorkflowResult = {
  task: TaskRecord;
  article: Article | null;
};

type ReferencePack = {
  materials: string;
  urls: string[];
  titles: string[];
};

class WriterService {
  private running = new Map<number, { stop: boolean }>();

  isRunning(): boolean {
    return this.running.size > 0;
  }

  stopAll(): void {
    for (const ctl of this.running.values()) ctl.stop = true;
  }

  /* ---------------- 主流程 ---------------- */

  async generate(request: GenerateRequest): Promise<WorkflowResult> {
    const cfg = configService.get();
    const startedAt = Date.now();

    const res = run(
      `INSERT INTO tasks (topic, platform, status, stage, progress)
       VALUES (?,?,?,?,0)`,
      [request.topic || '自动选题', request.platform ?? cfg.publishPlatform, 'running', 'init'],
    );
    const taskId = Number(res.lastInsertRowid);
    const ctl = { stop: false };
    this.running.set(taskId, ctl);
    broadcast({ type: 'status', status: 'running', taskId });

    const report = createReporter(taskId);

    try {
      /* ---- 阶段 1：确定选题 ---- */
      report('init');
      const mode = request.mode ?? 'custom';
      let topic = (request.topic ?? '').trim();
      if (mode === 'hot' || (!topic && mode !== 'reference')) {
        const picked = await hotNewsService.pickTopic();
        topic = topic || picked.topic;
        report('init', `选题来源：${picked.platform} 热榜`);
      }
      const platform = (request.platform ?? cfg.publishPlatform) as PublishPlatform;

      /* ---- 阶段 2：热点信息增强 ---- */
      let context = '';
      report('hot');
      if (mode === 'hot') {
        const horses = await this.enrichByHot(topic);
        if (horses) context += horses;
      }

      /* ---- 阶段 3：联网搜索 / 参考素材 ---- */
      report('search');
      const pack = await this.loadReferences(request, topic, mode);
      if (mode === 'reference' && !topic) {
        topic = pack.titles[0]?.trim() || '参考文章仿写';
      }
      if (!topic) throw new Error('请填写选题，或在仿写模式下提供可抓取的参考链接');
      report('init', `平台：${platform}，主题：${topic}`);
      if (pack.materials) context += `\n${pack.materials}`;
      if (mode === 'reference' && !pack.materials) {
        throw new Error('参考文章抓取失败，请确认链接可访问后再试');
      }

      /* ---- 阶段 4：专家赛道与维度 ---- */
      const track = request.trackId ? this.getTrack(request.trackId) : null;
      const trackTemplate = request.trackTemplateId ? this.getTrackTemplate(request.trackTemplateId) : null;
      const userDimensions = (request.dimensions ?? []).length > 0;
      let dimensions: SelectedDimension[] = request.dimensions ?? [];
      // 仿写默认不套随机场景维度，否则会把测评稿改成「古老图书馆」之类文学壳
      if (
        mode !== 'reference' &&
        cfg.dimensionalCreative.enabled &&
        !userDimensions &&
        cfg.dimensionalCreative.autoDimensionSelection
      ) {
        dimensions = creativeService.autoSelect(topic, cfg.dimensionalCreative.maxDimensions);
        if (dimensions.length) {
          report('search', `自动选择维度：${dimensions.map((d) => d.option).join('、')}`);
        }
      }

      /* ---- 阶段 5：AI 写作 ---- */
      report('writing');
      const draft = await this.writeArticle({
        topic,
        platform,
        context,
        mode,
        track,
        trackTemplate,
        dimensions: mode === 'reference' && !userDimensions ? [] : dimensions,
        ctl,
        report,
      });
      if (ctl.stop) throw new Error('任务已被手动停止');

      /* ---- 阶段 6：维度化创意 ---- */
      const dimsForTransform = mode === 'reference' && !userDimensions ? [] : dimensions;
      if (cfg.dimensionalCreative.enabled && dimsForTransform.length) {
        report('creative');
        const transformed = await creativeService.transform(
          draft.content,
          draft.title,
          dimsForTransform,
          cfg.dimensionalCreative.creativeIntensity,
          cfg.dimensionalCreative.preserveCoreInfo,
        );
        if (transformed !== draft.content) {
          draft.content = transformed;
        }
      }

      /* ---- 阶段 7：去 AI 味 ---- */
      const deAiCfg = { ...cfg.deAi, ...(request.deAi ?? {}) };
      if (deAiCfg.enabled) {
        report('deai');
        const result = await deAiEngine.run(draft.content, {
          config: deAiCfg,
          reference: mode === 'reference' && deAiCfg.referenceStyle ? pack.materials : undefined,
          onAttempt: (attempt, score) =>
            logger.info(`去 AI 味第 ${attempt} 轮，当前人工率 ${score.humanScore}%`),
        });
        draft.content = result.content;
        draft.metadata.deAi = {
          humanScore: result.humanScore,
          attempts: result.attempts,
          passed: result.passed,
          changes: result.changes,
        };
        report('deai', `人工率 ${result.humanScore}%（${result.attempts} 轮）`);
      }

      /* ---- 阶段 8：排版 ---- */
      report('layout');
      let html = draft.content;
      const format: ArticleFormat = cfg.articleFormat;
      if (format === 'html') {
        if (cfg.useTemplate) {
          const tpl = templateService.pickTemplate({
            name: request.reference?.templateName,
            category: request.reference?.templateCategory,
            topic,
          });
          if (tpl) {
            html = templateService.applyTemplate(tpl, draft.title, draft.content);
            draft.metadata.template = tpl.name;
            report('layout', `已套用模板「${tpl.name}」`);
          }
          if (!tpl || html === draft.content) {
            html = layoutService.localHtml(draft.content, draft.title, cfg.pageDesign);
            draft.metadata.template = draft.metadata.template ?? 'local';
          }
        } else {
          html = await layoutService.designHtml(draft.content, draft.title, platform, cfg.pageDesign);
        }
        html = layoutService.renderContentHtml(html, draft.title);
      }

      /* ---- 阶段 9：保存入库 ---- */
      report('save');
      const article = articleService.create({
        title: draft.title,
        content: html,
        topic,
        platform,
        category: track?.name ?? '',
        format,
        summary: draft.summary,
        source: 'ai',
        trackId: request.trackId ?? null,
        sceneId: null,
        status: 'draft',
      });
      run('UPDATE tasks SET article_id = ? WHERE id = ?', [article.id, taskId]);
      report('save', `已保存文章 #${article.id}`);

      /* ---- 阶段 10：发布 ---- */
      const autoPublish = request.autoPublish ?? cfg.autoPublish;
      if (autoPublish) {
        report('publish');
        try {
          const outcome = await publishService.publish(article, platform);
          logger[outcome.success ? 'success' : 'warn'](`发布结果：${outcome.message}`);
        } catch (err) {
          logger.warn(`自动发布失败：${(err as Error).message}`);
        }
      }

      /* ---- 完成 ---- */
      const durationMs = Date.now() - startedAt;
      const finalStatus: TaskStatus = ctl.stop ? 'stopped' : 'completed';
      run(
        `UPDATE tasks SET status = ?, stage = 'done', progress = 100,
                finished_at = datetime('now','localtime'), duration_ms = ?, error = ?
         WHERE id = ?`,
        [finalStatus, durationMs, null, taskId],
      );
      this.recordMetrics('generate', true, durationMs);
      report('done', `完成，用时 ${(durationMs / 1000).toFixed(1)}s`);

      const task = getTask(taskId);
      if (!task) throw new Error('任务记录丢失');
      broadcast({
        type: 'completed',
        taskId,
        articleId: article.id,
        message: `《${article.title}》生成完成`,
      });
      broadcast({ type: 'status', status: 'idle', taskId: null });

      return { task, article };
    } catch (err) {
      const message = (err as Error).message;
      const durationMs = Date.now() - startedAt;
      const status: TaskStatus = ctl.stop ? 'stopped' : 'failed';
      run(
        `UPDATE tasks SET status = ?, finished_at = datetime('now','localtime'),
                duration_ms = ?, error = ?
         WHERE id = ?`,
        [status, durationMs, message.slice(0, 1000), taskId],
      );
      this.recordMetrics('generate', false, durationMs);
      logger.error(`工作流失败：${message}`);
      broadcast({ type: 'failed', taskId, error: message });
      broadcast({ type: 'status', status: 'idle', taskId: null });
      this.running.delete(taskId);

      const task = getTask(taskId);
      if (task) return { task, article: null };
      throw err;
    } finally {
      this.running.delete(taskId);
    }
  }

  /* ---------------- 各阶段实现 ---------------- */

  private async enrichByHot(topic: string): Promise<string> {
    try {
      const groups = await hotNewsService.fetchAll(10);
      const all = groups.flatMap((g) => g.topics);
      const related = all.filter((t) => overlaps(t.name, topic));
      if (related.length < 2) return '';
      const list = related
        .slice(0, 8)
        .map((t) => `- 【${t.platform}】${t.name}（热度 ${t.heat}）`)
        .join('\n');
      return `\n【实时热搜背景】\n${list}\n`;
    } catch {
      return '';
    }
  }

  private async loadReferences(
    request: GenerateRequest,
    topic: string,
    mode: GenerateRequest['mode'],
  ): Promise<ReferencePack> {
    const urls: string[] = [];
    if (mode !== 'reference') {
      const library = searchService.searchLibrary(topic, 3);
      for (const item of library) {
        if (item.url) urls.push(item.url);
      }
    }
    for (const u of request.reference?.urls ?? []) urls.push(u);

    const unique = [...new Set(urls)].slice(0, 5);
    if (!unique.length) return { materials: '', urls: [], titles: [] };

    const { results, failed } = await searchService.fetchMany(unique, 'reference');
    for (const f of failed) logger.warn(`参考文章抓取失败：${f}`);

    if (!results.length) return { materials: '', urls: unique, titles: [] };

    const materials = results
      .map((r, i) => {
        const limit = mode === 'reference' && i === 0 ? 12000 : 2500;
        const body = r.content.slice(0, limit);
        return `### 参考素材 ${i + 1}：${r.title}\n来源：${r.url}\n${body}`;
      })
      .join('\n\n');

    return { materials, urls: unique, titles: results.map((r) => r.title) };
  }

  private getTrack(trackId: number) {
    const rows = queryOne<any>('SELECT * FROM expert_tracks WHERE id = ?', [trackId]);
    return rows ?? null;
  }

  private getTrackTemplate(templateId: number) {
    return queryOne<any>('SELECT * FROM expert_track_templates WHERE id = ?', [templateId]) ?? null;
  }

  private async writeArticle(args: {
    topic: string;
    platform: PublishPlatform;
    context: string;
    mode: GenerateRequest['mode'];
    track: any;
    trackTemplate: any;
    dimensions: SelectedDimension[];
    ctl: { stop: boolean };
    report: StageReporter;
  }): Promise<ContentResult> {
    const cfg = configService.get();
    const { topic, platform, context, mode, track, trackTemplate, dimensions, ctl } = args;
    const maxWords = trackTemplate?.word_max ?? cfg.maxArticleLen;
    const minWords = trackTemplate?.word_min ?? cfg.minArticleLen;
    const imitate = mode === 'reference';

    /* ---- 1. 规划智能体：生成提纲 ---- */
    const outline = await this.planOutline({
      topic,
      platform,
      context,
      mode,
      track,
      trackTemplate,
      dimensions,
      minWords,
      maxWords,
    });

    /* ---- 2. 写作智能体：分段扩写 ---- */
    const segments = outline.sections.length
      ? outline.sections
      : imitate
        ? [
            { heading: '痛点切入', requirement: '用原文同类的具体麻烦开场，不要文学场景' },
            { heading: '核心能力', requirement: '讲清楚产品/方法比常见做法强在哪，给可核对的细节' },
            { heading: '怎么上手', requirement: '步骤、限制和风险写明白，方便读者照做' },
          ]
        : [
            { heading: '开篇', requirement: '用具体麻烦、可核对事实或反常识判断切入，不要文学氛围描写' },
            { heading: '正文', requirement: '展开论证，给出数字、案例或可执行步骤' },
            { heading: '结尾', requirement: '给出行动建议或限制说明' },
          ];

    const chunks: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      if (ctl.stop) break;
      const seg = segments[i];
      const target = distributeWords(minWords, maxWords, segments.length, i);
      const text = await this.writeSegment({
        topic,
        platform,
        context,
        mode,
        style: trackTemplate?.style ?? track?.style ?? '',
        heading: seg.heading,
        requirement: seg.requirement,
        words: target,
        outline: outline.summary,
        index: i,
        total: segments.length,
      });
      chunks.push(`## ${seg.heading}\n\n${text}`);
      args.report('writing', `已写 ${i + 1}/${segments.length} 段（约 ${countWords(text)} 字）`);
    }

    let content = chunks.join('\n\n');
    const wordCount = countWords(content);

    /* ---- 3. 标题智能体 ---- */
    const title = await this.makeTitle(topic, content, platform, imitate);

    /* ---- 4. 摘要智能体 ---- */
    const summary = extractSummary(content, 150);

    return {
      title,
      content,
      summary,
      format: cfg.articleFormat,
      wordCount,
      metadata: { outline: outline.summary, sections: segments.length, mode },
    };
  }

  /** 规划智能体 */
  private async planOutline(args: {
    topic: string;
    platform: PublishPlatform;
    context: string;
    mode: GenerateRequest['mode'];
    track: any;
    trackTemplate: any;
    dimensions: SelectedDimension[];
    minWords: number;
    maxWords: number;
  }): Promise<{ summary: string; sections: { heading: string; requirement: string }[] }> {
    const { topic, platform, context, mode, track, trackTemplate, dimensions } = args;
    const imitate = mode === 'reference';

    const sys = [
      '你是一位资深中文内容策划，负责在正式写作前产出可直接指导写手的手写提纲。',
      '你是「规划智能体」。',
      '',
      '## 输出格式（严格 JSON）',
      '```json',
      '{ "summary": "一句话说明全文核心论点", "sections": [ { "heading": "小标题", "requirement": "本段写作要求" } ] }',
      '```',
      '',
      '## 要求',
      `- 目标平台：${platform}`,
      track ? `- 赛道：${track.name}｜读者：${track.audience}｜结构偏好：${track.structure}` : '',
      trackTemplate ? `- 风格：${trackTemplate.style}｜策略：${trackTemplate.strategy}` : '',
      dimensions.length ? creativeService.buildPrompt(dimensions, 1) : '',
      imitate
        ? [
            '',
            '## 仿写任务（必须遵守）',
            '- 先拆参考文的信息骨架（痛点 / 方案 / 机制 / 步骤 / 限制），小标题沿用同类功能分段，不要另起一个文学场景',
            '- 禁止「推开某扇门」「古老图书馆」「书架沉默」等与事实无关的意象框架',
            '- 开头要求：具体麻烦或可核对事实，不要氛围描写',
            '- 第一个小标题不得复述全文标题',
            '- 事实、版本号、路径、限制以参考文为准，不要编造',
          ].join('\n')
        : [
            '',
            '## 通用写作约束',
            '- 开头用具体麻烦或可核对事实，禁止无关文学场景（图书馆、推门、深夜氛围）',
            '- 第一个小标题不得复述拟定标题',
          ].join('\n'),
      '',
      '## 严格禁止',
      '- 不要输出任何解释文字',
      '- sections 数量控制在 3~6 个',
    ]
      .filter(Boolean)
      .join('\n');

    const user = [
      `选题：${topic}`,
      context ? `\n可用背景资料：\n${context.slice(0, imitate ? 10000 : 4000)}` : '',
      `\n请产出 ${args.minWords}~${args.maxWords} 字文章的手写提纲。`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const raw = await llmService.chat({ system: sys, user, temperature: 0.7, json: true, maxTokens: 2000 });
      const parsed = parseJson(raw);
      const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
      const cleaned = sections
        .filter((s: any) => s && typeof s.heading === 'string')
        .slice(0, 6)
        .map((s: any) => ({
          heading: s.heading.replace(/^#+\s*/, '').trim(),
          requirement: String(s.requirement ?? '').trim(),
        }));
      return { summary: String(parsed?.summary ?? '').trim(), sections: cleaned };
    } catch (err) {
      logger.warn(`提纲生成失败，使用默认结构：${(err as Error).message}`);
      return { summary: '', sections: [] };
    }
  }

  /** 写作智能体：单段扩写 */
  private async writeSegment(args: {
    topic: string;
    platform: PublishPlatform;
    context: string;
    mode: GenerateRequest['mode'];
    heading: string;
    requirement: string;
    words: number;
    style: string;
    outline: string;
    index: number;
    total: number;
  }): Promise<string> {
    const { topic, platform, context, mode, heading, requirement, words, style, outline, index, total } = args;
    const imitate = mode === 'reference';

    const sys = [
      '你是「写作智能体」，一位资深的微信公众号主编。',
      '你接到任务后**直接输出段落正文**，不要任何解释、前言或总结。',
      '',
      '## 硬性规则',
      '- 绝不使用「综上所述」「值得注意的是」「在当今社会」等 AI 味连接词',
      '- 绝不使用 Markdown 代码块',
      '- 绝不使用「以下是」「希望对你有帮助」等套话',
      '- 句子长短交错，偶尔出现口语、短句、反问',
      '- 内容必须具体：给出数字、步骤、案例，避免空泛议论',
      `- 本次只写第 ${index + 1} / ${total} 段`,
      '- 不要重复输出小标题（小标题已由提纲提供）',
      '- 禁止把说明、测评、教程写成图书馆、大门、书架、深夜推门等文学场景',
      imitate
        ? [
            '',
            '## 仿写规则',
            '- 学参考文的信息密度和分段功能，用自己的句子重写，禁止整段改写原文',
            '- 技术词保持原样（如 Node.js 22、FFmpeg、Docker Compose），不要拟人',
            '- 本段只覆盖提纲指定的信息，不要把全文再讲一遍',
          ].join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const user = [
      `选题：${topic}`,
      `本段小标题：${heading}`,
      `本段要求：${requirement}`,
      words ? `本段字数：${words} 字左右` : '',
      style ? `语言风格：${style}` : '',
      outline ? `全文核心论点：${outline}` : '',
      '',
      imitate ? '参考原文（按对应段落取材，不要另起隐喻）：' : '背景资料（仅供参考，可择要引用）：',
      context.slice(0, imitate ? 8000 : 3000),
      '',
      '直接输出本段正文。',
    ]
      .filter(Boolean)
      .join('\n');

    const out = await llmService.chat({
      system: sys,
      user,
      temperature: 0.85,
      // 推理模型会占用大量 token，下限提高到 8192，避免 content 被截成空
      maxTokens: Math.min(32000, Math.max(8192, words * 6)),
    });
    return removeCodeBlocks(out);
  }

  /** 标题智能体 */
  private async makeTitle(
    topic: string,
    content: string,
    platform: PublishPlatform,
    imitate = false,
  ): Promise<string> {
    const sys = [
      '你是「标题智能体」，专门为中文自媒体文章拟标题。',
      '你只输出一条标题，不要任何解释、序号或引号。',
      '',
      '## 要求',
      '- 长度 12~28 字',
      '- 有具体信息或反差，不要空泛',
      '- 不使用「震惊」「速看」等低质标题党词汇',
      '- 不加书名号以外的标点堆砌',
      '- 不要复述正文第一句或第一个小标题',
      imitate
        ? '- 仿写时学参考文标题的信息密度（痛点+能力），禁止「推开…之门」「走进…」这类空比喻'
        : '- 禁止「推开…之门」「走进…图书馆」这类空比喻',
    ]
      .filter(Boolean)
      .join('\n');

    const user = [
      `选题：${topic}`,
      `平台：${platform}`,
      '',
      '文章开头：',
      content.slice(0, 600),
      '',
      '请给出 1 条最终标题。',
    ].join('\n');

    try {
      const raw = await llmService.chat({ system: sys, user, temperature: 0.9, maxTokens: 120 });
      const line = raw
        .split('\n')
        .map((l) => l.replace(/^[\d\-\*\.\s]+/, '').replace(/^["'「『]|["'」』]$/g, '').trim())
        .find((l) => l.length >= 6 && l.length <= 40);
      if (line) return line;
    } catch (err) {
      logger.warn(`标题生成失败，回退到选题：${(err as Error).message}`);
    }
    return topic.slice(0, 40) || '无标题';
  }

  /* ---------------- 发布 ---------------- */

  private recordMetrics(workflow: string, success: boolean, ms: number): void {
    try {
      run(
        `INSERT INTO workflow_metrics (workflow, count, success_count, total_ms, last_status, last_run_at)
         VALUES (?,1,?,?,?,datetime('now','localtime'))
         ON CONFLICT(workflow) DO UPDATE SET
           count = count + 1,
           success_count = success_count + excluded.success_count,
           total_ms = total_ms + excluded.total_ms,
           last_status = excluded.last_status,
           last_run_at = excluded.last_run_at`,
        [workflow, success ? 1 : 0, ms, success ? 'success' : 'failed'],
      );
    } catch {
      /* ignore */
    }
  }
}

/* ============================================================
 * 辅助
 * ========================================================== */

function getTask(id: number): TaskRecord | null {
  const row = queryOne<any>(
    `SELECT id, topic, platform, status, stage, progress,
            article_id AS articleId, error,
            started_at AS startedAt, finished_at AS finishedAt, duration_ms AS durationMs
     FROM tasks WHERE id = ?`,
    [id],
  );
  return row ? (row as TaskRecord) : null;
}

function overlaps(a: string, b: string): boolean {
  const ta = a.toLowerCase();
  const tb = b.toLowerCase();
  for (let n = 4; n >= 2; n--) {
    for (let i = 0; i + n <= ta.length; i++) {
      const gram = ta.slice(i, i + n);
      if (gram.length === n && tb.includes(gram)) return true;
    }
  }
  return false;
}

function parseJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

function distributeWords(min: number, max: number, parts: number, index: number): number {
  const total = Math.round((min + max) / 2);
  return Math.max(150, Math.round(total / parts));
}

export const writerService = new WriterService();
