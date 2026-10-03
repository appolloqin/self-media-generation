/**
 * 内置资源种子数据：模板分类与模板、专家赛道、文案场景、图库风格预设、提示词
 */
import { DEFAULT_TEMPLATE_CATEGORIES, NOVEL_THEMES, DEFAULT_PROVIDERS, PROVIDER_ORDER } from '@smg/shared';

export type SeedTrack = {
  name: string;
  description: string;
  audience: string;
  boundary: string;
  structure: string;
  style: string;
  qualityBar: string;
  compliance: string;
  templates: { name: string; audience: string; depth: string; platform: string; style: string; strategy: string; wordMin: number; wordMax: number }[];
};

export const SEED_TRACKS: SeedTrack[] = [
  {
    name: '科技数码',
    description: '数码产品评测、科技趋势解读与实用教程',
    audience: '20-40 岁数码爱好者与职场人，关注性价比与实用性',
    boundary: '不做纯参数堆砌、不做无实测的臆测、不做软文推广',
    structure: '痛点开场 → 产品/技术拆解 → 实测对比 → 购买或使用建议 → 总结',
    style: '专业但不晦涩，多用具体参数与实测数据，少用形容词',
    qualityBar: '每个结论必须有数据或实测支撑；不夸大；参数准确',
    compliance: '不贬低竞品，不做绝对化用词，不承诺未证实的功能',
    templates: [
      { name: '深度评测', audience: '数码发烧友', depth: 'deep', platform: 'wechat', style: '专业客观', strategy: '参数+实测双轨，突出差异点', wordMin: 2000, wordMax: 3500 },
      { name: '选购指南', audience: '普通消费者', depth: 'standard', platform: 'wechat', style: '清晰易懂', strategy: '按预算分档，给出明确推荐', wordMin: 1500, wordMax: 2500 },
      { name: '快讯解读', audience: '科技从业者', depth: 'basic', platform: 'weibo', style: '简洁直接', strategy: '一句话结论+三点理由', wordMin: 500, wordMax: 900 },
    ],
  },
  {
    name: '财经投资',
    description: '宏观经济解读、行业分析与个人理财建议',
    audience: '25-45 岁有理财需求的城市白领',
    boundary: '不荐股、不承诺收益、不做内幕消息、不预测具体点位',
    structure: '现象 → 原因拆解 → 数据支撑 → 影响推演 → 理性建议',
    style: '严谨克制，多引用官方数据，避免情绪化判断',
    qualityBar: '数据必须标注来源与时间；区分事实与观点',
    compliance: '严格遵守证券法，禁止收益承诺与个股推荐',
    templates: [
      { name: '宏观速读', audience: '财经从业者', depth: 'standard', platform: 'wechat', style: '专业克制', strategy: '数据优先，观点克制', wordMin: 1200, wordMax: 2000 },
      { name: '行业透视', audience: '投资者', depth: 'deep', platform: 'zhihu', style: '逻辑严密', strategy: '产业链分析，落到细分环节', wordMin: 2500, wordMax: 4000 },
    ],
  },
  {
    name: '健康养生',
    description: '科学养生、疾病预防与健康生活方式',
    audience: '30 岁以上关注健康的中老年人群及其家庭',
    boundary: '不诊断疾病、不推荐处方药、不推荐偏方、不夸大功效',
    structure: '常见误区 → 科学依据 → 可执行方案 → 何时就医',
    style: '通俗易懂，多用生活化比喻，避免医学术语堆砌',
    qualityBar: '所有健康建议必须有权威来源；区分「有益」与「有害」',
    compliance: '严格遵守医疗健康类内容合规要求，禁止疗效承诺',
    templates: [
      { name: '辟谣科普', audience: '普通读者', depth: 'standard', platform: 'wechat', style: '亲切易懂', strategy: '先破后立，给出正确做法', wordMin: 1200, wordMax: 2000 },
      { name: '作息指南', audience: '上班族', depth: 'basic', platform: 'xiaohongshu', style: '轻松实用', strategy: '清单式，易执行', wordMin: 600, wordMax: 1000 },
    ],
  },
  {
    name: '职场发展',
    description: '求职技巧、晋升路径、职场沟通与个人成长',
    audience: '22-35 岁职场新人与中层',
    boundary: '不贩卖焦虑、不承诺升职加薪、不涉及公司机密',
    structure: '真实场景 → 问题诊断 → 方法论 → 可复制话术',
    style: '务实接地气，多用真实案例与具体话术',
    qualityBar: '方法必须可操作；避免空洞鸡汤',
    compliance: '不泄露他人隐私，不编造成功案例',
    templates: [
      { name: '求职攻略', audience: '求职期求职者', depth: 'standard', platform: 'wechat', style: '务实详细', strategy: '按面试环节拆解', wordMin: 1500, wordMax: 2500 },
      { name: '职场沟通', audience: '职场人', depth: 'basic', platform: 'zhihu', style: '简洁有逻辑', strategy: '场景+话术模板', wordMin: 1000, wordMax: 1800 },
    ],
  },
  {
    name: '情感心理',
    description: '亲密关系、情绪管理与心理自助',
    audience: '18-35 岁，关注情绪与人际',
    boundary: '不做心理咨询、不做诊断、不评判、不劝分劝合',
    structure: '共情开场 → 现象描述 → 心理学视角 → 自助方法 → 求助指引',
    style: '温和共情，语言柔软，避免说教',
    qualityBar: '共情优先于建议；方法须温和可执行',
    compliance: '涉及自伤/抑郁等严重议题时必须引导寻求专业帮助',
    templates: [
      { name: '关系答疑', audience: '年轻情侣', depth: 'standard', platform: 'wechat', style: '温和共情', strategy: '先接住情绪，再给视角', wordMin: 1200, wordMax: 2000 },
      { name: '情绪自助', audience: '焦虑人群', depth: 'basic', platform: 'xiaohongshu', style: '温暖治愈', strategy: '小练习，可当天执行', wordMin: 600, wordMax: 1100 },
    ],
  },
  {
    name: '美食旅行',
    description: '目的地攻略、本地小吃与旅行路线',
    audience: '20-40 岁自由行旅客',
    boundary: '不做虚假宣传、不推荐已关闭商家、不抄袭他人攻略',
    structure: '亮点前置 → 行程安排 → 预算明细 → 避坑提醒',
    style: '画面感强，突出可执行细节',
    qualityBar: '价格与时间必须准确；标注信息更新日期',
    compliance: '不发布虚假信息，注意商家版权与肖像权',
    templates: [
      { name: '目的地攻略', audience: '自由行旅客', depth: 'standard', platform: 'wechat', style: '实用详细', strategy: '行程+预算+避坑三段式', wordMin: 1800, wordMax: 3000 },
      { name: '周末短途', audience: '一线城市上班族', depth: 'basic', platform: 'xiaohongshu', style: '轻松活泼', strategy: '两天一夜，强调省时', wordMin: 800, wordMax: 1300 },
    ],
  },
  {
    name: '教育学习',
    description: '学习方法、考试备考与教育政策解读',
    audience: '学生与家长',
    boundary: '不承诺提分、不贩卖焦虑、不违规引流',
    structure: '痛点 → 原因分析 → 方法拆解 → 案例验证 → 执行清单',
    style: '条理清晰，可操作性强',
    qualityBar: '方法需有依据；避免绝对化表述',
    compliance: '不违规承诺升学与提分结果',
    templates: [
      { name: '学习方法论', audience: '中学生', depth: 'standard', platform: 'wechat', style: '清晰有条理', strategy: '方法+打卡模板', wordMin: 1200, wordMax: 2000 },
    ],
  },
  {
    name: '新闻时事',
    description: '热点事件解读与背景梳理',
    audience: '关注时事的广泛读者',
    boundary: '不造谣、不传播未经证实的消息、不做人身攻击',
    structure: '事件概述 → 时间线 → 关键分歧 → 影响展望',
    style: '客观中立，多方视角',
    qualityBar: '事实与观点严格分离；信息可溯源',
    compliance: '严格遵守新闻真实性要求',
    templates: [
      { name: '热点解读', audience: '普通读者', depth: 'standard', platform: 'wechat', style: '客观中立', strategy: '时间线+多视角', wordMin: 1200, wordMax: 2200 },
      { name: '一分钟速览', audience: '碎片阅读人群', depth: 'basic', platform: 'weibo', style: '简洁清晰', strategy: '5 条要点', wordMin: 300, wordMax: 600 },
    ],
  },
];

