import { DIMENSION_CATEGORIES, type DimensionCategoryMeta, type SelectedDimension } from '@smg/shared';
import { llmService } from './llm.service.js';
import { logger } from '../core/logger.js';

/** 维度兼容性矩阵：部分维度组合在一起会互相冲突 */
const CONFLICTS: [string, string][] = [
  ['news', 'personality'],
  ['news', 'fantasy'],
  ['academic', 'slang'],
  ['academic', 'epic'],
  ['academic', 'fairy_tale'],
  ['academic', 'mystery_detective'],
  ['children', 'suspense'],
  ['report', 'diary'],
  ['manual', 'essay'],
];

export type DimensionSelection = {
  selected: SelectedDimension[];
  compatibility: number;
  warnings: string[];
};

class CreativeService {
  private categories(): DimensionCategoryMeta[] {
    return DIMENSION_CATEGORIES;
  }

  /** 依据选题自动挑选维度：只选能整词命中的受众/情绪/主题，绝不随机套场景或文体 */
  autoSelect(topic: string, maxDimensions = 3): SelectedDimension[] {
    const cats = this.categories();
    const priority = ['audience', 'emotion', 'theme'];
    const picked: SelectedDimension[] = [];
    const used = new Set<string>();

    for (const key of priority) {
      if (picked.length >= maxDimensions) break;
      const cat = cats.find((c) => c.key === key);
      if (!cat || used.has(key)) continue;

      const option = this.pickByTopic(topic, cat);
      if (!option) continue;
      used.add(key);
      picked.push({
        category: key,
        categoryLabel: cat.label,
        option: option.value,
        description: option.description,
      });
    }

    return picked;
  }

  /** 必须整词命中选项名，避免「小说转剧本」误配成文体「小说」 */
  private pickByTopic(topic: string, cat: DimensionCategoryMeta) {
    const text = topic.trim();
    if (!text) return null;
    let best: { value: string; description?: string; hits: number } | null = null;

    for (const opt of cat.options) {
      if (!opt.value || opt.value.length < 2) continue;
      if (!text.includes(opt.value)) continue;
      const hits = opt.value.length;
      if (!best || hits > best.hits) {
        best = { value: opt.value, description: opt.description, hits };
      }
    }

    return best ? { value: best.value, description: best.description } : null;
  }

  /** 校验维度组合兼容性 */
  checkCompatibility(dims: SelectedDimension[]): DimensionSelection {
    const keys = dims.map((d) => d.category);
    const warnings: string[] = [];
    let penalties = 0;

    for (const [a, b] of CONFLICTS) {
      if (keys.includes(a) && keys.includes(b)) {
        const la = dims.find((d) => d.category === a)?.option;
        const lb = dims.find((d) => d.category === b)?.option;
        if (
          (a === 'news' && ['李白', '奇幻文学', '悬疑侦探'].includes(lb ?? '')) ||
          (b === 'news' && ['李白', '奇幻文学', '悬疑侦探'].includes(la ?? '')) ||
          (a === 'academic' && ['网络流行', '史诗气概', '寓言故事'].includes(lb ?? '')) ||
          (b === 'academic' && ['网络流行', '史诗气概', '寓言故事'].includes(la ?? '')) ||
          (a === 'children' && lb === '悬疑惊悚') ||
          (a === 'report' && lb === '日记体') ||
          (a === 'manual' && lb === '随笔杂谈')
        ) {
          warnings.push(`「${la}」与「${lb}」组合存在风格冲突，已自动降低其中一方的强度`);
          penalties += 0.25;
        }
      }
    }

    if (dims.length > 5) {
      warnings.push('启用维度超过 5 个，内容可能过于跳脱，建议精简');
      penalties += 0.2;
    }

    const compatibility = Number(Math.max(0, 1 - penalties).toFixed(2));
    return { selected: dims, compatibility, warnings };
  }

  /** 构建维度化创意提示词片段 */
  buildPrompt(dims: SelectedDimension[], intensity: number): string {
    if (dims.length === 0) return '';

    const lines = dims.map(
      (d) => `- ${d.categoryLabel}：${d.option}${d.description ? `（${d.description}）` : ''}`,
    );
    const strength =
      intensity >= 1.2
        ? '强烈体现（可打破常规，但核心信息不可改变）'
        : intensity >= 0.8
          ? '明显体现（风格可辨，逻辑仍完整）'
          : '轻微体现（点到为止）';

    return `
## 维度化创意要求（强度：${strength}）
${lines.join('\n')}

请在保持核心事实、数字、步骤与观点不变的前提下，按上述维度调整口气与节奏：
- 维度之间需相互协调，不要机械堆砌
- 禁止另起无关文学场景（图书馆、推门、书架、深夜氛围等）
- 不要把说明/测评改成小说、剧本或寓言
- 不要在文中提及"维度""风格"等元概念
`;
  }

  /** 交给 LLM 执行维度化重写 */
  async transform(
    content: string,
    title: string,
    dims: SelectedDimension[],
    intensity = 1,
    preserveCore = true,
  ): Promise<string> {
    if (dims.length === 0) return content;

    const { warnings } = this.checkCompatibility(dims);
    const prompt = this.buildPrompt(dims, intensity);

    try {
      const out = await llmService.chat({
        system: `你是一位擅长多风格创作的中文写作者，接到任务后直接输出重写后的正文，不要任何解释。

${prompt}
额外约束：
- 字数与原文接近（±25%）
- 不得使用 Markdown 代码块
- 不得出现"以下是""综上所述"等套话
- ${preserveCore ? '核心信息、专有名词、版本号与操作步骤必须保留' : '允许较大幅度改写，但仍不得编造事实'}
- ${warnings.length ? `注意：${warnings.join('；')}` : ''}`,
        user: `原文标题：${title}\n\n原文正文：\n${content}`,
        temperature: 0.9,
        maxTokens: 12000,
      });
      return out.trim() || content;
    } catch (err) {
      logger.warn(`维度化创意变换失败，保留原文: ${(err as Error).message}`);
      return content;
    }
  }
}

export const creativeService = new CreativeService();
