import { getDb, query, queryOne, run } from '../db/connection.js';
import {
  buildDefaultConfig,
  mergeConfig,
  DEFAULT_PROVIDERS,
  HOT_PLATFORM_PRESETS,
  type AppConfig,
  type HotPlatform,
  type LlmProviderKey,
  type ProviderConfig,
} from '@smg/shared';
import { DIMENSION_CATEGORIES } from '@smg/shared';

const CONFIG_KEY = 'app';

export class ConfigService {
  private cache: AppConfig | null = null;

  get(): AppConfig {
    if (this.cache) return this.cache;

    const row = queryOne<{ value: string }>(
      'SELECT value FROM app_config WHERE key = ?',
      [CONFIG_KEY],
    );

    let stored: Partial<AppConfig> | null = null;
    if (row?.value) {
      try {
        stored = JSON.parse(row.value);
      } catch {
        stored = null;
      }
    }

    const defaults = buildDefaultConfig();
    const merged = mergeConfig(defaults, stored);

    // 合并后再补回用户自定义的服务商：mergeConfig 默认只接受默认值里存在的 key，
    // 否则新建的自定义服务商会在读取时被丢弃
    if (stored?.api?.providers) {
      merged.api.providers = {
        ...merged.api.providers,
        ...(stored.api.providers as Record<string, ProviderConfig>),
      } as typeof merged.api.providers;
    }

    // 热榜平台数组会被用户配置整表覆盖，这里把新增预设补进列表（不改已有项）
    merged.platforms = ensureHotPlatforms(merged.platforms);

    // 附加载模板分类，便于前端直接渲染
    const categoryRows = query<{ name: string }>(
      'SELECT DISTINCT category as name FROM templates ORDER BY category',
    );
    merged.expertTracks = merged.expertTracks ?? [];
    (merged as any).__templateCategories = categoryRows.map((r) => r.name);

    this.cache = merged;
    return merged;
  }

  save(next: Partial<AppConfig>): AppConfig {
    const current = this.get();
    const merged = mergeConfig(current, next);
    this.cache = merged;
    this.persist(merged);
    return merged;
  }

  reset(): AppConfig {
    const defaults = buildDefaultConfig();
    this.cache = defaults;
    this.persist(defaults);
    return defaults;
  }

  private persist(config: AppConfig) {
    const payload = JSON.stringify(config);
    run(
      `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [CONFIG_KEY, payload],
    );
  }

  /* ---------------- 快捷访问 ---------------- */

  get provider(): ProviderConfig {
    const cfg = this.get();
    const key = cfg.api.apiType as LlmProviderKey;
    return cfg.api.providers[key] ?? (DEFAULT_PROVIDERS[key] as ProviderConfig | undefined);
  }

  get isLlmReady(): boolean {
    try {
      const p = this.provider;
      if (!p) return false;
      if (p.key === 'Ollama') return true;
      return Boolean(p.apiKey?.trim() && p.apiBase?.trim() && p.model?.trim());
    } catch {
      return false;
    }
  }

  get validWechatCredentials() {
    return this.get()
      .wechat.credentials.filter((c) => c.appid?.trim() && c.appsecret?.trim());
  }

  /* ---------------- 维度元数据 ---------------- */

  static get dimensionCategories() {
    return DIMENSION_CATEGORIES;
  }
}

/** 将 HOT_PLATFORM_PRESETS 中尚未出现的平台并入用户配置，并尽量保持预设顺序 */
function ensureHotPlatforms(platforms: HotPlatform[]): HotPlatform[] {
  const existingByName = new Map((Array.isArray(platforms) ? platforms : []).map((p) => [p.name, { ...p }]));
  const out: HotPlatform[] = [];
  const used = new Set<string>();

  for (const preset of HOT_PLATFORM_PRESETS) {
    const existing = existingByName.get(preset.name);
    if (existing) {
      if (!existing.tophubId && preset.tophubId) existing.tophubId = preset.tophubId;
      if (!existing.zhiweiId && preset.zhiweiId) existing.zhiweiId = preset.zhiweiId;
      if (!existing.type && preset.type) existing.type = preset.type;
      if (!existing.rssUrl && preset.rssUrl) existing.rssUrl = preset.rssUrl;
      out.push(existing);
    } else {
      out.push({ ...preset, enabled: true });
    }
    used.add(preset.name);
  }

  // 保留用户自定义、不在预设中的平台
  for (const p of Array.isArray(platforms) ? platforms : []) {
    if (used.has(p.name)) continue;
    out.push(p);
  }
  return out;
}

export const configService = new ConfigService();

// 进程退出时释放连接
process.on('exit', () => {
  try {
    getDb().close();
  } catch {
    /* ignore */
  }
});
