import { configService } from './config.service.js';
import { logger } from '../core/logger.js';
import { DEFAULT_PROVIDERS } from '@smg/shared';
import type { LlmProviderKey, ProviderConfig } from '@smg/shared';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatOptions = {
  system?: string;
  user?: string;
  messages?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** 覆盖 provider，用于"写作用一个模型、辅助任务用另一个模型" */
  providerKey?: LlmProviderKey;
  timeoutMs?: number;
  json?: boolean;
};

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

const DEFAULT_TIMEOUT = 180_000;

/**
 * 把用户填写的 apiBase 归一化成可直接拼接子路径的 base。
 * 规则：
 *   - 去掉结尾斜杠
 *   - 缺协议时补 https://（本地 http 地址本身带协议，不受影响）
 *   - 允许用户直接填完整的 /chat/completions，这里回退到其上级目录
 */
function normalizeBase(apiBase: string): string {
  let base = (apiBase || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  base = base.replace(/\/chat\/completions$/, '');
  return base;
}

/**
 * 归一化后再判断是否需要补版本段。
 * 兼容自定义 OpenAI 网关的多种写法：
 *   - https://api.x.com            -> /v1/chat/completions
 *   - https://api.x.com/v1         -> /v1/chat/completions
 *   - https://api.x.com/v1/        -> /v1/chat/completions
 *   - https://api.x.com/paas/v4    -> /paas/v4/chat/completions
 *   - https://api.x.com/.../chat/completions -> 取上级目录
 *   - https://api.x.com/openai     -> /openai/chat/completions（不额外补 /v1）
 */
function buildEndpoint(provider: ProviderConfig): string {
  let base = normalizeBase(provider.apiBase);
  if (!base) throw new LlmError(`未配置 ${provider.label} 的接口地址，请前往【系统设置 → 大模型 API】填写`);
  const hasKnownSuffix = /\/v\d+$/.test(base) || /\/(openai|compatible-mode|paas|api)$/.test(base);
  if (!hasKnownSuffix) base = `${base}/v1`;
  return `${base}/chat/completions`;
}

function buildHeaders(provider: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  if (provider.key === 'OpenRouter') {
    headers['HTTP-Referer'] = 'https://github.com/smg-ai/self-media-generation';
    headers['X-Title'] = '智媒工坊';
  }
  return headers;
}

/** 从 OpenAI 兼容响应中提取助手正文（兼容 content 数组 / 部分网关字段） */
function extractAssistantText(json: any): { content: string; finishReason: string; hasReasoning: boolean } {
  const choice = json?.choices?.[0] ?? {};
  const message = choice?.message ?? {};
  let raw = message.content ?? choice?.text ?? json?.content?.[0]?.text ?? '';

  if (Array.isArray(raw)) {
    raw = raw
      .map((part: unknown) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          return String(p.text ?? p.content ?? '');
        }
        return '';
      })
      .join('');
  }

  const content = String(raw ?? '').trim();
  const reasoning = String(
    message.reasoning_content ?? message.reasoning ?? choice?.reasoning_content ?? '',
  ).trim();

  return {
    content,
    finishReason: String(choice?.finish_reason ?? ''),
    hasReasoning: reasoning.length > 0,
  };
}

