import type { DimensionCategoryMeta, LlmProviderKey, ProviderConfig } from './types.js';

/**
 * 默认大模型 Provider 预设（全部 OpenAI 兼容协议）
 * 用 Record<string, ...> 而非 Record<LlmProviderKey, ...>，因为 LlmProviderKey 已允许
 * 任意字符串（自定义服务商），后者会退化成需要全量 index signature 的约束
 */
export const DEFAULT_PROVIDERS: Record<string, ProviderConfig> = {
  OpenRouter: {
    key: 'OpenRouter',
    label: 'OpenRouter',
    apiBase: 'https://openrouter.ai/api/v1',
    model: 'openrouter/qwen/qwen3-next-80b-a3b-instruct:free',
    models: [
      'openrouter/qwen/qwen3-next-80b-a3b-instruct:free',
      'openrouter/z-ai/glm-4.5-air:free',
      'openrouter/meta-llama/llama-3.3-70b-instruct:free',
      'openrouter/openai/gpt-oss-120b:free',
      'openrouter/stepfun/step-3.5-flash:free',
      'openrouter/arcee-ai/trinity-large-preview:free',
    ],
    apiKey: '',
    maxTokens: 32768,
    envKeyName: 'OPENROUTER_API_KEY',
  },
  Deepseek: {
    key: 'Deepseek',
    label: 'DeepSeek',
    apiBase: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    apiKey: '',
    maxTokens: 8192,
    envKeyName: 'DEEPSEEK_API_KEY',
  },
  Grok: {
    key: 'Grok',
    label: 'Grok (xAI)',
    apiBase: 'https://api.x.ai/v1',
    model: 'grok-4-latest',
    models: ['grok-4-latest', 'grok-3', 'grok-3-mini'],
    apiKey: '',
    maxTokens: 32768,
    envKeyName: 'XAI_API_KEY',
  },
  Claude: {
    key: 'Claude',
    label: 'Claude (Anthropic)',
    apiBase: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
    models: ['anthropic/claude-3.5-sonnet', 'anthropic/claude-3-haiku'],
    apiKey: '',
    maxTokens: 8192,
    envKeyName: 'ANTHROPIC_API_KEY',
  },
  Qwen: {
    key: 'Qwen',
    label: '通义千问',
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
    apiKey: '',
    maxTokens: 32768,
    envKeyName: 'DASHSCOPE_API_KEY',
  },
  Gemini: {
    key: 'Gemini',
    label: 'Gemini',
    apiBase: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    apiKey: '',
    maxTokens: 8192,
    envKeyName: 'GEMINI_API_KEY',
  },
  Ollama: {
    key: 'Ollama',
    label: '本地 Ollama',
    apiBase: 'http://localhost:11434/v1',
    model: 'qwen2.5:14b',
    models: ['qwen2.5:14b', 'deepseek-r1:14b', 'llama3.1:8b'],
    apiKey: 'ollama',
    maxTokens: 8192,
    envKeyName: 'OLLAMA_API_KEY',
  },
  SiliconFlow: {
    key: 'SiliconFlow',
    label: '硅基流动',
    apiBase: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen3-32B',
    models: [
      'Qwen/Qwen3-32B',
      'Qwen/QwQ-32B',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
    ],
    apiKey: '',
    maxTokens: 8192,
    envKeyName: 'SILICONFLOW_API_KEY',
  },
  Kimi: {
    key: 'Kimi',
    label: 'Kimi (月之暗面)',
    apiBase: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-32k',
    models: ['moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2-0905-preview'],
    apiKey: '',
    maxTokens: 32768,
    envKeyName: 'MOONSHOT_API_KEY',
  },
  GLM: {
    key: 'GLM',
    label: '智谱 GLM',
    apiBase: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-air'],
    apiKey: '',
    maxTokens: 32768,
    envKeyName: 'ZHIPU_API_KEY',
  },
  MiniMax: {
    key: 'MiniMax',
    label: 'MiniMax',
    apiBase: 'https://api.minimaxi.com/v1',
    model: 'MiniMax-M2.5',
    models: ['MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1'],
    apiKey: '',
    maxTokens: 32768,
    envKeyName: 'MINIMAX_API_KEY',
  },
  /**
   * 自定义 OpenAI 兼容服务商（vLLM / one-api / new-api / LM Studio / 各家聚合网关等）
   * apiBase、model、apiKey 全部由用户在「系统设置 → 大模型 API」中填写
   */
  Custom: {
    key: 'Custom',
    label: '自定义（OpenAI 兼容）',
    apiBase: '',
    model: '',
    models: [],
    apiKey: '',
    maxTokens: 8192,
    envKeyName: 'CUSTOM_API_KEY',
  },
};

