import { api } from './client';
import type {
  AppConfig,
  Article,
  ArticlePublishRecord,
  CopywritingGenerateRequest,
  CopywritingKnob,
  CopywritingQuality,
  CopywritingScene,
  ExpertTrack,
  ExpertTrackTemplate,
  HotTopicGroup,
  ImageAsset,
  ImageStylePreset,
  LibraryAccount,
  LibraryArticle,
  LlmProviderKey,
  Novel,
  NovelChapter,
  NovelCharacter,
  NovelForeshadow,
  NovelMemory,
  NovelVolume,
  Paged,
  ProviderConfig,
  ProviderView,
  PublishPlatform,
  SelectedDimension,
  TaskRecord,
  WechatCredential,
  AppConfigPatch,
  AuthSettings,
  LoginResult,
  PublicUser,
  SessionInfo,
} from '@smg/shared';
import type { SearchResult } from '@/types/search';

export type { SearchResult } from '@/types/search';
export * from './client';

/* ---------------- 概览 / 配置 ---------------- */

export type HealthInfo = {
  name: string;
  version: string;
  description: string;
  ok: boolean;
  port: number;
  env: string;
  wsClients: number;
  uptime: number;
  now: string;
};

export type ConfigResponse = AppConfig & {
  providers: ProviderView[];
  templateCategories: { name: string }[];
  llmReady: boolean;
  wechatReady: boolean;
};

export const configApi = {
  get: () => api.get<ConfigResponse>('/config'),
  save: (patch: AppConfigPatch) => api.put<AppConfig>('/config', patch),
  reset: () => api.post<AppConfig>('/config/reset'),
  providers: () => api.get<ProviderView[]>('/llm/providers'),
  saveProvider: (key: LlmProviderKey, patch: Partial<ProviderConfig>) =>
    api.put<ProviderConfig>(`/llm/providers/${key}`, patch),
  createProvider: (data: {
    key?: string;
    label: string;
    apiBase: string;
    model?: string;
    apiKey?: string;
    maxTokens?: number;
    models?: string[];
  }) => api.post<ProviderConfig>('/llm/providers', data),
  removeProvider: (key: LlmProviderKey) => api.delete<{ removed: boolean; key: string }>(`/llm/providers/${key}`),
  testLlm: (providerKey?: LlmProviderKey) => api.post<{ ok: boolean; message: string }>('/llm/test', { providerKey }),
  models: (key: LlmProviderKey) => api.get<string[]>(`/llm/models/${key}`),
  testWechat: (cred: WechatCredential) => api.post<{ ok: boolean; message: string }>('/wechat/credentials/test', cred),
  saveWechat: (credential: WechatCredential, index?: number) =>
    api.put<WechatCredential[]>('/wechat/credentials', { credential, index }),
  removeWechat: (index: number) => api.delete<WechatCredential[]>(`/wechat/credentials/${index}`),
  platforms: () => api.get<AppConfig['platforms']>('/hot/platforms'),
  savePlatforms: (platforms: AppConfig['platforms']) => api.put<AppConfig['platforms']>('/hot/platforms', platforms),
  rss: () => api.get<RssItem[]>('/rss'),
  addRss: (data: { name: string; url: string; category?: string; weight?: number }) => api.post<number>('/rss', data),
  patchRss: (id: number, patch: Partial<Pick<RssItem, 'name' | 'url' | 'weight'>> & { enabled?: boolean }) =>
    api.patch<{ id: number }>(`/rss/${id}`, patch),
  removeRss: (id: number) => api.delete<{ removed: boolean }>(`/rss/${id}`),
  tasks: (page = 1, pageSize = 20) =>
    api.get<Paged<TaskRecord>>('/tasks', { page, pageSize }),
  metrics: () => api.get<WorkflowMetric[]>('/metrics'),
};

export type RssItem = {
  id: number;
  name: string;
  url: string;
  category: string;
  weight: number;
  enabled: number;
  createdAt: string;
};

