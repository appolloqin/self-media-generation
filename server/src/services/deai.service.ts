import { llmService } from './llm.service.js';
import { logger } from '../core/logger.js';
import type { DeAiConfig, DeAiResult } from '@smg/shared';
import { mergeConfig, DEFAULT_DE_AI } from '@smg/shared';

/* ============================================================
 * AI 味启发式检测器
 * 纯本地算法，用于快速评估与"评分反馈进化"
 * ========================================================== */

const AI_CONNECTORS = [
  '首先',
  '其次',
  '最后',
  '综上所述',
  '总而言之',
  '值得注意的是',
  '需要注意的是',
  '不难发现',
  '显而易见',
  '在当今社会',
  '随着科技的不断发展',
  '随着时代的发展',
  '我们可以看到',
  '我们都知道',
  '换句话说',
  '据相关统计',
  '数据显示',
  '这一现象',
  '引发了我的思考',
  '在某种程度上',
  '充分发挥',
  '具有重要意义',
  '起到了关键作用',
  '提供了有力支撑',
  '奠定了坚实基础',
  '注入了强劲动力',
  '开辟了新的路径',
  '树立了标杆',
];

const AI_FILLERS = [
  '的',
  '了',
  '是',
  '在',
  '和',
  '也',
  '就',
  '都',
  '而',
  '及其',
  '对于',
  '关于',
  '通过',
  '进行',
  '实现',
  '具有',
  '能够',
];

export type AiFlavorScore = {
  aiScore: number;
  humanScore: number;
  details: {
    connectorHits: { word: string; count: number }[];
    listRatio: number;
    avgSentenceLength: number;
    sentenceLengthVariance: number;
    paragraphLengthVariance: number;
    fillerRatio: number;
    parallelStructureRatio: number;
    emotionWords: number;
    totalChars: number;
  };
};

export function scoreAiFlavor(text: string): AiFlavorScore {
  const plain = text
    .replace(/<[^>]+>/g, '\n')
    .replace(/[#*`>\-]/g, '')
    .trim();
  const totalChars = plain.replace(/\s/g, '').length || 1;

  // 连接词
  const connectorHits: { word: string; count: number }[] = [];
  for (const w of AI_CONNECTORS) {
    const count = plain.split(w).length - 1;
    if (count > 0) connectorHits.push({ word: w, count });
  }
  const connectorTotal = connectorHits.reduce((a, b) => a + b.count, 0);

  // 列表化程度（连续行以 - * 数字 开头）
  const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean);
  const listLines = lines.filter((l) => /^([-*•·]|\d+[.)、])/.test(l)).length;
  const listRatio = listLines / Math.max(lines.length, 1);

  // 句子长度与变化度
  const sentences = plain
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  const lens = sentences.map((s) => s.length);
  const avgLen = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const variance = lens.length
    ? lens.reduce((acc, l) => acc + (l - avgLen) ** 2, 0) / lens.length
    : 0;
  const cv = avgLen > 0 ? Math.sqrt(variance) / avgLen : 0; // 变异系数

  // 段落长度变化度
  const paragraphs = plain.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pLens = paragraphs.map((p) => p.length);
  const pAvg = pLens.length ? pLens.reduce((a, b) => a + b, 0) / pLens.length : 0;
  const pVar = pLens.length
    ? pLens.reduce((acc, l) => acc + (l - pAvg) ** 2, 0) / pLens.length
    : 0;
  const pCv = pAvg > 0 ? Math.sqrt(pVar) / pAvg : 0;

  // 虚词密度
  let fillerCount = 0;
  for (const f of AI_FILLERS) fillerCount += plain.split(f).length - 1;
  const fillerRatio = fillerCount / totalChars;

  // 并列结构（"不仅…而且…"、"既…又…"）
  const parallel = (plain.match(/不仅.{0,20}而且|既.{0,15}又|不但.{0,20}还|无论.{0,15}都/g) ?? []).length;
  const parallelStructureRatio = parallel / Math.max(sentences.length, 1);

  // 情感/口语词
  const emotionWords = (
    plain.match(/我|你|咱|其实|真的|特别|太|居然|竟然|说白了|讲真|舒服|离谱|绝了/g) ?? []
  ).length;

  /* ---- 合成 AI 分（0-100，越高越像 AI） ---- */
  let ai = 0;
  ai += Math.min(30, connectorTotal * 3.5); // 连接词堆砌
  ai += Math.min(22, listRatio * 45); // 列表化
  ai += Math.max(0, 14 - cv * 45); // 句长过于均匀
  ai += Math.max(0, 10 - pCv * 55); // 段落过于均匀
  ai += Math.min(12, fillerRatio * 130); // 虚词过多
  ai += Math.min(12, parallelStructureRatio * 40); // 并列句式
  ai += Math.max(0, 10 - Math.min(10, emotionWords * 1.4)); // 情感词缺失
  ai += Math.min(8, Math.max(0, (0.55 - Math.min(0.55, cv)) * 18));

  // 长度惩罚：过短内容不稳定
  if (totalChars < 300) ai = Math.min(ai, 45);

  const aiScore = Math.round(Math.max(0, Math.min(100, ai)));
  const humanScore = 100 - aiScore;

  return {
    aiScore,
    humanScore,
    details: {
      connectorHits,
      listRatio: Number(listRatio.toFixed(3)),
      avgSentenceLength: Math.round(avgLen),
      sentenceLengthVariance: Number(cv.toFixed(3)),
      paragraphLengthVariance: Number(pCv.toFixed(3)),
      fillerRatio: Number(fillerRatio.toFixed(4)),
      parallelStructureRatio: Number(parallelStructureRatio.toFixed(3)),
      emotionWords,
      totalChars,
    },
  };
}