export const PROVIDER_ORDER: LlmProviderKey[] = [
  'OpenRouter',
  'Deepseek',
  'Qwen',
  'GLM',
  'Kimi',
  'MiniMax',
  'SiliconFlow',
  'Gemini',
  'Grok',
  'Claude',
  'Ollama',
  'Custom',
];

/** 内置服务商标识集合：不在其中且标记 custom 的才允许删除 */
export const BUILTIN_PROVIDER_KEYS = new Set<string>([
  'OpenRouter',
  'Deepseek',
  'Grok',
  'Claude',
  'Qwen',
  'Gemini',
  'Ollama',
  'SiliconFlow',
  'Kimi',
  'GLM',
  'MiniMax',
  'Custom',
]);

/* ============================================================
 * 维度化创意：15 个维度及其预设选项
 * ========================================================== */

const opt = (name: string, value: string, description?: string) => ({ name, value, description });

export const DIMENSION_CATEGORIES: DimensionCategoryMeta[] = [
  {
    key: 'style',
    label: '文体风格',
    options: [
      opt('poetry', '诗歌', '韵律优美，意境深远'),
      opt('prose', '散文', '形散神聚，情感真挚'),
      opt('novel', '小说', '情节丰富，人物鲜明'),
      opt('essay', '议论文', '观点明确，论证严密'),
      opt('narrative', '叙事文', '故事性强，引人入胜'),
      opt('expository', '说明文', '条理清晰，解释详尽'),
      opt('academic', '学术论文', '严谨规范，逻辑清晰'),
      opt('news', '新闻报道', '客观真实，时效性强'),
      opt('children', '儿童文学', '天真烂漫，寓教于乐'),
      opt('fantasy', '奇幻文学', '想象丰富，魔幻色彩'),
    ],
  },
  {
    key: 'culture',
    label: '文化视角',
    options: [
      opt('eastern_philosophy', '东方哲学', '道家思想，禅宗智慧'),
      opt('western_logic', '西方思辨', '理性分析，逻辑严密'),
      opt('japanese_mono', '日式物哀', '瞬间美学，淡淡哀愁'),
      opt('french_romance', '法式浪漫', '优雅情调，艺术气息'),
      opt('american_freedom', '美式自由', '个人主义，追求自由'),
      opt('chinese_tradition', '中华传统', '儒家文化，礼仪之邦'),
      opt('european_classical', '欧洲古典', '文艺复兴，古典艺术'),
      opt('latin_american', '拉美风情', '热情奔放，魔幻现实'),
      opt('african_tribal', '非洲部落', '原始力量，图腾崇拜'),
      opt('middle_eastern', '中东神秘', '沙漠文明，宗教色彩'),
    ],
  },
  {
    key: 'time',
    label: '时空背景',
    options: [
      opt('ancient_china', '春秋战国', '礼崩乐坏，百家争鸣'),
      opt('tang_song', '唐宋盛世', '文化繁荣，诗词鼎盛'),
      opt('republic', '民国风云', '新旧交替，风起云涌'),
      opt('eighties', '80年代', '改革开放，青春热血'),
      opt('cyberpunk', '赛博朋克', '科技未来，霓虹反乌托邦'),
      opt('medieval', '中世纪', '骑士精神，神秘主义'),
      opt('prehistoric', '史前时代', '原始社会，洪荒之力'),
      opt('space_age', '太空纪元', '星际旅行，宇宙探索'),
      opt('victorian', '维多利亚时代', '工业革命，社会变革'),
      opt('renaissance', '文艺复兴', '人文主义，艺术复兴'),
    ],
  },
  {
    key: 'personality',
    label: '人格角色',
    options: [
      opt('libai', '李白', '浪漫主义诗人，豪放不羁'),
      opt('luxun', '鲁迅', '现代文学家，深刻批判'),
      opt('confucius', '孔子', '思想家，仁爱之道'),
      opt('dreamer_poet', '梦境诗人', '善于将现实与梦境交织'),
      opt('data_philosopher', '数据哲学家', '用数据思维解读人文'),
      opt('time_traveler', '时空旅者', '穿梭时代，独特视角'),
      opt('emotion_healer', '情感治愈师', '温暖人心，抚慰心灵'),
      opt('mystery_detective', '悬疑侦探', '逻辑推理，揭秘真相'),
      opt('innovator', '创新先锋', '勇于探索，突破传统'),
      opt('storyteller', '故事大王', '生动叙述，引人入胜'),
      opt('scientist', '科学家', '理性严谨，探索真理'),
      opt('artist', '艺术家', '感性创造，美学追求'),
    ],
  },
  {
    key: 'emotion',
    label: '情感调性',
    options: [
      opt('healing', '治愈系', '温暖人心，抚慰心灵'),
      opt('suspense', '悬疑惊悚', '紧张刺激，扣人心弦'),
      opt('inspiring', '热血励志', '激情澎湃，正能量满满'),
      opt('philosophical', '深度哲思', '思辨深刻，启发智慧'),
      opt('humorous', '幽默诙谐', '轻松愉快，妙趣横生'),
      opt('melancholy', '忧郁怀旧', '淡淡忧伤，回忆如潮'),
      opt('romantic', '浪漫爱情', '甜蜜温馨，情意绵绵'),
      opt('mysterious', '神秘莫测', '扑朔迷离，引人遐想'),
      opt('tragic', '悲剧色彩', '悲壮深沉，命运抗争'),
      opt('epic', '史诗气概', '宏大叙事，英雄传奇'),
    ],
  },
  {
    key: 'format',
    label: '表达格式',
    options: [
      opt('diary', '日记体', '私密真实，情感流露'),
      opt('dialogue', '对话体', '生动活泼，互动性强'),
      opt('poetry', '诗歌散文', '韵律优美，意境深远'),
      opt('script', '剧本形式', '戏剧冲突，画面感强'),
      opt('letter', '书信体', '情真意切，时光穿越'),
      opt('interview', '访谈录', '问答互动，真实自然'),
      opt('report', '调查报告', '数据支撑，客观分析'),
      opt('fable', '寓言故事', '寓意深刻，启发思考'),
      opt('essay', '随笔杂谈', '自由灵活，见解独特'),
      opt('manual', '操作手册', '步骤清晰，实用指导'),
    ],
  },
  {
    key: 'scene',
    label: '场景环境',
    options: [
      opt('coffee_shop', '咖啡馆', '温馨惬意，都市情调'),
      opt('midnight_subway', '深夜地铁', '孤独思考，城市夜色'),
      opt('rainy_bookstore', '雨夜书店', '文艺浪漫，知识殿堂'),
      opt('seaside_cabin', '海边小屋', '自然宁静，心灵栖息'),
      opt('bustling_city', '繁华都市', '节奏快速，机遇挑战'),
      opt('mountain_temple', '山中古寺', '清幽宁静，禅意深远'),
      opt('university_campus', '大学校园', '青春洋溢，求知氛围'),
      opt('futuristic_city', '未来都市', '科技感强，超现实'),
      opt('forest', '神秘森林', '原始自然，探险奇寻'),
      opt('library', '古老图书馆', '知识海洋，智慧殿堂'),
    ],
  },
  {
    key: 'audience',
    label: '目标受众',
    options: [
      opt('gen_z', 'Z世代', '年轻时尚，网络原生'),
      opt('professionals', '职场精英', '理性务实，效率导向'),
      opt('seniors', '银发族', '阅历丰富，情感细腻'),
      opt('students', '学生党', '青春活力，求知欲强'),
      opt('parents', '宝妈群体', '关爱家庭，实用贴心'),
      opt('entrepreneurs', '创业者', '冒险精神，创新意识'),
      opt('tech_workers', '技术人员', '逻辑思维，追求效率'),
      opt('artists', '文艺青年', '审美独特，情感丰富'),
      opt('retirees', '退休人员', '闲暇时光，生活感悟'),
      opt('travelers', '旅行爱好者', '探索世界，体验丰富'),
    ],
  },
  {
    key: 'theme',
    label: '主题内容',
    options: [
      opt('growth', '成长蜕变', '青春成长，自我发现'),
      opt('time_healing', '时间治愈', '岁月如歌，伤痛愈合'),
      opt('dream_pursuit', '梦想追寻', '理想主义，不懈奋斗'),
      opt('human_nature', '人性探索', '心理深度，道德思辨'),
      opt('tech_reflection', '科技反思', '技术进步，人文关怀'),
      opt('environmental', '环保理念', '绿色生态，可持续发展'),
      opt('social_justice', '社会公正', '公平正义，社会责任'),
      opt('cultural_heritage', '文化传承', '传统延续，文化保护'),
      opt('love', '爱情故事', '情感纠葛，心灵共鸣'),
      opt('adventure', '冒险历程', '挑战极限，勇往直前'),
    ],
  },
  {
    key: 'technique',
    label: '表现技法',
    options: [
      opt('first_person', '第一人称', '亲身体验，情感直接'),
      opt('omniscient', '全知视角', '上帝视角，洞察全局'),
      opt('multiple', '多重叙述', '多角度展现，复杂立体'),
      opt('stream', '意识流', '内心独白，思维跳跃'),
      opt('flashback', '倒叙', '时空交错，悬念重生'),
      opt('montage', '蒙太奇', '画面拼接，时空压缩'),
      opt('symbolism', '象征主义', '寓意深刻，含蓄表达'),
      opt('satire', '讽刺手法', '幽默批判，辛辣讽刺'),
      opt('metaphor', '隐喻象征', '比喻暗示，意味深长'),
      opt('contrast', '对比反衬', '鲜明对照，突出主题'),
    ],
  },
  {
    key: 'language',
    label: '语言风格',
    options: [
      opt('classical', '古典雅致', '文言韵味，典雅庄重'),
      opt('modern', '现代白话', '通俗易懂，贴近生活'),
      opt('vernacular', '方言土语', '地域特色，生动亲切'),
      opt('foreign', '外语混杂', '多语融合，国际范儿'),
      opt('technical', '专业术语', '行业词汇，精准表达'),
      opt('slang', '网络流行', '潮流用语，年轻时尚'),
      opt('poetic', '诗意语言', '韵律优美，意境深远'),
      opt('plain', '朴素平实', '简洁明了，朴实无华'),
    ],
  },
  {
    key: 'tone',
    label: '语调语气',
    options: [
      opt('serious', '严肃庄重', '郑重其事，不容置疑'),
      opt('casual', '轻松随意', '自然亲切，不拘一格'),
      opt('sarcastic', '讽刺挖苦', '反语讥讽，辛辣犀利'),
      opt('enthusiastic', '热情洋溢', '激情澎湃，感染力强'),
      opt('calm', '平静温和', '心平气和，娓娓道来'),
      opt('urgent', '急切紧迫', '迫在眉睫，刻不容缓'),
      opt('mysterious', '神秘莫测', '扑朔迷离，引人遐想'),
      opt('humorous', '幽默诙谐', '轻松幽默，引人会笑'),
    ],
  },
  {
    key: 'perspective',
    label: '叙述视角',
    options: [
      opt('first_person', '第一人称', '以我为主，亲身经历'),
      opt('second_person', '第二人称', '直接对话，身临其境'),
      opt('third_person_limited', '第三人称有限', '聚焦主角，深入内心'),
      opt('third_person_omniscient', '第三人称全知', '全知全能，洞察一切'),
      opt('multiple_pov', '多视角切换', '不同人物，不同视角'),
      opt('observer', '旁观者视角', '客观记录，冷眼旁观'),
      opt('participant', '参与者视角', '身在其中，主观感受'),
    ],
  },
  {
    key: 'structure',
    label: '文章结构',
    options: [
      opt('chronological', '时间顺序', '按时间发展，脉络清晰'),
      opt('spatial', '空间顺序', '按空间位置，层次分明'),
      opt('thematic', '主题分类', '按主题划分，逻辑严密'),
      opt('problem_solution', '问题解决', '提出问题，分析解决'),
      opt('cause_effect', '因果关系', '分析原因，探讨结果'),
      opt('compare_contrast', '对比对照', '比较异同，突出特点'),
      opt('circular', '首尾呼应', '开头结尾，遥相呼应'),
      opt('layered', '层层递进', '由浅入深，逐步深入'),
    ],
  },
  {
    key: 'rhythm',
    label: '节奏韵律',
    options: [
      opt('fast', '快节奏', '紧凑激烈，扣人心弦'),
      opt('slow', '慢节奏', '舒缓悠扬，娓娓道来'),
      opt('variable', '变化多端', '张弛有度，起伏跌宕'),
      opt('steady', '平稳均匀', '节奏一致，稳定推进'),
      opt('accelerating', '逐渐加快', '层层推进，越来越快'),
      opt('decelerating', '逐渐放缓', '渐入佳境，慢慢回味'),
      opt('syncopated', '切分节奏', '错落有致，富有变化'),
    ],
  },
];

