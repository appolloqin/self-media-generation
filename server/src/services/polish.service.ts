import { llmService } from './llm.service.js';
import { htmlToMarkdown, removeCodeBlocks, sanitizeBrokenMarkdown } from '../utils/content.js';

export type PolishRequest = {
  content: string;
  instruction?: string;
  /** 预设：口语化 / 专业 / 压缩 / 自定义 */
  preset?: 'colloquial' | 'professional' | 'condense' | 'custom';
};

export type PolishResult = {
  content: string;
  instruction: string;
};

const PRESET_PROMPTS: Record<Exclude<PolishRequest['preset'], 'custom' | undefined>, string> = {
  colloquial: '改得更口语、像人说话，保留事实与观点，不要另起文学场景。',
  professional: '改得更专业克制，信息密度更高，去掉空话套话，保留数字与步骤。',
  condense: '在保留核心信息的前提下压缩篇幅约 30%，删掉重复与空话。',
};

/** 组装润色对话：有用户改写要求时不再套内置爆款结构剧本 */
export function buildPolishChat(req: PolishRequest): {
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  instruction: string;
  source: string;
} {
  const raw = req.content?.trim() ?? '';
  const source = /<[a-z][\s\S]*>/i.test(raw) ? htmlToMarkdown(raw).trim() : raw;
  const preset = req.preset ?? 'custom';
  const custom = req.instruction?.trim() ?? '';
  const direction =
    preset === 'custom' ? '完全按「用户改写要求」执行' : PRESET_PROMPTS[preset];
  const instruction = [custom && `用户改写要求：${custom}`, `预设方向：${direction}`]
    .filter(Boolean)
    .join('\n');

  const rails = [
    '直接输出成品正文，不要解释、不要前言后语。',
    '不要输出 HTML；不要用 Markdown 代码围栏包裹全文。',
    '不编造原文没有的参数、链接、效果承诺。',
    '用户未要求时，不要自行加 emoji 小节标题，不要把全文改成固定列表模板。',
  ];

  const system = custom
    ? [
        '你是微信公众号编辑。成稿必须全部落实「用户改写要求」，不要用任何内置爆款模板覆盖用户指定的结构、文风和格式。',
        ...rails,
      ].join('\n')
    : [
        '你是微信公众号编辑。按预设方向改写。',
        ...rails,
        `预设方向：${direction}`,
      ].join('\n');

  const user = [
    custom
      ? `## 用户改写要求（必须全部落实，勿用其他模板替代）\n${custom}`
      : `## 预设方向\n${direction}`,
    '',
    '## 原文',
    source,
  ].join('\n');

  return {
    system,
    user,
    temperature: custom.length >= 20 ? 0.9 : 0.8,
    maxTokens: Math.min(16000, Math.max(6000, Math.ceil(Math.max(source.length, 1) * 2.2))),
    instruction,
    source,
  };
}

class PolishService {
  /** 纯改写，不落库；文章入库由 generate 流水线 save 阶段负责 */
  async rewrite(req: PolishRequest): Promise<PolishResult> {
    const raw = req.content?.trim();
    if (!raw) throw new Error('请粘贴原文');
    if (raw.length > 40_000) throw new Error('原文过长，请控制在 4 万字以内');

    const preset = req.preset ?? 'custom';
    const custom = req.instruction?.trim() ?? '';
    if (preset === 'custom' && !custom) {
      throw new Error('自定义模式请填写润色提示词');
    }

    const chat = buildPolishChat(req);
    if (!chat.source) throw new Error('原文解析为空，请粘贴纯文本或有效 HTML');

    const { instruction } = chat;
    const out = await llmService.chat({
      system: chat.system,
      user: chat.user,
      temperature: chat.temperature,
      maxTokens: chat.maxTokens,
    });

    let content = removeCodeBlocks(out).trim();
    content = content.replace(/([\u4e00-\u9fff])[ \t\u3000]+(?=[\u4e00-\u9fff])/g, '$1');
    content = content.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/i, '').trim();
    content = sanitizeBrokenMarkdown(content);
    if (!content) throw new Error('润色结果为空，请重试');
    return { content, instruction };
  }
}

export const polishService = new PolishService();
