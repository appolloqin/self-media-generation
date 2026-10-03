import type {
  AppConfig,
  DeepPartial,
  DeAiConfig,
  DimensionalCreativeConfig,
  HotPlatform,
  ImageApiConfig,
  PageDesignConfig,
  ProviderConfig,
  PublishPlatform,
  WechatCredential,
} from './types.js';
import { BUILTIN_PROVIDER_KEYS, DEFAULT_PROVIDERS, HOT_PLATFORM_PRESETS, PROVIDER_ORDER } from './constants.js';

export const DEFAULT_WECHAT_CREDENTIAL: WechatCredential = {
  appid: '',
  appsecret: '',
  author: '',
  callSendall: false,
  sendall: true,
  tagId: 0,
};

export const DEFAULT_IMAGE_API: ImageApiConfig = {
  type: 'openai',
  apiKey: '',
  apiBase: '',
  model: 'seedream-3.0',
  size: '1792x1024',
};

/** 设置页模型快捷选项（写入 model 字段，实际以网关支持为准） */
export const IMAGE_MODEL_PRESETS: {
  key: string;
  label: string;
  model: string;
  hint: string;
}[] = [
  { key: 'seedream', label: 'Seedream', model: 'seedream-3.0', hint: '豆包 / 即梦等网关常见文生图模型' },
  { key: 'wan', label: 'Wan', model: 'wan2.2-t2i-flash', hint: '通义万相（OpenAI 兼容网关）' },
  { key: 'qwen', label: 'Qwen Image', model: 'qwen-image-plus', hint: '通义千问图像' },
  { key: 'minimax', label: 'MiniMax', model: 'image-01', hint: 'MiniMax 图像模型' },
];

export const DEFAULT_DE_AI: DeAiConfig = {
  enabled: true,
  intensity: 0.7,
  breakLists: true,
  varySentenceLength: true,
  injectEmotion: true,
  removeConnectors: true,
  referenceStyle: true,
  targetHumanScore: 75,
  maxAttempts: 3,
};

export const DEFAULT_DIMENSIONAL: DimensionalCreativeConfig = {
  enabled: true,
  creativeIntensity: 1,
  preserveCoreInfo: true,
  autoDimensionSelection: true,
  selectedDimensions: [],
  maxDimensions: 5,
  compatibilityThreshold: 0.6,
};