/* ============================================================
 * 微博热搜来源
 * ========================================================== */

export const HOT_PLATFORM_PRESETS: {
  name: string;
  weight: number;
  zhiweiId: string | null;
  tophubId: string | null;
  type?: 'native' | 'rss';
  rssUrl?: string | null;
}[] = [
  { name: '微博', weight: 0.3, zhiweiId: 'weibo', tophubId: 's.weibo.com' },
  { name: '抖音', weight: 0.2, zhiweiId: 'douyin', tophubId: 'douyin.com' },
  { name: '微信', weight: 0.15, zhiweiId: null, tophubId: 'WnBe01o371' },
  { name: '小红书', weight: 0.12, zhiweiId: 'little-red-book', tophubId: null },
  { name: '今日头条', weight: 0.1, zhiweiId: 'toutiao', tophubId: 'toutiao.com' },
  { name: '百度热点', weight: 0.08, zhiweiId: 'baidu', tophubId: 'baidu.com' },
  /* 人民日报：今日热榜节点常触发验证，改走官网 RSS（时政/社会/观点聚合） */
  {
    name: '人民日报',
    weight: 0.08,
    zhiweiId: null,
    tophubId: '47o8YY0vMm',
    type: 'rss',
    rssUrl: 'http://www.people.com.cn/rss/politics.xml',
  },
  { name: '哔哩哔哩', weight: 0.06, zhiweiId: 'bilibili', tophubId: 'bilibili.com' },
  { name: '快手', weight: 0.05, zhiweiId: 'kuaishou', tophubId: null },
  /* tophubId：今日热榜节点 ID（/n/{id}）；旧域名写法仍可被服务端映射兼容 */
  { name: '虎扑', weight: 0.05, zhiweiId: null, tophubId: 'G47o8weMmN' },
  { name: '豆瓣小组', weight: 0.02, zhiweiId: null, tophubId: 'WYKd6jdaPj' },
  { name: '澎湃新闻', weight: 0.01, zhiweiId: null, tophubId: 'wWmoO5Rd4E' },
  { name: '知乎热榜', weight: 0.01, zhiweiId: 'zhihu', tophubId: 'zhihu.com' },
];

