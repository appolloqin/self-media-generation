import { Router } from 'express';
import { z } from 'zod';
import {
  DEFAULT_PROVIDERS,
  BUILTIN_PROVIDER_KEYS,
  DIMENSION_CATEGORIES,
  PUBLISH_PLATFORMS,
  PLATFORM_LABELS,
  HOT_PLATFORM_PRESETS,
  WORKFLOW_STAGES,
  buildProviderList,
} from '@smg/shared';
import { configService } from '../services/config.service.js';
import { llmService } from '../services/llm.service.js';
import { wechatPublisher } from '../services/wechat-publisher.service.js';
import { query, queryOne, run } from '../db/connection.js';
import { ok, wrap, num, intParam, HttpError } from './helpers.js';
import type { AppConfig, ProviderConfig, WechatCredential } from '@smg/shared';

const r = Router();

/* ---------------- 概览 ---------------- */

r.get(
  '/config',
  wrap((_req, res) => {
    const cfg = configService.get();
    ok(res, {
      ...cfg,
      // 用 buildProviderList 取「用户已保存的真实值」，而不是 DEFAULT_PROVIDERS，
      // 否则前端表格里用户填的 API Key / 模型名会显示为空
      providers: buildProviderList(cfg),
      templateCategories: query<{ name: string }>('SELECT DISTINCT category as name FROM templates ORDER BY category'),
      llmReady: configService.isLlmReady,
      wechatReady: configService.validWechatCredentials.length > 0,
    });
  }),
);

r.put(
  '/config',
  wrap((req, res) => {
    const patch = req.body as Partial<AppConfig>;
    ok(res, configService.save(patch));
  }),
);

r.post(
  '/config/reset',
  wrap((_req, res) => ok(res, configService.reset())),
);

/* ---------------- 大模型 ---------------- */

/** 统一取出某个服务商的配置：优先用户已保存的值，其次内置预设 */
function resolveProvider(cfg: AppConfig, key: string): ProviderConfig {
  const saved = cfg.api.providers[key];
  if (saved) return { ...DEFAULT_PROVIDERS.Custom, ...saved, key };
  const preset = DEFAULT_PROVIDERS[key];
  if (!preset) throw new HttpError(`未知服务商：${key}`, 404);
  return structuredClone(preset);
}

/** 校验 key 只含安全字符，可直接用于配置存储与 URL 路径 */
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

r.get(
  '/llm/providers',
  wrap((_req, res) => ok(res, buildProviderList(configService.get()))),
);

r.put(
  '/llm/providers/:key',
  wrap((req, res) => {
    const key = String(req.params.key);
    const cfg = configService.get();
    // 允许更新内置项和自定义项
    const current = resolveProvider(cfg, key);
    const patch = req.body as Partial<{
      label: string;
      apiKey: string;
      model: string;
      apiBase: string;
      maxTokens: number;
      models: string[];
    }>;
    cfg.api.providers[key] = {
      ...current,
      ...patch,
      models: patch.models?.length ? patch.models : current.models,
    };
    configService.save({ api: { apiType: cfg.api.apiType, providers: cfg.api.providers } });
    ok(res, cfg.api.providers[key]);
  }),
);

/** 新建自定义 OpenAI 兼容服务商 */
r.post(
  '/llm/providers',
  wrap((req, res) => {
    const body = z
      .object({
        key: z
          .string()
          .min(1, '标识不能为空')
          .regex(KEY_RE, '标识只能包含字母、数字、下划线和短横线')
          .optional(),
        label: z.string().min(1, '显示名称不能为空').max(40),
        apiBase: z.string().min(1, '接口地址不能为空').max(300),
        model: z.string().max(120).optional().default(''),
        apiKey: z.string().max(200).optional().default(''),
        maxTokens: z.number().int().min(256).max(1_000_000).optional().default(8192),
        models: z.array(z.string()).optional().default([]),
      })
      .parse(req.body ?? {});

    const cfg = configService.get();

    // 未指定 key 时用 label 派生唯一标识
    const key = body.key?.trim() || deriveProviderKey(body.label);
    let unique = key;
    let n = 1;
    // 已被自定义项占用则加数字后缀；撞上内置项则直接拒绝，避免覆盖官方预设
    while (cfg.api.providers[unique]?.custom) {
      unique = `${key}_${++n}`;
    }
    if (BUILTIN_PROVIDER_KEYS.has(unique) || cfg.api.providers[unique]) {
      throw new HttpError(`服务商标识「${unique}」已存在，请换一个`, 409);
    }
    const finalKey = unique;

    const apiBase = normalizeApiBase(body.apiBase);
    const provider: ProviderConfig = {
      key: finalKey,
      label: body.label,
      apiBase,
      model: body.model,
      models: body.models,
      apiKey: body.apiKey,
      maxTokens: body.maxTokens,
      envKeyName: `${finalKey.toUpperCase().replace(/-/g, '_')}_API_KEY`,
      custom: true,
    };

    cfg.api.providers[finalKey] = provider;
    configService.save({ api: { apiType: cfg.api.apiType, providers: cfg.api.providers } });
    ok(res, provider, 201);
  }),
);