export type SeedScene = {
  name: string;
  category: string;
  categoryLabel: string;
  description: string;
  structure: string;
  hooks: string;
  tone: string;
  forbidden: string;
  compliance: string;
  needLineBreak: boolean;
  knobs: Record<string, string[]>;
};

export const SEED_SCENES: SeedScene[] = [
  {
    name: '小红书种草',
    category: 'social',
    categoryLabel: '种草分享',
    description: '以个人体验为核心的产品/地点推荐，适合小红书与朋友圈',
    structure: '痛点共鸣 → 个人体验 → 细节展示 → 避坑提示 → 行动号召',
    hooks: '痛点提问、身份标签、结果前置、反常识',
    tone: '亲切、真实、有细节',
    forbidden: '最好用、第一、绝对、百分百有效',
    compliance: '不虚假宣传，不做绝对化用词，需标注商业合作',
    needLineBreak: true,
    knobs: {
      hook: ['痛点提问式', '身份标签式', '结果前置式', '反常识式'],
      emotion: ['真诚分享', '惊喜发现', '踩坑后悔', '强烈安利'],
      rhythm: ['短句快节奏', '故事化叙述', '清单式罗列'],
      ending: ['行动号召', '开放提问', '对比收尾', '金句总结'],
      colloquial: ['很口语', '适中', '偏文艺'],
    },
  },
  {
    name: '朋友圈文案',
    category: 'social',
    categoryLabel: '社交文案',
    description: '短小精悍的社交动态，30~120 字',
    structure: '一句话观点 + 一个细节 + 一个情绪落点',
    hooks: '金句、场景、对比',
    tone: '松弛、真诚、有余味',
    forbidden: '鸡汤堆砌、说教、长难句',
    compliance: '不做绝对化承诺',
    needLineBreak: true,
    knobs: {
      hook: ['金句开场', '场景切入', '反差对比'],
      emotion: ['松弛感', '温暖', '幽默', '丧但积极'],
      ending: ['留白', '自问自答', '呼朋唤友'],
      colloquial: ['极口语', '适中'],
    },
  },
  {
    name: '公众号开头',
    category: 'article',
    categoryLabel: '文章开头',
    description: '公众号文章的前 200 字，决定读者是否继续读',
    structure: '场景切入 → 制造张力 → 抛出核心问题',
    hooks: '故事、冲突、数据、身份代入',
    tone: '克制、有画面感',
    forbidden: '在当今社会、随着科技的不断发展、众所周知',
    compliance: '不夸大、不制造恐慌',
    needLineBreak: false,
    knobs: {
      hook: ['故事开场', '冲突开场', '数据开场', '身份代入'],
      emotion: ['克制', '好奇', '共鸣'],
      rhythm: ['紧凑', '舒缓'],
    },
  },
  {
    name: '带货种草',
    category: 'commerce',
    categoryLabel: '电商带货',
    description: '商品种草与转化文案',
    structure: '需求痛点 → 产品解决方案 → 使用场景 → 购买理由',
    hooks: '场景痛点、身份标签',
    tone: '真诚、有说服力',
    forbidden: '最好、第一、永久、绝对有效',
    compliance: '需标注广告标识，不做绝对化与虚假宣传',
    needLineBreak: true,
    knobs: {
      hook: ['痛点直击', '身份代入', '对比开场'],
      emotion: ['真诚推荐', '惊喜', '急切'],
      ending: ['限时引导', '库存提示', '选择建议'],
      colloquial: ['很口语', '适中'],
    },
  },
  {
    name: '视频口播稿',
    category: 'video',
    categoryLabel: '短视频脚本',
    description: '口播类短视频脚本，标注时间轴与画面提示',
    structure: '3 秒钩子 → 主体内容 → 结尾互动',
    hooks: '提问、悬念、反差、数字',
    tone: '口语化、有节奏感',
    forbidden: '书面语长句、多余修饰',
    compliance: '不夸大效果，不引导违规行为',
    needLineBreak: true,
    knobs: {
      hook: ['提问式', '悬念式', '数字式', '演示式'],
      rhythm: ['快节奏', '中速', '故事化'],
      ending: ['提问互动', '关注引导', '下期预告'],
      colloquial: ['极口语', '适中'],
    },
  },
  {
    name: '节日营销',
    category: 'campaign',
    categoryLabel: '节日营销',
    description: '节日节点营销文案，强调氛围与情感',
    structure: '节日氛围 → 情感联结 → 产品/服务 → 行动',
    hooks: '节日意象、童年回忆',
    tone: '温暖、有仪式感',
    forbidden: '生硬促销、过度商业化',
    compliance: '不违背公序良俗，不虚假承诺优惠',
    needLineBreak: true,
    knobs: {
      hook: ['节日意象', '回忆杀', '反差对比'],
      emotion: ['温暖', '怀旧', '喜庆', '思念'],
      ending: ['祝福', '邀约', '促销提示'],
    },
  },
];