/* ============================================================
 * 模板内置分类
 * ========================================================== */

export const DEFAULT_TEMPLATE_CATEGORIES: Record<string, string> = {
  TechDigital: '科技数码',
  FinanceInvestment: '财经投资',
  EducationLearning: '教育学习',
  HealthWellness: '健康养生',
  FoodTravel: '美食旅行',
  FashionLifestyle: '时尚生活',
  CareerDevelopment: '职场发展',
  EmotionPsychology: '情感心理',
  EntertainmentGossip: '娱乐八卦',
  NewsCurrentAffairs: '新闻时事',
  Others: '其他',
};

/**
 * 模板分类显示名：内置英文分类码映射为中文。
 * 用户自建的分类（不在映射表内）原样返回。
 * 仅用于界面展示，存储值与提交逻辑不变。
 */
export const templateCategoryLabel = (name: string): string =>
  DEFAULT_TEMPLATE_CATEGORIES[name] ?? name;

/* ============================================================
 * 文案武库：五档位 + 场景分类
 * ========================================================== */

export const KNOB_LABELS = {
  hook: '开头钩子',
  emotion: '情绪基调',
  rhythm: '节奏',
  ending: '结尾方式',
  colloquial: '口语度',
} as const;

export type KnobKey = keyof typeof KNOB_LABELS;