export const DEFAULT_PAGE_DESIGN: PageDesignConfig = {
  useOriginalStyles: true,
  container: { maxWidth: 750, marginHorizontal: 10, backgroundColor: '#f8f9fa' },
  card: {
    borderRadius: 12,
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  typography: {
    baseFontSize: 16,
    lineHeight: 1.6,
    headingScale: 1.5,
    textColor: '#333333',
    headingColor: '#333333',
  },
  spacing: { sectionMargin: 24, elementMargin: 16 },
  accent: {
    primaryColor: '#3a7bd5',
    secondaryColor: '#00b09b',
    highlightBg: '#f0f7ff',
  },
};

export function buildDefaultConfig(): AppConfig {
  const providers: Record<string, ProviderConfig> = {};
  for (const key of PROVIDER_ORDER) {
    providers[key] = structuredClone(DEFAULT_PROVIDERS[key]);
  }
  const platforms: HotPlatform[] = HOT_PLATFORM_PRESETS.map((p) => ({ ...p, enabled: true }));

  return {
    platforms,
    publishPlatform: 'wechat',
    wechat: { credentials: [structuredClone(DEFAULT_WECHAT_CREDENTIAL)] },
    api: { apiType: 'OpenRouter', providers },
    imgApi: structuredClone(DEFAULT_IMAGE_API),
    useTemplate: true,
    templateCategory: '',
    template: '',
    useCompress: true,
    minArticleLen: 1000,
    maxArticleLen: 2000,
    autoPublish: false,
    articleFormat: 'html',
    formatPublish: true,
    deAi: structuredClone(DEFAULT_DE_AI),
    dimensionalCreative: structuredClone(DEFAULT_DIMENSIONAL),
    pageDesign: structuredClone(DEFAULT_PAGE_DESIGN),
    expertTracks: [],
  };
}

/**
 * 深度合并：以 default 为基准，保留用户值（空值不覆盖）。user 允许只传嵌套片段。
 *
 * @param keepUnknownKeys 是否保留 default 中不存在的用户 key。
 *   默认 false —— 只接受白名单内的字段，避免任意字段写入。
 *   传 true 时用于 providers 这类「用户可自行新增条目」的字典结构（如自定义服务商）。
 */
export function mergeConfig<T>(defaults: T, user?: DeepPartial<T> | null, keepUnknownKeys = false): T {
  if (!user || typeof user !== 'object') return defaults;
  if (Array.isArray(defaults) || typeof defaults !== 'object') {
    return (user ?? defaults) as T;
  }

  const out: any = Array.isArray(defaults) ? [...(defaults as any)] : { ...(defaults as any) };
  for (const [key, value] of Object.entries(user as Record<string, unknown>)) {
    if (!(key in out)) {
      // 新增 key：仅在显式允许时透传；对象/数组直接采用（默认值无从参考）
      if (keepUnknownKeys && value !== undefined && value !== null) {
        out[key] = value;
      }
      continue;
    }
    const defVal = (defaults as any)[key];
    if (defVal && typeof defVal === 'object' && !Array.isArray(defVal) && value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = mergeConfig(defVal, value as any, keepUnknownKeys);
    } else if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  }
  return out as T;
}

export type ProviderView = ProviderConfig & {
  /** 已填写 API Key（Ollama 等本地服务视为始终就绪） */
  configured: boolean;
  /** 当前正在使用 */
  active: boolean;
  /** 用户自定义的服务商，可删除 */
  custom: boolean;
  /** 内置服务商不可删除 */
  builtin: boolean;
};

/**
 * 构建前端展示用的服务商列表：
 * 1. 先按 PROVIDER_ORDER 铺内置项，值取「用户已保存的配置」覆盖默认预设
 * 2. 再追加用户新增的自定义服务商（不在内置顺序中的条目）
 *
 * 注意必须以 cfg.api.providers 里的真实值为准，不能直接返回 DEFAULT_PROVIDERS，
 * 否则用户填的 API Key / 模型名在前端会显示为空。
 */
export function buildProviderList(cfg: AppConfig): ProviderView[] {
  const saved = cfg.api?.providers ?? {};
  const out: ProviderView[] = [];
  const used = new Set<string>();

  for (const key of PROVIDER_ORDER) {
    const preset = DEFAULT_PROVIDERS[key];
    if (!preset) continue;
    used.add(key);
    const user = saved[key];
    out.push(toProviderView({ ...structuredClone(preset), ...(user ?? {}) }, key, cfg.api.apiType));
  }

  // 自定义服务商：用户新增、且不在内置顺序中的
  for (const [key, user] of Object.entries(saved)) {
    if (used.has(key)) continue;
    if (!user?.label && !user?.apiBase) continue;
    out.push(toProviderView({ ...structuredClone(DEFAULT_PROVIDERS.Custom), ...user, key }, key, cfg.api.apiType));
  }

  return out;
}

function toProviderView(p: ProviderConfig, key: string, activeKey: string): ProviderView {
  const builtin = BUILTIN_PROVIDER_KEYS.has(key);
  return {
    ...p,
    key,
    custom: !builtin,
    builtin,
    configured: key === 'Ollama' ? true : Boolean(p.apiKey?.trim()),
    active: activeKey === key,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function countChineseWords(text: string): number {
  if (!text) return 0;
  const plain = text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*`>~\-\[\]()!_]/g, ' ');
  const cjk = plain.match(/[\u4e00-\u9fa5]/g)?.length ?? 0;
  const latin = plain.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return cjk + latin;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function platformLabel(p: string): string {
  const map: Record<string, string> = {
    wechat: '微信公众号',
    xiaohongshu: '小红书',
    douyin: '抖音',
    toutiao: '今日头条',
    baijiahao: '百家号',
    zhihu: '知乎',
    douban: '豆瓣',
    weibo: '微博',
    fanqie: '番茄小说',
  };
  return map[p] ?? p;
}