/** 删除自定义服务商（内置项禁止删除） */
r.delete(
  '/llm/providers/:key',
  wrap((req, res) => {
    const key = String(req.params.key);
    if (BUILTIN_PROVIDER_KEYS.has(key)) throw new HttpError('内置服务商不可删除', 400);

    const cfg = configService.get();
    if (!cfg.api.providers[key]) throw new HttpError('服务商不存在', 404);
    if (cfg.api.apiType === key) throw new HttpError('该服务商正在使用中，请先切换到其他服务商', 400);

    delete cfg.api.providers[key];
    configService.save({ api: { apiType: cfg.api.apiType, providers: cfg.api.providers } });
    ok(res, { removed: true, key });
  }),
);

r.post(
  '/llm/test',
  wrap(async (req, res) => {
    const { providerKey } = req.body as { providerKey?: string };
    const out = await llmService.testConnection(providerKey);
    ok(res, out);
  }),
);

r.get(
  '/llm/models/:key',
  wrap(async (req, res) => {
    const key = String(req.params.key);
    // 自定义项也允许拉取模型列表
    resolveProvider(configService.get(), key);
    ok(res, await llmService.listModels(key));
  }),
);

/** 补全 apiBase：用户常只填到域名，这里自动补 /v1 */
function normalizeApiBase(input: string): string {
  let base = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  if (!/\/chat\/completions$/.test(base) && !/\/v\d+$/.test(base) && !/\/(openai|compatible-mode|paas)$/.test(base)) {
    base = `${base}/v1`;
  }
  return base;
}

/**
 * 从显示名称派生一个合法标识。
 * 保留其中可读的 ASCII 部分（如「MyGateway 内部」→ MyGateway），
 * 纯中文名称则退化为 custom，避免出现全是下划线或只剩零散数字的无意义 key
 * （例如「我的网关 #1」若直接取数字会得到 key=1，丢失语义）。
 */
function deriveProviderKey(label: string): string {
  const ascii = label
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  // 至少要有 2 个字母才认为是有意义的标识，否则退回通用名
  if (/[A-Za-z]{2,}/.test(ascii)) return ascii;
  return 'custom';
}

/* ---------------- 微信公众号 ---------------- */

const credSchema = z.object({
  appid: z.string().min(1, 'AppID 不能为空'),
  appsecret: z.string().min(1, 'AppSecret 不能为空'),
  author: z.string().optional().default(''),
  callSendall: z.boolean().optional().default(false),
  sendall: z.boolean().optional().default(true),
  tagId: z.number().optional().default(0),
});

r.post(
  '/wechat/credentials/test',
  wrap(async (req, res) => {
    const cred = req.body as WechatCredential;
    if (!cred?.appid || !cred?.appsecret) throw new HttpError('请填写 AppID 与 AppSecret');
    ok(res, await wechatPublisher.testCredential(cred));
  }),
);

r.put(
  '/wechat/credentials',
  wrap((req, res) => {
    const cfg = configService.get();
    const list = [...cfg.wechat.credentials];
    const body = req.body as { index?: number; credential: WechatCredential };
    const cred = credSchema.parse(body.credential) as WechatCredential;
    if (body.index === undefined || body.index < 0) list.push(cred);
    else list[body.index] = cred;
    configService.save({ wechat: { credentials: list } });
    ok(res, list);
  }),
);

r.delete(
  '/wechat/credentials/:index',
  wrap((req, res) => {
    const cfg = configService.get();
    const index = num(req.params.index, 'index') - 1;
    const list = cfg.wechat.credentials.filter((_, i) => i !== index);
    if (list.length === list.length) throw new HttpError('凭据不存在', 404);
    configService.save({ wechat: { credentials: list } });
    ok(res, list);
  }),
);