export const KNOB_ORDER: KnobKey[] = ['hook', 'emotion', 'rhythm', 'ending', 'colloquial'];

export const SCENE_CATEGORIES = [
  { name: 'social', label: '社交种草' },
  { name: 'article', label: '文章开头' },
  { name: 'commerce', label: '电商带货' },
  { name: 'video', label: '短视频脚本' },
  { name: 'campaign', label: '节日营销' },
  { name: 'brand', label: '品牌公关' },
  { name: 'other', label: '其他' },
] as const;

/* ============================================================
 * 专家赛道：深度档位
 * ========================================================== */

export const TRACK_DEPTHS = [
  { value: 'basic', label: '快速（1000~1500字）' },
  { value: 'standard', label: '标准（1500~2500字）' },
  { value: 'deep', label: '深度（2500~4000字）' },
] as const;

/* ============================================================
 * 图片来源 / 状态
 * ========================================================== */

export const IMAGE_SOURCES = [
  { value: 'upload', label: '本地上传' },
  { value: 'ai', label: 'AI 生成' },
  { value: 'workflow', label: '工作流产出' },
  { value: 'render', label: '渲染导出' },
] as const;

export const IMAGE_SIZE_OPTIONS = [
  { value: '1024x1024', label: '正方形 1024×1024' },
  { value: '1024x1536', label: '竖版 1024×1536' },
  { value: '1536x1024', label: '横版 1536×1024' },
] as const;

