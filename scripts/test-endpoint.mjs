/** 校验 buildEndpoint / listModels 的地址推导，覆盖内置 + 自定义写法 */
const cases = [
  // [apiBase, 期望 chat/completions, 期望 models]
  ['https://api.deepseek.com/v1', 'https://api.deepseek.com/v1/chat/completions', 'https://api.deepseek.com/v1/models'],
  ['https://api.deepseek.com', 'https://api.deepseek.com/v1/chat/completions', 'https://api.deepseek.com/v1/models'],
  ['https://gw.example.com', 'https://gw.example.com/v1/chat/completions', 'https://gw.example.com/v1/models'],
  ['http://192.168.1.10:8000', 'http://192.168.1.10:8000/v1/chat/completions', 'http://192.168.1.10:8000/v1/models'],
  ['http://192.168.1.10:8000/v1/', 'http://192.168.1.10:8000/v1/chat/completions', 'http://192.168.1.10:8000/v1/models'],
  ['https://open.bigmodel.cn/api/paas/v4', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'https://open.bigmodel.cn/api/paas/v4/models'],
  [
    'https://generativelanguage.googleapis.com/v1beta/openai',
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    'https://generativelanguage.googleapis.com/v1beta/openai/models',
  ],
  [
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
  ],
  ['https://x.com/v1/chat/completions', 'https://x.com/v1/chat/completions', 'https://x.com/v1/models'],
  ['api.example.com', 'https://api.example.com/v1/chat/completions', 'https://api.example.com/v1/models'],
  ['http://localhost:11434/v1', 'http://localhost:11434/v1/chat/completions', 'http://localhost:11434/v1/models'],
];

// 复制自 server/src/services/llm.service.ts 的实现
function normalizeBase(apiBase) {
  let base = (apiBase || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base.replace(/\/chat\/completions$/, '');
}

function buildEndpoint(apiBase) {
  let base = normalizeBase(apiBase);
  if (!base) throw new Error('接口地址为空');
  const hasKnownSuffix = /\/v\d+$/.test(base) || /\/(openai|compatible-mode|paas|api)$/.test(base);
  if (!hasKnownSuffix) base = `${base}/v1`;
  return `${base}/chat/completions`;
}

function buildModelsUrl(apiBase) {
  const base = normalizeBase(apiBase);
  if (!base) return '';
  const hasKnownSuffix = /\/v\d+$/.test(base) || /\/(openai|compatible-mode|paas|api)$/.test(base);
  return hasKnownSuffix ? `${base}/models` : `${base}/v1/models`;
}

let fail = 0;
for (const [input, wantChat, wantModels] of cases) {
  const gotChat = buildEndpoint(input);
  const gotModels = buildModelsUrl(input);
  const ok = gotChat === wantChat && gotModels === wantModels;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${input}`);
  console.log(`        chat  : ${gotChat}${gotChat === wantChat ? '' : `  (期望 ${wantChat})`}`);
  console.log(`        models: ${gotModels}${gotModels === wantModels ? '' : `  (期望 ${wantModels})`}`);
}
console.log(`\n${cases.length - fail} / ${cases.length} 通过`);
process.exit(fail ? 1 : 0);