/* ---------------- 热点平台 / RSS ---------------- */

r.get(
  '/hot/platforms',
  wrap((_req, res) => ok(res, configService.get().platforms)),
);

r.put(
  '/hot/platforms',
  wrap((req, res) => {
    const platforms = req.body as AppConfig['platforms'];
    if (!Array.isArray(platforms)) throw new HttpError('platforms 必须是数组');
    // 补全预设里缺失的字段
    const merged = platforms.map((p) => {
      const preset = HOT_PLATFORM_PRESETS.find((x) => x.name === p.name);
      return {
        ...(preset ?? { name: p.name, weight: 0.05, zhiweiId: null, tophubId: null }),
        ...p,
      };
    });
    configService.save({ platforms: merged });
    ok(res, merged);
  }),
);

r.get(
  '/rss',
  wrap((_req, res) =>
    ok(
      res,
      query<any>(
        'SELECT id, name, url, category, weight, enabled, created_at AS createdAt FROM rss_subscriptions ORDER BY id',
      ),
    ),
  ),
);

r.post(
  '/rss',
  wrap((req, res) => {
    const { name, url, category, weight } = req.body as {
      name: string;
      url: string;
      category?: string;
      weight?: number;
    };
    if (!name?.trim()) throw new HttpError('请填写订阅名称');
    if (!/^https?:\/\//.test(url ?? '')) throw new HttpError('RSS 地址必须以 http(s):// 开头');
    const res2 = run('INSERT INTO rss_subscriptions (name, url, category, weight) VALUES (?,?,?,?)', [
      name.trim(),
      url.trim(),
      category ?? 'RSS',
      weight ?? 0.05,
    ]);
    ok(res, Number(res2.lastInsertRowid), 201);
  }),
);

r.patch(
  '/rss/:id',
  wrap((req, res) => {
    const id = num(req.params.id);
    const patch = req.body as { enabled?: boolean; weight?: number; name?: string; url?: string };
    const cur = queryOne('SELECT * FROM rss_subscriptions WHERE id = ?', [id]);
    if (!cur) throw new HttpError('订阅不存在', 404);
    run('UPDATE rss_subscriptions SET name=?, url=?, weight=?, enabled=? WHERE id = ?', [
      patch.name ?? cur.name,
      patch.url ?? cur.url,
      patch.weight ?? cur.weight,
      patch.enabled === undefined ? cur.enabled : patch.enabled ? 1 : 0,
      id,
    ]);
    ok(res, { id });
  }),
);

r.delete(
  '/rss/:id',
  wrap((req, res) => {
    run('DELETE FROM rss_subscriptions WHERE id = ?', [num(req.params.id)]);
    ok(res, { removed: true });
  }),
);

/* ---------------- 元数据 ---------------- */

r.get('/meta/platforms', wrap((_req, res) => ok(res, PUBLISH_PLATFORMS.map((p) => ({ id: p, label: PLATFORM_LABELS[p] })))));

r.get('/meta/dimensions', wrap((_req, res) => ok(res, DIMENSION_CATEGORIES)));

r.get('/meta/workflow-stages', wrap((_req, res) => ok(res, WORKFLOW_STAGES)));

/* ---------------- 任务记录 ---------------- */

r.get(
  '/tasks',
  wrap((req, res) => {
    const page = intParam(req.query.page, 1);
    const pageSize = intParam(req.query.pageSize, 20, 1, 100);
    const items = query<any>(
      `SELECT id, topic, platform, status, stage, progress, article_id AS articleId, error,
              started_at AS startedAt, finished_at AS finishedAt, duration_ms AS durationMs
       FROM tasks ORDER BY id DESC LIMIT ? OFFSET ?`,
      [pageSize, (page - 1) * pageSize],
    );
    const total =
      query<{ c: number }>('SELECT COUNT(*) as c FROM tasks')[0]?.c ?? 0;
    ok(res, { items, total, page, pageSize });
  }),
);

r.get(
  '/metrics',
  wrap((_req, res) =>
    ok(
      res,
      query<any>(
        `SELECT workflow, count, success_count AS successCount, total_ms AS totalMs,
                last_status AS lastStatus, last_run_at AS lastRunAt
         FROM workflow_metrics`,
      ),
    ),
  ),
);

export default r;