/* ============================================================
 * 小说内置主题
 * ========================================================== */

export const NOVEL_THEMES = [
  { name: 'paper', label: '素纸', css: 'paper', builtin: 1 },
  { name: 'ink', label: '水墨', css: 'ink', builtin: 1 },
  { name: 'sepia', label: '复古', css: 'sepia', builtin: 1 },
  { name: 'night', label: '暗夜', css: 'night', builtin: 1 },
  { name: 'forest', label: '林间', css: 'forest', builtin: 1 },
];

/* ============================================================
 * 工作流阶段（进度条）
 * ========================================================== */

export const WORKFLOW_STAGES = [
  { key: 'init', label: '初始化', progress: 5 },
  { key: 'hot', label: '获取热点', progress: 12 },
  { key: 'search', label: '联网搜索', progress: 25 },
  { key: 'writing', label: 'AI 写作', progress: 50 },
  { key: 'creative', label: '创意变换', progress: 62 },
  { key: 'deai', label: '去 AI 味', progress: 72 },
  { key: 'layout', label: '智能排版', progress: 84 },
  { key: 'save', label: '保存入库', progress: 93 },
  { key: 'publish', label: '发布', progress: 100 },
  { key: 'done', label: '完成', progress: 100 },
] as const;

export type WorkflowStageKey = (typeof WORKFLOW_STAGES)[number]['key'];

export const STAGE_PROGRESS: Record<string, number> = Object.fromEntries(
  WORKFLOW_STAGES.map((s) => [s.key, s.progress]),
);