/* ============================================================
 * 去 AI 味引擎
 * ========================================================== */

export class DeAiEngine {
  /** 本地结构化打散：无需 LLM 的确定性变换 */
  localRestructure(text: string, cfg: DeAiConfig): { text: string; changes: string[] } {
    let out = text;
    const changes: string[] = [];

    // 1. 去除 AI 味连接词
    if (cfg.removeConnectors) {
      let removed = 0;
      for (const w of AI_CONNECTORS) {
        const re = new RegExp(`(^|[，,。；;\\n\\s])${w}[，,、]?\\s*`, 'g');
        out = out.replace(re, (_m, p1) => {
          removed++;
          return p1 === '\n' ? '\n' : '';
        });
      }
      if (removed) changes.push(`移除 ${removed} 处 AI 味连接词`);
    }

    // 2. 列表扁平化
    if (cfg.breakLists) {
      const lines = out.split('\n');
      const rebuilt: string[] = [];
      let inList = false;
      for (const line of lines) {
        const isListItem = /^([-*•·]|\d+[.)、])\s*/.test(line.trim());
        if (isListItem) {
          if (!inList) {
            rebuilt.push(line.replace(/^([-*•·]|\d+[.)、])\s*/, ''));
            inList = true;
          } else {
            rebuilt.push(line.replace(/^([-*•·]|\d+[.)、])\s*/, ''));
          }
        } else {
          inList = false;
          rebuilt.push(line);
        }
      }
      const next = rebuilt.join('\n');
      if (next !== out) {
        changes.push('列表扁平化，打散 AI 偏好的工整结构');
        out = next;
      }
    }

    // 3. 句子长度打散：把长句在逗号处随机断开，短句合并
    if (cfg.varySentenceLength) {
      const sentences = out.split(/(?<=[。！？!?])/).filter((s) => s.trim());
      const reshaped = sentences.map((s, i) => {
        if (s.length > 60 && /[，,]{1}/.test(s) && i % 2 === 0) {
          const idx = s.indexOf('，');
          if (idx > 15) {
            return `${s.slice(0, idx)}。${s.slice(idx + 1)}`;
          }
        }
        return s;
      });
      const next = reshaped.join('');
      if (next !== out) {
        changes.push('长短句交错，打破均匀节奏');
        out = next;
      }
    }

    return { text: out, changes };
  }

  /** 提取参考文章的"用词 DNA" */
  extractStyleDna(reference: string): string {
    const plain = reference.replace(/<[^>]+>/g, '').trim();
    const words = new Map<string, number>();
    for (const seg of plain.match(/[\u4e00-\u9fa5]{2,4}/g) ?? []) {
      words.set(seg, (words.get(seg) ?? 0) + 1);
    }
    const top = [...words.entries()]
      .filter(([w, c]) => c > 1 && w.length >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([w]) => w);
    return top.join('、');
  }

  /**
   * 执行去 AI 味流程：本地打散 -> LLM 重写 -> 复检，循环到达标或达最大次数
   */
  async run(
    content: string,
    options: {
      config?: Partial<DeAiConfig>;
      reference?: string;
      onAttempt?: (attempt: number, score: AiFlavorScore) => void;
    } = {},
  ): Promise<DeAiResult> {
    const cfg = mergeConfig(DEFAULT_DE_AI, options.config ?? {});
    const changes: string[] = [];

    if (!cfg.enabled) {
      const score = scoreAiFlavor(content);
      return {
        content,
        humanScore: score.humanScore,
        aiScore: score.aiScore,
        wordsAnalyzed: score.details.totalChars,
        changes: ['去 AI 味功能已关闭'],
        attempts: 0,
        passed: true,
      };
    }

    let current = content;
    let score = scoreAiFlavor(current);

    // 第一步：本地确定性打散
    if (cfg.intensity >= 0.3) {
      const { text, changes: localChanges } = this.localRestructure(current, cfg);
      if (localChanges.length) {
        current = text;
        changes.push(...localChanges);
        score = scoreAiFlavor(current);
      }
    }

    // 第二步：LLM 深度重写（迭代到达标）
    const dna = options.reference ? this.extractStyleDna(options.reference) : '';
    let attempts = 0;
    let passed = score.humanScore >= cfg.targetHumanScore;

    for (let i = 0; i < cfg.maxAttempts; i++) {
      if (passed) break;
      attempts++;
      options.onAttempt?.(attempts, score);

      try {
        const system = buildDeAiSystemPrompt(cfg, dna, score, attempts);
        const rewritten = await llmService.chat({
          system,
          user: `请重写下面这段内容，去除 AI 味。\n\n${current}`,
          temperature: 0.9 + cfg.intensity * 0.15,
          maxTokens: 8000,
        });

        if (!rewritten || rewritten.length < current.length * 0.4) {
          logger.warn(`第 ${attempts} 次去 AI 味重写结果异常，放弃本轮`);
          break;
        }

        current = rewritten.trim();
        score = scoreAiFlavor(current);
        passed = score.humanScore >= cfg.targetHumanScore;
        changes.push(`第 ${attempts} 轮 LLM 重写，人工率提升至 ${score.humanScore}%`);
      } catch (err) {
        logger.warn(`去 AI 味重写失败: ${(err as Error).message}`);
        break;
      }
    }

    // 情感微扰：注入主观色彩与反问（最后一层）
    if (cfg.injectEmotion && score.humanScore < cfg.targetHumanScore + 5) {
      try {
        const withEmotion = await llmService.chat({
          system: `你是中文写作高手。请在【保持原意、保持长度基本不变】的前提下，为下面这段文字加入人的口气：
1. 可以有判断和取舍，但不要编造经历
2. 最多 1-2 处反问，不要通篇感叹
3. 禁止另起文学场景（图书馆、推门、深夜氛围）
4. 事实、数字、步骤必须保留
5. 不要出现任何 AI 味连接词（如"综上所述""值得注意的是"）`,
          user: current,
          temperature: 1.0,
          maxTokens: 8000,
        });
        const nextScore = scoreAiFlavor(withEmotion);
        if (nextScore.humanScore >= score.humanScore) {
          current = withEmotion.trim();
          score = nextScore;
          passed = score.humanScore >= cfg.targetHumanScore;
          changes.push(`注入情感色彩与主观偏见，人工率 ${score.humanScore}%`);
        }
      } catch {
        /* 忽略 */
      }
    }

    return {
      content: current,
      humanScore: score.humanScore,
      aiScore: score.aiScore,
      wordsAnalyzed: score.details.totalChars,
      changes,
      attempts,
      passed,
    };
  }
}

