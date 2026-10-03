/**
 * 端到端验证：把自定义服务商指向本地 OpenAI 兼容 mock，
 * 走完 新建 → 切换 → 拉模型 → 测试连接 → 调用 → 删除 全流程
 */
const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const MOCK = process.argv[3] || 'http://127.0.0.1:5299';
let token = null;
let pass = 0;
let fail = 0;

async function call(name, method, path, body, expect = 200) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const ok = res.status === expect;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  [${name}] HTTP ${res.status}${ok ? '' : ` (期望 ${expect})`}`);
  if (json?.data) console.log(`         ${JSON.stringify(json.data).slice(0, 160)}`);
  else if (json?.message) console.log(`         ${json.message}`);
  return json;
}

const check = (label, cond) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
};

console.log('=== 登录 ===');
const login = await call('POST /auth/login', 'POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
token = login?.data?.token;
if (!token) process.exit(1);

console.log('\n=== 清理 + 指向本地 mock 新建自定义服务商 ===');
const pre = await call('GET /llm/providers', 'GET', '/api/llm/providers');
for (const p of (pre?.data ?? []).filter((x) => x.custom && x.key !== 'Custom')) {
  await fetch(`${BASE}/api/llm/providers/${p.key}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

const created = await call('新建（指向本地 mock）', 'POST', '/api/llm/providers', {
  label: 'LocalMock',
  key: 'local_mock',
  apiBase: MOCK,          // 只填到端口，考验 /v1 自动补全
  model: 'mock-model-a',
  apiKey: 'sk-mock-key',
  maxTokens: 1024,
}, 201);
const key = created?.data?.key;
check('标识为 local_mock', key === 'local_mock');
check('接口地址补全为 /v1', created?.data?.apiBase === `${MOCK}/v1`);

console.log('\n=== 切换为当前服务商 ===');
await call('PUT /config', 'PUT', '/api/config', { api: { apiType: key } });
const cfg = await call('GET /config', 'GET', '/api/config');
check('已切换为 local_mock', cfg?.data?.providers?.find((p) => p.active)?.key === 'local_mock');
check('llmReady = true', cfg?.data?.llmReady === true);

console.log('\n=== 拉取模型列表（真实 HTTP 到 mock）===');
const models = await call('GET /llm/models/local_mock', 'GET', `/api/llm/models/${key}`);
check(`返回 mock 的模型列表 (${JSON.stringify(models?.data)})`, Array.isArray(models?.data) && models.data.includes('mock-model-a'));

console.log('\n=== 测试连接（真实 chat/completions 调用）===');
const test = await call('POST /llm/test', 'POST', '/api/llm/test', { providerKey: key });
check('连接成功', test?.data?.ok === true);
check('返回模型回复内容', /正常/.test(test?.data?.message ?? ''));

console.log('\n=== 清理 ===');
await call('切回 OpenRouter', 'PUT', '/api/config', { api: { apiType: 'OpenRouter' } });
await call('删除自定义服务商', 'DELETE', `/api/llm/providers/${key}`);

console.log(`\n${'='.repeat(50)}`);
console.log(`  通过 ${pass} / 失败 ${fail} / 共 ${pass + fail}`);
console.log(`${'='.repeat(50)}\n`);
process.exit(fail ? 1 : 0);