class LlmService {
  /** 统一的 chat 调用入口（OpenAI 兼容协议） */
  async chat(opts: ChatOptions): Promise<string> {
    const cfg = configService.get();
    const key = opts.providerKey ?? cfg.api.apiType;
    // 兼容自定义服务商：已保存的条目优先，否则回退到内置预设
    const provider = cfg.api.providers[key] ?? (DEFAULT_PROVIDERS[key] as ProviderConfig | undefined);

    if (!provider) throw new LlmError(`未知的模型服务商: ${key}`);
    if (provider.key !== 'Ollama' && !provider.apiKey?.trim()) {
      throw new LlmError(
        `未配置 ${provider.label} 的 API Key，请前往【系统设置 → 大模型 API】填写`,
      );
    }
    if (!provider.apiBase?.trim()) {
      throw new LlmError(
        `未配置 ${provider.label} 的接口地址，请前往【系统设置 → 大模型 API】填写`,
      );
    }
    if (!provider.model) {
      throw new LlmError(`未配置 ${provider.label} 的模型，请前往【系统设置 → 大模型 API】选择`);
    }

    const messages: ChatMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    if (opts.messages?.length) messages.push(...opts.messages);
    else if (opts.user) messages.push({ role: 'user', content: opts.user });

    if (messages.length === 0) throw new LlmError('调用 LLM 时未提供任何消息内容');

    const endpoint = buildEndpoint(provider);
    const requestedTokens = opts.maxTokens ?? provider.maxTokens ?? 8192;

    const callOnce = async (maxTokens: number) => {
      const body: Record<string, unknown> = {
        model: provider.model,
        messages,
        temperature: opts.temperature ?? 0.8,
        max_tokens: maxTokens,
        stream: false,
      };
      if (opts.json) body.response_format = { type: 'json_object' };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: buildHeaders(provider),
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new LlmError(
            `${provider.label} 请求失败 (HTTP ${res.status}): ${text.slice(0, 500)}`,
            res.status,
          );
        }

        const json = (await res.json()) as any;
        return { json, ...extractAssistantText(json) };
      } catch (err) {
        if (err instanceof LlmError) throw err;
        if ((err as Error).name === 'AbortError') {
          throw new LlmError(`${provider.label} 请求超时，请检查网络或更换模型`);
        }
        throw new LlmError(`${provider.label} 调用异常: ${(err as Error).message}`);
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      let result = await callOnce(requestedTokens);

      // 推理模型（如 MiniMax）常把 token 耗在 reasoning_content，导致 content 为空且 finish_reason=length
      if (!result.content && result.finishReason === 'length') {
        const retryTokens = Math.min(100_000, Math.max(requestedTokens * 4, 16_384));
        if (retryTokens > requestedTokens) {
          logger.warn(
            `${provider.label} 输出被截断且正文为空（可能用于模型推理），以 max_tokens=${retryTokens} 重试一次`,
          );
          result = await callOnce(retryTokens);
        }
      }

      if (!result.content) {
        if (result.finishReason === 'length' || result.hasReasoning) {
          throw new LlmError(
            `${provider.label} 返回正文为空（finish_reason=${result.finishReason || 'unknown'}）。` +
              `当前模型可能把输出额度用在了「思考/推理」上。请到【系统设置 → 大模型 API】增大「最大输出 Token」（建议 ≥ 16384），或换用不带长推理的模型后重试。`,
          );
        }
        throw new LlmError(
          `${provider.label} 返回内容为空: ${JSON.stringify(result.json).slice(0, 300)}`,
        );
      }
      return stripCodeFence(result.content);
    } catch (err) {
      if (err instanceof LlmError) throw err;
      throw new LlmError(`${provider.label} 调用异常: ${(err as Error).message}`);
    }
  }

  /** 流式调用 */
  async *chatStream(opts: ChatOptions): AsyncGenerator<string> {
    const cfg = configService.get();
    const key = opts.providerKey ?? cfg.api.apiType;
    const provider = cfg.api.providers[key];
    if (!provider) throw new LlmError(`未知的模型服务商: ${key}`);
    if (provider.key !== 'Ollama' && !provider.apiKey?.trim()) {
      throw new LlmError(`未配置 ${provider.label} 的 API Key`);
    }

    const messages: ChatMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    if (opts.messages?.length) messages.push(...opts.messages);
    else if (opts.user) messages.push({ role: 'user', content: opts.user });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 600_000);

    try {
      const res = await fetch(buildEndpoint(provider), {
        method: 'POST',
        headers: buildHeaders(provider),
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: opts.temperature ?? 0.85,
          max_tokens: opts.maxTokens ?? provider.maxTokens ?? 8192,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new LlmError(
          `${provider.label} 流式请求失败 (HTTP ${res.status}): ${text.slice(0, 300)}`,
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const deltaObj = JSON.parse(data)?.choices?.[0]?.delta;
            const delta = deltaObj?.content ?? deltaObj?.text;
            if (delta) yield String(delta);
          } catch {
            /* ignore malformed line */
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** 探测 Key 是否可用 */
  async testConnection(providerKey?: LlmProviderKey): Promise<{ ok: boolean; message: string }> {
    try {
      const out = await this.chat({
        user: '只回复两个字：正常',
        maxTokens: 32,
        temperature: 0.1,
        timeoutMs: 30_000,
        providerKey,
      });
      return { ok: true, message: `连接成功，模型返回: ${out.slice(0, 40)}` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  /** 拉取服务端可用模型列表 */
  async listModels(providerKey: LlmProviderKey): Promise<string[]> {
    const cfg = configService.get();
    const key = String(providerKey);
    const provider = cfg.api.providers[key] ?? (DEFAULT_PROVIDERS[key] as ProviderConfig | undefined);
    if (!provider) return [];

    // 与 buildEndpoint 复用同一套归一化规则：models 与 chat/completions 同级
    const base = normalizeBase(provider.apiBase);
    if (!base) return provider.models;
    const hasKnownSuffix = /\/v\d+$/.test(base) || /\/(openai|compatible-mode|paas|api)$/.test(base);
    const url = hasKnownSuffix ? `${base}/models` : `${base}/v1/models`;

    try {
      const res = await fetch(url, {
        headers: buildHeaders(provider),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return provider.models;
      const json = (await res.json()) as any;
      const ids: string[] = (json?.data ?? []).map((m: any) => m.id).filter(Boolean);
      return ids.length ? ids : provider.models;
    } catch (err) {
      logger.warn(`拉取 ${provider.label} 模型列表失败: ${(err as Error).message}`);
      return provider.models;
    }
  }
}

/** 移除模型可能附加的 markdown 代码块围栏 */
export function stripCodeFence(text: string): string {
  const out = text.trim();
  const m = out.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/);
  return m ? m[1].trim() : out;
}

export const llmService = new LlmService();