export type WorkflowMetric = {
  workflow: string;
  count: number;
  successCount: number;
  totalMs: number;
  lastStatus: string;
  lastRunAt: string;
};

/* ---------------- 热点 ---------------- */

export type BlackHorse = {
  platform: string;
  topic: string;
  rank: number;
  heat: number;
  score: number;
  reason: string;
};

export type TrendPrediction = {
  platform: string;
  topic: string;
  direction: 'up' | 'down' | 'flat';
  delta: number;
  heat: string;
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

export const hotApi = {
  list: (limit = 15) => api.get<HotTopicGroup[]>('/hot/list', { limit }),
  blackHorses: (limit = 15, topN = 10) => api.get<BlackHorse[]>('/hot/black-horses', { limit, topN }),
  trend: (limit = 15) => api.get<TrendPrediction[]>('/hot/trend', { limit }),
  pick: (count = 5) => api.get<{ platform: string; topic: string }>('/hot/pick', { count }),
  refresh: () => api.post<{ cleared: boolean }>('/hot/refresh'),
  use: (topic?: string, count?: number) =>
    api.post<{ platform: string; topic: string }>('/hot/use', { topic, count }),
  generateIdeas: (keyword: string, count = 6) => api.post<TopicIdea[]>('/hot/ideas/generate', { keyword, count }),
  ideas: (limit = 30) => api.get<TopicIdea[]>('/hot/ideas', { limit }),
  setIdeaStatus: (id: number, status: number) => api.patch<{ updated: boolean }>(`/hot/ideas/${id}`, { status }),
  removeIdea: (id: number) => api.delete<{ removed: boolean }>(`/hot/ideas/${id}`),
};

/* ---------------- 文章 ---------------- */

export type ArticleQuery = {
  page?: number;
  pageSize?: number;
  platform?: string;
  status?: string;
  source?: string;
  category?: string;
  keyword?: string;
  trackId?: number;
  sceneId?: number;
};

export type ArticleDetail = Article & { publishHistory: ArticlePublishRecord[] };

export type ArticleStats = {
  total: number;
  words: number;
  published: number;
  byPlatform: { platform: string; c: number }[];
  bySource: { source: string; c: number }[];
};

export const articleApi = {
  list: (q: ArticleQuery = {}) => api.get<Paged<Article>>('/articles', q as Record<string, unknown>),
  stats: () => api.get<ArticleStats>('/articles/stats'),
  get: (id: number) => api.get<ArticleDetail>(`/articles/${id}`),
  create: (data: Partial<Article> & { title: string; content: string }) =>
    api.post<Article>('/articles', data),
  update: (id: number, patch: Partial<Article>) => api.put<Article>(`/articles/${id}`, patch),
  remove: (id: number) => api.delete<{ removed: boolean }>(`/articles/${id}`),
  batchRemove: (ids: number[]) => api.post<{ removed: number }>('/articles/batch-delete', { ids }),
  importFile: (file: File, extra: Record<string, string> = {}) => {
    const form = new FormData();
    form.append('file', file);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    return api.upload<Article>('/articles/import', form);
  },
  exportUrl: (id: number) => `/api/articles/${id}/export`,
};

/* ---------------- 生成 ---------------- */

export type GeneratePayload = {
  topic: string;
  platform?: PublishPlatform;
  mode?: 'hot' | 'custom' | 'reference';
  reference?: { templateCategory?: string; templateName?: string; urls?: string[]; ratio?: number };
  dimensions?: SelectedDimension[];
  trackId?: number;
  trackTemplateId?: number;
  deAi?: Record<string, unknown>;
  autoPublish?: boolean;
};

export const generateApi = {
  run: (payload: GeneratePayload) =>
    api.post<{ task: TaskRecord; article: Article | null }>('/generate', payload),
  stop: () => api.post<{ stopping: boolean }>('/generate/stop'),
  status: () => api.get<{ running: boolean }>('/generate/status'),
};

export const deAiApi = {
  analyze: (content: string, config?: Record<string, unknown>, reference?: string) =>
    api.post<{ before: AiFlavorDetail; after: DeAiResultType }>('/deai/analyze', { content, config, reference }),
};

export type AiFlavorDetail = {
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

export type DeAiResultType = {
  content: string;
  humanScore: number;
  aiScore: number;
  wordsAnalyzed: number;
  changes: string[];
  attempts: number;
  passed: boolean;
};

/* ---------------- 排版 ---------------- */

export const layoutApi = {
  preview: (data: { content: string; title?: string; platform?: PublishPlatform; design?: unknown }) =>
    api.post<{ html: string }>('/layout/preview', data),
  local: (data: { content: string; title?: string; design?: unknown }) =>
    api.post<{ html: string }>('/layout/local', data),
};

/* ---------------- 发布 ---------------- */

export type PublishOutcome = {
  success: boolean;
  message: string;
  publishId?: string | null;
  url?: string | null;
};

export const publishApi = {
  platforms: () => api.get<{ id: PublishPlatform; label: string; note: string }[]>('/publish/platforms'),
  publish: (id: number, platform?: PublishPlatform) => api.post<PublishOutcome>(`/publish/${id}`, { platform }),
  preview: (id: number, platform?: PublishPlatform) =>
    api.post<{ platform: string; label: string; content: string; wordCount: number }>(`/publish/${id}/preview`, { platform }),
  history: (id: number) => api.get<ArticlePublishRecord[]>(`/publish/${id}/history`),
  uploadCover: (id: number, file: File, onProgress?: (p: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<{ article: Article; asset: ImageAsset }>(`/publish/${id}/cover`, form, onProgress);
  },
  generateCover: (id: number, prompt?: string) =>
    api.post<{ article: Article; asset: ImageAsset }>(`/publish/${id}/cover/generate`, { prompt }),
  longImage: (id: number) => api.post<{ url: string }>(`/publish/${id}/long-image`),
};

/* ---------------- 模板 ---------------- */

export const templateApi = {
  categories: () => api.get<{ name: string; templateCount: number; builtin: number }[]>('/templates/categories'),
  list: (category?: string) => api.get<TemplateType[]>('/templates', { category }),
  get: (id: number) => api.get<TemplateType>(`/templates/${id}`),
  create: (data: { name: string; category: string; content?: string }) =>
    api.post<TemplateType>('/templates', data),
  update: (id: number, patch: { name?: string; category?: string; content?: string }) =>
    api.put<TemplateType>(`/templates/${id}`, patch),
  remove: (id: number) => api.delete<{ removed: boolean }>(`/templates/${id}`),
  copy: (id: number, name: string, category: string) =>
    api.post<TemplateType>(`/templates/${id}/copy`, { name, category }),
  move: (id: number, category: string) => api.put<TemplateType>(`/templates/${id}/move`, { category }),
  createCategory: (name: string) => api.post<{ name: string }[]>('/template-categories', { name }),
  renameCategory: (oldName: string, newName: string) =>
    api.put<{ oldName: string; newName: string }>(`/template-categories/${encodeURIComponent(oldName)}`, { name: newName }),
  removeCategory: (name: string, force = false) =>
    api.delete<{ removed: boolean }>(`/template-categories/${encodeURIComponent(name)}`, { params: { force: force ? 1 : 0 } }),
  defaultPreview: () => api.get<{ content: string }>('/templates/default/preview'),
};

export type TemplateType = {
  id: number;
  name: string;
  category: string;
  content: string;
  builtin: number;
  createdAt: string;
  updatedAt: string;
};

/* ---------------- 专家赛道 ---------------- */

export const trackApi = {
  list: (onlyEnabled = false) => api.get<ExpertTrack[]>('/tracks', onlyEnabled ? { enabled: 1 } : undefined),
  get: (id: number) => api.get<ExpertTrack & { templates: ExpertTrackTemplate[] }>(`/tracks/${id}`),
  create: (data: Partial<ExpertTrack> & { name: string }) => api.post<ExpertTrack>('/tracks', data),
  update: (id: number, patch: Partial<ExpertTrack>) => api.put<ExpertTrack>(`/tracks/${id}`, patch),
  remove: (id: number) => api.delete<{ removed: boolean }>(`/tracks/${id}`),
  copy: (id: number, name: string) => api.post<ExpertTrack>(`/tracks/${id}/copy`, { name }),
  templates: (trackId?: number) => api.get<ExpertTrackTemplate[]>('/track-templates', { trackId }),
  createTemplate: (data: Partial<ExpertTrackTemplate> & { trackId: number; name: string }) =>
    api.post<ExpertTrackTemplate>('/track-templates', data),
  updateTemplate: (id: number, patch: Partial<ExpertTrackTemplate>) =>
    api.put<ExpertTrackTemplate>(`/track-templates/${id}`, patch),
  removeTemplate: (id: number) => api.delete<{ removed: boolean }>(`/track-templates/${id}`),
  replaceTemplates: (trackId: number, templates: Partial<ExpertTrackTemplate>[]) =>
    api.put<ExpertTrackTemplate[]>(`/tracks/${trackId}/templates`, { templates }),
};

/* ---------------- 文案武库 ---------------- */

export type SceneWithKnobs = CopywritingScene & {
  knobs: { knob: CopywritingKnob; label: string; value: string }[];
};

export type ScenePreset = {
  id: number;
  sceneId: number;
  title: string;
  structure: string;
  hooks: string;
  body: string;
  source: string;
  createdAt: string;
};

export const copywritingApi = {
  scenes: (category?: string) => api.get<SceneWithKnobs[]>('/copywriting/scenes', { category }),
  get: (id: number) => api.get<SceneWithKnobs & { presets: ScenePreset[] }>(`/copywriting/scenes/${id}`),
  create: (data: Partial<CopywritingScene> & { name: string; category: string; categoryLabel: string }) =>
    api.post<CopywritingScene>('/copywriting/scenes', data),
  update: (id: number, patch: Partial<CopywritingScene>) => api.put<CopywritingScene>(`/copywriting/scenes/${id}`, patch),
  remove: (id: number) => api.delete<{ removed: boolean }>(`/copywriting/scenes/${id}`),
  setKnobs: (id: number, knob: CopywritingKnob, values: string[]) =>
    api.put<{ knob: CopywritingKnob; label: string; value: string }[]>(`/copywriting/scenes/${id}/knobs`, { knob, values }),
  generate: (payload: CopywritingGenerateRequest) =>
    api.post<{ content: string; quality: CopywritingQuality; scene: CopywritingScene }>('/copywriting/generate', payload),
  evaluate: (content: string, sceneId: number) => api.post<CopywritingQuality>('/copywriting/evaluate', { content, sceneId }),
  presets: (sceneId: number) => api.get<ScenePreset[]>(`/copywriting/scenes/${sceneId}/presets`),
  addPreset: (sceneId: number, data: { title: string; body: string; structure?: string; hooks?: string; source?: string }) =>
    api.post<{ id: number }>(`/copywriting/scenes/${sceneId}/presets`, data),
  removePreset: (id: number) => api.delete<{ removed: boolean }>(`/copywriting/presets/${id}`),
  toArticle: (data: { content: string; title: string; sceneId?: number; platform?: string; format?: 'html' | 'markdown' | 'txt' }) =>
    api.post<Article>('/copywriting/to-article', data),
};

/* ---------------- 素材文库 ---------------- */

export const libraryApi = {
  list: (q: { page?: number; pageSize?: number; keyword?: string; accountName?: string } = {}) =>
    api.get<Paged<LibraryArticle>>('/library/articles', q),
  get: (id: number) => api.get<LibraryArticle>(`/library/articles/${id}`),
  collect: (urls: string[]) => api.post<{ url: string; ok: boolean; id?: number; title?: string; error?: string }[]>('/library/collect', { urls }),
  update: (id: number, patch: { title?: string; tags?: string }) => api.put<LibraryArticle>(`/library/articles/${id}`, patch),
  remove: (id: number) => api.delete<{ removed: boolean }>(`/library/articles/${id}`),
  search: (keyword: string, limit = 20) =>
    api.get<{ id: number; title: string; accountName: string; url: string; digest: string; wordCount: number; score: number }[]>(
      '/library/search',
      { keyword, limit },
    ),
  fetchUrl: (url: string) => api.post<SearchResult>('/library/fetch', { url }),
  accounts: () => api.get<LibraryAccount[]>('/library/accounts'),
  addAccount: (data: { name: string; biz?: string; wechatId?: string }) => api.post<LibraryAccount>('/library/accounts', data),
  toggleAccount: (id: number, enabled: boolean) => api.patch<{ updated: boolean }>(`/library/accounts/${id}`, { enabled }),
  removeAccount: (id: number) => api.delete<{ removed: boolean }>(`/library/accounts/${id}`),
  trackAccount: (id: number) =>
    api.post<{ url: string; ok: boolean; id?: number; title?: string; error?: string }[]>(`/library/accounts/${id}/track`),
};

/* ---------------- 资源图库 ---------------- */

export const imageApi = {
  list: (q: { page?: number; pageSize?: number; source?: string; style?: string; keyword?: string } = {}) =>
    api.get<Paged<ImageAsset>>('/images', q),
  stats: () => api.get<{ total: number; size: number; bySource: { source: string; c: number }[] }>('/images/stats'),
  upload: (files: File[], onProgress?: (p: number) => void) => {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return api.upload<ImageAsset[]>('/images/upload', form, onProgress);
  },
  importUrl: (data: { url: string; prompt?: string; style?: string }) => api.post<ImageAsset>('/images/import-url', data),
  generate: (data: { prompt: string; size?: string; style?: string; count?: number; presetId?: number }) =>
    api.post<ImageAsset[]>('/images/generate', data),
  update: (id: number, patch: Partial<ImageAsset>) => api.put<ImageAsset>(`/images/${id}`, patch),
  remove: (id: number) => api.delete<{ removed: boolean }>(`/images/${id}`),
  presets: () => api.get<ImageStylePreset[]>('/images/presets'),
  createPreset: (data: Partial<ImageStylePreset> & { name: string }) => api.post<ImageStylePreset>('/images/presets', data),
  updatePreset: (id: number, patch: Partial<ImageStylePreset>) => api.put<ImageStylePreset>(`/images/presets/${id}`, patch),
  removePreset: (id: number) => api.delete<{ removed: boolean }>(`/images/presets/${id}`),
};

/* ---------------- 小说 ---------------- */

export type NovelDetail = Novel & {
  volumes: NovelVolume[];
  characters: NovelCharacter[];
  chapters: NovelChapter[];
  foreshadows: NovelForeshadow[];
  memories: NovelMemory[];
};

export const novelApi = {
  list: () => api.get<Novel[]>('/novels'),
  get: (id: number) => api.get<NovelDetail>(`/novels/${id}`),
  create: (data: Partial<Novel> & { title: string }) => api.post<Novel>('/novels', data),
  update: (id: number, patch: Partial<Novel>) => api.put<Novel>(`/novels/${id}`, patch),
  remove: (id: number) => api.delete<{ removed: boolean }>(`/novels/${id}`),
  themes: () => api.get<{ name: string; label: string; css: string; builtin: number }[]>('/novels/themes'),
  addVolume: (id: number, data: { title: string; summary?: string }) => api.post<NovelVolume>(`/novels/${id}/volumes`, data),
  updateVolume: (id: number, patch: { title?: string; summary?: string }) => api.put<NovelVolume[]>(`/novels/volumes/${id}`, patch),
  removeVolume: (id: number) => api.delete<{ removed: boolean }>(`/novels/volumes/${id}`),
  addCharacter: (id: number, data: Partial<NovelCharacter> & { name: string }) =>
    api.post<NovelCharacter>(`/novels/${id}/characters`, data),
  updateCharacter: (id: number, patch: Partial<NovelCharacter>) => api.put<NovelCharacter[]>(`/novels/characters/${id}`, patch),
  removeCharacter: (id: number) => api.delete<{ removed: boolean }>(`/novels/characters/${id}`),
  addChapter: (id: number, data: { title: string; outline?: string; volumeId?: number | null }) =>
    api.post<NovelChapter>(`/novels/${id}/chapters`, data),
  getChapter: (chapterId: number) => api.get<NovelChapter>(`/novels/chapters/${chapterId}`),
  updateChapter: (id: number, patch: Partial<NovelChapter>) => api.put<NovelChapter>(`/novels/chapters/${id}`, patch),
  removeChapter: (id: number) => api.delete<{ removed: boolean }>(`/novels/chapters/${id}`),
  writeChapter: (id: number, words?: number) => api.post<NovelChapter>(`/novels/chapters/${id}/write`, { words }),
  planNext: (id: number, count = 1) => api.post<NovelChapter[]>(`/novels/${id}/plan-next`, { count }),
  chapterToArticle: (id: number, platform = 'fanqie', format: 'html' | 'markdown' | 'txt' = 'txt') =>
    api.post<Article>(`/novels/chapters/${id}/to-article`, { platform, format }),
  addForeshadow: (id: number, data: Partial<NovelForeshadow> & { name: string }) =>
    api.post<{ id: number }>(`/novels/${id}/foreshadows`, data),
  updateForeshadow: (id: number, patch: Partial<NovelForeshadow>) => api.put<{ updated: boolean }>(`/novels/foreshadows/${id}`, patch),
  removeForeshadow: (id: number) => api.delete<{ removed: boolean }>(`/novels/foreshadows/${id}`),
  addMemory: (id: number, data: { scope?: NovelMemory['scope']; title: string; content: string }) =>
    api.post<{ id: number }>(`/novels/${id}/memories`, data),
  removeMemory: (id: number) => api.delete<{ removed: boolean }>(`/novels/memories/${id}`),
  distill: (id: number) => api.post<{ created: number; ids: number[] }>(`/novels/${id}/distill`),
};

export const healthApi = {
  check: () => api.get<HealthInfo>('/health'),
};

/* ---------------- 登录鉴权 ---------------- */

export const authApi = {
  status: () => api.get<AuthStatus>('/auth/status'),
  login: (username: string, password: string) => api.post<LoginResult>('/auth/login', { username, password }),
  logout: () => api.post<{ loggedOut: boolean }>('/auth/logout'),
  me: () => api.get<AuthUserInfo>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post<{ changed: boolean }>('/auth/password', { oldPassword, newPassword }),
  settings: () => api.get<AuthSettings>('/auth/settings'),
  saveSettings: (patch: Partial<AuthSettings>) => api.put<AuthSettings>('/auth/settings', patch),
  users: () => api.get<PublicUser[]>('/auth/users'),
  createUser: (data: { username: string; password: string; displayName?: string; role?: 'admin' | 'editor' }) =>
    api.post<PublicUser>('/auth/users', data),
  updateUser: (
    id: number,
    patch: { displayName?: string; role?: 'admin' | 'editor'; enabled?: boolean; password?: string },
  ) => api.put<PublicUser>(`/auth/users/${id}`, patch),
  removeUser: (id: number) => api.delete<{ removed: boolean }>(`/auth/users/${id}`),
  unlockUser: (id: number) => api.post<{ unlocked: boolean; username: string }>(`/auth/users/${id}/unlock`),
  sessions: () => api.get<SessionInfo[]>('/auth/sessions'),
  mySessions: () => api.get<SessionInfo[]>('/auth/sessions/mine'),
  revokeSession: (id: string) => api.delete<{ removed: boolean }>(`/auth/sessions/${id}`),
  purgeSessions: () => api.post<{ removed: number }>('/auth/sessions/purge'),
};

export type AuthStatus = {
  enabled: boolean;
  allowGuest: boolean;
  authenticated: boolean;
  user: AuthUserInfo | null;
  defaultAccount: { username: string; password: string } | null;
};

export type AuthUserInfo = {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'editor';
  mustChangePassword: boolean;
};
