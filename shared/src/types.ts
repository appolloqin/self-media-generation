/**
 * 全局共享类型定义
 * 服务端与前端共用
 */

/* ============================================================
 * 平台
 * ========================================================== */

export const PUBLISH_PLATFORMS = [
  'wechat',
  'xiaohongshu',
  'douyin',
  'toutiao',
  'baijiahao',
  'zhihu',
  'douban',
  'weibo',
  'fanqie',
] as const;

export type PublishPlatform = (typeof PUBLISH_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<PublishPlatform, string> = {
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

export type HotPlatform = {
  name: string;
  weight: number;
  enabled: boolean;
  zhiweiId?: string | null;
  tophubId?: string | null;
  type?: 'native' | 'rss';
  rssUrl?: string | null;
};

/* ============================================================
 * 配置
 * ========================================================== */

/**
 * 内置服务商标识。自定义服务商由用户自行填写 key（建议加前缀 custom_ 避免冲突），
 * 因此这里保留 `| (string & {})` 以允许任意字符串，同时不丢失字面量自动补全。
 */
export type LlmProviderKey =
  | 'OpenRouter'
  | 'Deepseek'
  | 'Grok'
  | 'Claude'
  | 'Qwen'
  | 'Gemini'
  | 'Ollama'
  | 'SiliconFlow'
  | 'Kimi'
  | 'GLM'
  | 'MiniMax'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

export type ProviderConfig = {
  key: LlmProviderKey;
  label: string;
  apiBase: string;
  model: string;
  models: string[];
  apiKey: string;
  maxTokens: number;
  envKeyName: string;
  /** true 表示用户创建的自定义服务商，可被删除；内置项为 false 或未定义 */
  custom?: boolean;
};

export type WechatCredential = {
  appid: string;
  appsecret: string;
  author: string;
  callSendall: boolean;
  sendall: boolean;
  tagId: number;
};

/** 生图服务类型：openai=兼容 /v1/images/generations */
export type ImageApiType = 'openai' | 'ali' | 'picsum' | 'pollinations' | 'none';

export type ImageApiConfig = {
  type: ImageApiType;
  apiKey: string;
  /** OpenAI 兼容接口根地址，如 https://api.example.com/v1 */
  apiBase: string;
  model: string;
  /** 默认尺寸，推荐 1024x1024 或 1792x1024 */
  size: string;
};

export type AppConfig = {
  platforms: HotPlatform[];
  publishPlatform: PublishPlatform;
  wechat: { credentials: WechatCredential[] };
  api: { apiType: LlmProviderKey; providers: Record<string, ProviderConfig> };
  imgApi: ImageApiConfig;
  useTemplate: boolean;
  templateCategory: string;
  template: string;
  useCompress: boolean;
  minArticleLen: number;
  maxArticleLen: number;
  autoPublish: boolean;
  articleFormat: 'html' | 'markdown' | 'txt';
  formatPublish: boolean;
  deAi: DeAiConfig;
  dimensionalCreative: DimensionalCreativeConfig;
  pageDesign: PageDesignConfig;
  expertTracks: ExpertTrackRef[];
};

export type DeAiConfig = {
  enabled: boolean;
  intensity: number; // 0 ~ 1
  breakLists: boolean;
  varySentenceLength: boolean;
  injectEmotion: boolean;
  removeConnectors: boolean;
  referenceStyle: boolean;
  targetHumanScore: number; // 目标人工率(%)
  maxAttempts: number;
};

export type DimensionOption = {
  name: string;
  value: string;
  description?: string;
};

export type DimensionCategoryMeta = {
  key: string;
  label: string;
  options: DimensionOption[];
};

export type DimensionalCreativeConfig = {
  enabled: boolean;
  creativeIntensity: number;
  preserveCoreInfo: boolean;
  autoDimensionSelection: boolean;
  selectedDimensions: string[];
  maxDimensions: number;
  compatibilityThreshold: number;
};

/* ============================================================
 * 专家赛道
 * ========================================================== */

export type ExpertTrackRef = {
  id: number;
  name: string;
  slug: string;
  enabled: boolean;
};

export type ExpertTrack = {
  id: number;
  name: string;
  slug: string;
  description: string;
  audience: string;
  boundary: string;
  structure: string;
  style: string;
  qualityBar: string;
  compliance: string;
  examples: string;
  defaultParams: Record<string, unknown>;
  enabled: boolean;
  isBuiltin: number;
  createdAt: string;
  updatedAt: string;
};

export type ExpertTrackTemplate = {
  id: number;
  trackId: number;
  name: string;
  audience: string;
  depth: 'basic' | 'standard' | 'deep';
  platform: string;
  style: string;
  strategy: string;
  wordMin: number;
  wordMax: number;
  enabled: number;
  createdAt: string;
  updatedAt: string;
};

/* ============================================================
 * 维度化创意
 * ========================================================== */

export type SelectedDimension = {
  category: string;
  categoryLabel: string;
  option: string;
  description?: string;
};

/* ============================================================
 * 文案武库
 * ========================================================== */

export type CopywritingScene = {
  id: number;
  name: string;
  category: string;
  categoryLabel: string;
  description: string;
  structure: string;
  hooks: string;
  tone: string;
  forbidden: string;
  compliance: string;
  needLineBreak: number;
  builtIn: number;
  enabled: number;
  createdAt: string;
  updatedAt: string;
};

export type CopywritingKnob = 'hook' | 'emotion' | 'rhythm' | 'ending' | 'colloquial';

export type CopywritingGenerateRequest = {
  sceneId: number;
  mode: 'original' | 'imitate' | 'transform';
  topic: string;
  referenceContent?: string;
  targetForm?: string;
  knobs?: Partial<Record<CopywritingKnob, string>>;
};

export type CopywritingQuality = {
  score: number;
  hookScore: number;
  rhythmScore: number;
  detailScore: number;
  deAiScore: number;
  issues: string[];
  passed: boolean;
};

/* ============================================================
 * 内容 / 文章
 * ========================================================== */

export type ArticleFormat = 'html' | 'markdown' | 'txt';

export type ArticleStatus = 'draft' | 'published' | 'failed' | 'unpublished';

export type Article = {
  id: number;
  title: string;
  topic: string;
  platform: string;
  category: string;
  format: ArticleFormat;
  content: string;
  summary: string;
  coverPath: string | null;
  tags: string;
  source: 'ai' | 'manual' | 'library' | 'novel' | 'copywriting';
  trackId: number | null;
  sceneId: number | null;
  wordCount: number;
  status: ArticleStatus;
  createdAt: string;
  updatedAt: string;
};

export type ArticlePublishRecord = {
  id: number;
  articleId: number;
  platform: string;
  accountInfo: string;
  success: number;
  error: string | null;
  publishId: string | null;
  url: string | null;
  createdAt: string;
};

export type GenerateRequest = {
  topic: string;
  platform?: string;
  mode?: 'hot' | 'custom' | 'reference';
  reference?: {
    templateCategory?: string;
    templateName?: string;
    urls?: string[];
    ratio?: number;
  };
  dimensions?: SelectedDimension[];
  trackId?: number;
  trackTemplateId?: number;
  deAi?: Partial<DeAiConfig>;
  autoPublish?: boolean;
};

export type ContentResult = {
  title: string;
  content: string;
  summary: string;
  format: ArticleFormat;
  wordCount: number;
  metadata: Record<string, unknown>;
};

/* ============================================================
 * 模板
 * ========================================================== */

export type TemplateCategory = {
  name: string;
  templateCount: number;
  builtin: number;
};

export type Template = {
  id: number;
  name: string;
  category: string;
  content: string;
  builtin: number;
  createdAt: string;
  updatedAt: string;
};

/* ============================================================
 * 素材文库（微信文章采集）
 * ========================================================== */

export type LibraryArticle = {
  id: number;
  title: string;
  author: string;
  accountName: string;
  accountBiz: string;
  url: string;
  contentHtml: string;
  contentText: string;
  contentMarkdown: string;
  images: string;
  publishTime: string;
  digest: string;
  wordCount: number;
  tags: string;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LibraryAccount = {
  id: number;
  name: string;
  biz: string;
  wechatId: string;
  lastFetchAt: string | null;
  lastArticleUrl: string | null;
  enabled: number;
  createdAt: string;
};

export type TopicIdea = {
  id: number;
  topic: string;
  score: number;
  reason: string;
  angles: string;
  refArticleIds: string;
  status: number;
  createdAt: string;
};

/* ============================================================
 * 资源图库
 * ========================================================== */

export type ImageAsset = {
  id: number;
  title: string;
  fileName: string;
  url: string;
  prompt: string;
  source: 'upload' | 'ai' | 'workflow' | 'render';
  style: string;
  tags: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
};

export type ImageStylePreset = {
  id: number;
  name: string;
  promptTemplate: string;
  negativePrompt: string;
  category: string;
  builtin: number;
  createdAt: string;
};

/* ============================================================
 * 小说连载
 * ========================================================== */

export type Novel = {
  id: number;
  title: string;
  genre: string;
  synopsis: string;
  worldSetting: string;
  style: string;
  theme: string;
  status: 'writing' | 'paused' | 'finished';
  targetWords: number;
  finishedWords: number;
  createdAt: string;
  updatedAt: string;
};

export type NovelVolume = {
  id: number;
  novelId: number;
  title: string;
  summary: string;
  orderIndex: number;
  createdAt: string;
};

export type NovelCharacter = {
  id: number;
  novelId: number;
  name: string;
  role: string;
  appearance: string;
  personality: string;
  background: string;
  motivation: string;
  speechStyle: string;
  arc: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type NovelChapter = {
  id: number;
  novelId: number;
  volumeId: number | null;
  title: string;
  outline: string;
  content: string;
  wordCount: number;
  status: 'outline' | 'draft' | 'done';
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type NovelForeshadow = {
  id: number;
  novelId: number;
  name: string;
  description: string;
  plantChapter: string;
  payoffChapter: string;
  status: 'planted' | 'resolved';
  createdAt: string;
};

export type NovelMemory = {
  id: number;
  novelId: number;
  scope: 'short' | 'mid' | 'global';
  title: string;
  content: string;
  weight: number;
  createdAt: string;
};

export type NovelTheme = {
  name: string;
  label: string;
  css: string;
  builtin: number;
};

/* ============================================================
 * 去 AI 味
 * ========================================================== */

export type DeAiResult = {
  content: string;
  humanScore: number;
  aiScore: number;
  wordsAnalyzed: number;
  changes: string[];
  attempts: number;
  passed: boolean;
};

/* ============================================================
 * 热点
 * ========================================================== */

export type HotTopic = {
  platform: string;
  name: string;
  rank: number;
  heat: string;
  url: string;
  source: 'zhiwei' | 'tophub' | 'vvhan' | 'rss' | 'local';
  fetchedAt: string;
};

export type HotTopicGroup = {
  platform: string;
  source: string;
  topics: HotTopic[];
  ok: boolean;
  error?: string;
};

/* ============================================================
 * 工作流 / 任务
 * ========================================================== */

export type TaskStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export type TaskRecord = {
  id: number;
  topic: string;
  platform: string;
  status: TaskStatus;
  stage: string;
  progress: number;
  articleId: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
};

export type LogEntry = {
  type: 'info' | 'success' | 'warning' | 'error' | 'status' | 'internal';
  message: string;
  timestamp: number;
};

export type WsMessage =
  | ({ type: 'log' } & Omit<LogEntry, 'type'> & { level?: LogEntry['type'] })
  | { type: 'progress'; stage: string; progress: number; message?: string }
  | { type: 'completed'; taskId: number; articleId: number | null; message: string }
  | { type: 'failed'; taskId: number; error: string }
  | { type: 'status'; status: TaskStatus; taskId: number | null };

/* ============================================================
 * 页面设计
 * ========================================================== */

export type PageDesignConfig = {
  useOriginalStyles: boolean;
  container: { maxWidth: number; marginHorizontal: number; backgroundColor: string };
  card: { borderRadius: number; boxShadow: string; padding: number; backgroundColor: string };
  typography: {
    baseFontSize: number;
    lineHeight: number;
    headingScale: number;
    textColor: string;
    headingColor: string;
  };
  spacing: { sectionMargin: number; elementMargin: number };
  accent: { primaryColor: string; secondaryColor: string; highlightBg: string };
};

/* ============================================================
 * 账号 / 会话
 * ========================================================== */

export type UserRole = 'admin' | 'editor';

export type PublicUser = {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  /** 是否启用（1/0），停用后无法登录 */
  enabled: number;
  /** 是否仍在使用初始密码（1/0）。仅用于前端展示「建议修改」提醒，不阻断登录 */
  mustChangePassword: number;
  createdAt: string;
  lastLoginAt: string | null;
};

export type AuthUser = PublicUser & {
  passwordHash: string;
  passwordSalt: string;
  mustChangePassword: number;
  enabled: number;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type AuthSettings = {
  /** 关闭后所有接口免登录（仅建议本地调试使用） */
  enabled: boolean;
  /** 未登录时是否允许访客只读访问文章列表等公开接口 */
  allowGuest: boolean;
  /** 登录失败多少次后锁定账号 */
  maxAttempts: number;
  /** 锁定时长（分钟） */
  lockMinutes: number;
  /** 会话有效期（小时） */
  sessionHours: number;
};

export type LoginResult = {
  token: string;
  user: PublicUser;
  expiresAt: string;
  /** true 表示仍在使用初始密码，前端应展示提醒但允许正常进入系统 */
  mustChangePassword: boolean;
};

export type SessionInfo = {
  /** 会话 token */
  id: string;
  userId: number;
  username: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
};

/* ============================================================
 * API 响应
 * ========================================================== */

export type ApiResult<T = unknown> = {
  status: 'success' | 'error';
  data?: T;
  message?: string;
};

/** 深度可选：允许前端只提交配置中某个嵌套片段 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly (infer U)[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type AppConfigPatch = DeepPartial<Omit<AppConfig, 'api' | 'wechat'>> & {
  api?: Partial<AppConfig['api']>;
  wechat?: Partial<AppConfig['wechat']>;
};

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