function buildDeAiSystemPrompt(
  cfg: DeAiConfig,
  dna: string,
  score: AiFlavorScore,
  attempt: number,
): string {
  const d = score.details;
  const problems: string[] = [];

  if (d.connectorHits.length) {
    problems.push(
      `存在 AI 味连接词：${d.connectorHits.map((c) => `${c.word}×${c.count}`).join('、')}`,
    );
  }
  if (d.listRatio > 0.25) problems.push(`列表化程度过高（${(d.listRatio * 100).toFixed(0)}%）`);
  if (d.sentenceLengthVariance < 0.5) {
    problems.push(`句长过于均匀（变异系数 ${d.sentenceLengthVariance}，均长 ${d.avgSentenceLength} 字）`);
  }
  if (d.paragraphLengthVariance < 0.4) problems.push(`段落长度过于整齐（变异系数 ${d.paragraphLengthVariance}）`);
  if (d.fillerRatio > 0.12) problems.push(`虚词密度偏高（${(d.fillerRatio * 100).toFixed(1)}%）`);
  if (d.parallelStructureRatio > 0.15) problems.push(`并列句式过多（"不仅…而且…"类）`);
  if (d.emotionWords < 5) problems.push('口气偏说明书，可增加判断与口语，但不要编故事');

  return `你是一位深谙"去AI味"对抗检测的资深中文编辑。这是第 ${attempt} 轮重写。

## 当前检测结果
- AI 味指数：${score.aiScore}%（目标：降到 ${100 - cfg.targetHumanScore}% 以下）
- 人工率：${score.humanScore}%（目标：${cfg.targetHumanScore}% 以上）
- 分析字数：${d.totalChars}

## 发现的问题
${problems.length ? problems.map((p, i) => `${i + 1}. ${p}`).join('\n') : '1. 结构仍有 AI 痕迹，请进一步口语化'}

## 重写要求
1. **结构粉碎**：打散工整的列表与段落，长短句交错，避免"总-分-总"完美结构
2. **禁用词汇**：${AI_CONNECTORS.slice(0, 12).join('、')} 等一律不得出现
3. **情感注入**：可加入判断和口语，但不得另起文学场景，不得把说明/测评改成故事
4. **用词 DNA**：${dna ? `参考风格用词倾向：${dna}` : '使用更接地气的大众口语'}
5. **细节具体化**：把抽象概括换成可核对的数字、步骤、案例，不要编造场景小品
6. **保持原意**：不改变核心观点与事实，专有名词、版本号、操作路径必须保留
7. **长度**：与原文接近（±20%），不得大幅删减

## 严格禁止
- 不得输出任何解释、说明、开场白
- 不得使用 Markdown 代码块
- 不得出现"以下是""希望对你有帮助"等 AI 套话
- 不得在结尾加总结陈词

直接输出重写后的正文。`;
}

export const deAiEngine = new DeAiEngine();