export const SEED_IMAGE_PRESETS = [
  { name: '公众号封面-简约', promptTemplate: '极简风格封面图，主色 {prompt}，几何分割，无文字，高级感', negativePrompt: '文字、水印、低分辨率、杂乱', category: '封面' },
  { name: '公众号封面-摄影', promptTemplate: '纪实摄影风格，主题 {prompt}，自然光，浅景深，真实质感', negativePrompt: '文字、水印、过度磨皮、塑料感', category: '封面' },
  { name: '正文配图-插画', promptTemplate: '扁平插画风格，主题 {prompt}，配色清新，适合正文插图', negativePrompt: '文字、复杂背景、暗黑风格', category: '正文' },
  { name: '正文配图-国风', promptTemplate: '中国风水墨画风格，主题 {prompt}，留白构图，淡雅色调', negativePrompt: '文字、西式元素、浓墨重彩', category: '正文' },
  { name: '正文配图-3D', promptTemplate: '3D 渲染风格，主题 {prompt}，柔和阴影，isometric 视角', negativePrompt: '文字、真实人脸、杂乱光线', category: '正文' },
];

export const SEED_PROMPTS = [
  { title: '公众号文章写作（通用）', category: '文章', content: '你是一位资深中文自媒体主编。请围绕主题撰写一篇结构完整、逻辑清晰、有具体细节的中文文章。要求：1. 开头用具体麻烦、可核对事实或反常识判断切入，不要文学氛围描写；2. 正文分层论述，每层给出数据、案例或步骤；3. 结尾给出行动建议或限制说明；4. 句子长短交错，避免 AI 味；5. 不使用「综上所述」「值得注意的是」等连接词；6. 只输出正文，不要任何解释。' },
  { title: '标题生成', category: '文章', content: '为中文文章生成 5 个候选标题。要求：12-24 字，含具体信息或反差感，不使用「震惊」「速看」「紧急」等低质标题党词汇，不堆砌标点。只输出标题列表。' },
  { title: '去 AI 味重写', category: '优化', content: '重写下面内容，使其更像真人写作。要求：1. 打散工整的列表与段落；2. 长短句交错；3. 加入第一人称视角与主观色彩；4. 禁用「综上所述」「值得注意的是」「在当今社会」等 AI 味词汇；5. 保持原意与长度（±20%）。只输出重写后的正文。' },
  { title: '内容摘要', category: '文章', content: '为下面文章写一段 100-150 字的摘要，用于公众号卡片预览。要求：概括核心观点与读者收益，语言简洁，不用感叹号，不加引导语。' },
];

export const SEED_TEMPLATES = [
  { category: 'TechDigital', name: '科技评测-卡片式', content: '' },
  { category: 'TechDigital', name: '科技资讯-快讯式', content: '' },
  { category: 'FinanceInvestment', name: '财经解读-数据式', content: '' },
  { category: 'HealthWellness', name: '健康科普-卡片式', content: '' },
  { category: 'FoodTravel', name: '旅行攻略-图集式', content: '' },
  { category: 'CareerDevelopment', name: '职场方法-清单式', content: '' },
  { category: 'EmotionPsychology', name: '情感共鸣-留白式', content: '' },
  { category: 'NewsCurrentAffairs', name: '新闻解读-时间线式', content: '' },
  { category: 'EducationLearning', name: '学习方法-步骤式', content: '' },
  { category: 'FashionLifestyle', name: '生活方式-杂志式', content: '' },
];

export const SEED_CONFIG_HINTS = {
  templateCategories: DEFAULT_TEMPLATE_CATEGORIES,
  novelThemes: NOVEL_THEMES,
  providers: PROVIDER_ORDER.map((k) => DEFAULT_PROVIDERS[k].label),
};
