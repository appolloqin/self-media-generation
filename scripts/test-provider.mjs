/**
 * 自定义 OpenAI 兼容服务商 端到端自测
 * 用法：node scripts/test-provider.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const USER = 'admin';
const PASS = 'admin123';

let token = null;
let pass = 0;
let fail = 0;

async function call(name, method, path, body, expect = 200) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    const ok = res.status === expect;
    ok ? pass++ : fail++;
    const brief = json?.data ? JSON.stringify(json.data).slice(0, 150) : (json?.message ?? text.slice(0, 150));
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  [${name}] HTTP ${res.status}${ok ? '' : ` (期望 ${expect})`}\n         ${brief}`);
    return json;
  } catch (err) {
    fail++;
    console.log(`  FAIL  [${name}] 网络错误: ${err.message}`);
    return null;
  }
}

const section = (t) => console.log(`\n=== ${t} ===`);

section('0. 登录');
const login = await call('POST /auth/login', 'POST', '/api/auth/login', { username: USER, password: PASS });
token = login?.data?.token ?? null;
if (!token) {
  console.log('  登录失败，终止');
  process.exit(1);
}

section('1. 清理历史自定义服务商 + 检查内置列表');
// 幂等：先清掉可能残留的自定义项
const pre = await call('GET /llm/providers (清理前)', 'GET', '/api/llm/providers');
for (const p of (pre?.data ?? []).filter((x) => x.custom && x.key !== 'Custom')) {
  await call('清理残留', 'DELETE', `/api/llm/providers/${p.key}`);
}
const list1 = await call('GET /llm/providers', 'GET', '/api/llm/providers');
const keys1 = (list1?.data ?? []).map((p) => p.key);
console.log(`         keys: ${keys1.join(', ')}`);
keys1.includes('Custom') ? pass++ : fail++;
console.log(`  ${keys1.includes('Custom') ? 'PASS' : 'FAIL'}  存在 Custom 预设`);
const customEntry = (list1?.data ?? []).find((p) => p.key === 'Custom');
customEntry?.builtin ? pass++ : fail++;
console.log(`  ${customEntry?.builtin ? 'PASS' : 'FAIL'}  Custom 标记为内置（不可删除）`);

section('2. 新建自定义服务商（自动补全 /v1）');
const created = await call(
  'POST /llm/providers',
  'POST',
  '/api/llm/providers',
  { label: '内部推理网关', apiBase: 'https://gw.example.com', model: 'qwen2.5-14b', apiKey: 'sk-test-123', maxTokens: 16384 },
  201,
);
const newKey = created?.data?.key;
console.log(`         key=${newKey}  apiBase=${created?.data?.apiBase}`);
created?.data?.apiBase === 'https://gw.example.com/v1' ? pass++ : fail++;
console.log(`  ${created?.data?.apiBase === 'https://gw.example.com/v1' ? 'PASS' : 'FAIL'}  接口地址自动补 /v1`);

section('3. 名称含中文/特殊字符时自动生成合法标识');
const cjk = await call('POST (中文名)', 'POST', '/api/llm/providers', { label: '我的网关 #1', apiBase: 'http://192.168.1.10:8000/v1' }, 201);
const cjkKey = cjk?.data?.key;
console.log(`         自动生成 key=${cjkKey}`);
cjkKey && /^[A-Za-z0-9_-]{1,64}$/.test(cjkKey) ? pass++ : fail++;
console.log(`  ${cjkKey && /^[A-Za-z0-9_-]{1,64}$/.test(cjkKey) ? 'PASS' : 'FAIL'}  标识符合安全字符要求`);
cjkKey && !/^_+$/.test(cjkKey) ? pass++ : fail++;
console.log(`  ${cjkKey && !/^_+$/.test(cjkKey) ? 'PASS' : 'FAIL'}  纯中文名不产生全是下划线的 key`);
// 纯中文名应退回 custom（若 custom 已被占用则是 custom_N），而不是 key=1 这类无意义标识
cjkKey && /^custom(_\d+)?$/.test(cjkKey) ? pass++ : fail++;
console.log(`  ${cjkKey && /^custom(_\d+)?$/.test(cjkKey) ? 'PASS' : 'FAIL'}  纯中文名退回 custom（不会得到 key=1 这类无意义标识）`);
const mixed = await call('POST (中英混合名)', 'POST', '/api/llm/providers', { label: 'MyGateway 内部推理', apiBase: 'https://mg.example.com/v1' }, 201);
console.log(`         key=${mixed?.data?.key}`);
mixed?.data?.key === 'MyGateway' ? pass++ : fail++;
console.log(`  ${mixed?.data?.key === 'MyGateway' ? 'PASS' : 'FAIL'}  中英混合名保留可读 ASCII 部分`);

section('4. 标识冲突去重 / 内置标识不可占用');
const dup = await call('POST (重复中文名)', 'POST', '/api/llm/providers', { label: '我的网关 #1', apiBase: 'http://x.local:8000/v1' }, 201);
console.log(`         第二个 key=${dup?.data?.key}`);
dup?.data?.key !== cjkKey ? pass++ : fail++;
console.log(`  ${dup?.data?.key !== cjkKey ? 'PASS' : 'FAIL'}  冲突标识已自动去重`);
await call('POST (占用内置名)', 'POST', '/api/llm/providers', { key: 'Deepseek', label: '冒充', apiBase: 'https://x.com/v1' }, 409);

section('5. 非法参数应被拒');
await call('POST (非法 key)', 'POST', '/api/llm/providers', { key: 'bad key!!', label: 'x', apiBase: 'https://x.com/v1' }, 422);
await call('POST (缺地址)', 'POST', '/api/llm/providers', { label: 'x' }, 422);

section('6. /config 应回显用户保存的真实值');
const cfg1 = await call('GET /config', 'GET', '/api/config');
const inList = (cfg1?.data?.providers ?? []).find((p) => p.key === newKey);
console.log(`         apiKey=${inList?.apiKey}  model=${inList?.model}  custom=${inList?.custom}`);
inList?.apiKey === 'sk-test-123' ? pass++ : fail++;
console.log(`  ${inList?.apiKey === 'sk-test-123' ? 'PASS' : 'FAIL'}  API Key 正确回显`);
inList?.custom === true ? pass++ : fail++;
console.log(`  ${inList?.custom === true ? 'PASS' : 'FAIL'}  标记为自定义`);

section('7. 切换到自定义服务商并验证就绪判定');
await call('PUT /config', 'PUT', '/api/config', { api: { apiType: newKey } });
const cfg2 = await call('GET /config (切换后)', 'GET', '/api/config');
const active = (cfg2?.data?.providers ?? []).find((p) => p.active);
console.log(`         当前使用: ${active?.key} / ${active?.label}`);
active?.key === newKey ? pass++ : fail++;
console.log(`  ${active?.key === newKey ? 'PASS' : 'FAIL'}  已切换为自定义服务商`);
cfg2?.data?.llmReady === true ? pass++ : fail++;
console.log(`  ${cfg2?.data?.llmReady === true ? 'PASS' : 'FAIL'}  llmReady=true（key+base+model 齐全）`);

section('8. 配置持久化');
const reread = await call('GET /config (再次读取)', 'GET', '/api/config');
const persisted = (reread?.data?.providers ?? []).find((p) => p.key === newKey);
persisted?.apiBase === 'https://gw.example.com/v1' ? pass++ : fail++;
console.log(`  ${persisted?.apiBase === 'https://gw.example.com/v1' ? 'PASS' : 'FAIL'}  接口地址已持久化`);

section('9. 内置服务商不可删除');
await call('DELETE /llm/providers/Deepseek', 'DELETE', '/api/llm/providers/Deepseek', null, 400);

section('10. 使用中的服务商不可删除');
await call('DELETE (使用中)', 'DELETE', `/api/llm/providers/${newKey}`, null, 400);

section('11. 切回内置服务商后删除自定义项');
await call('PUT /config', 'PUT', '/api/config', { api: { apiType: 'OpenRouter' } });
await call('DELETE', 'DELETE', `/api/llm/providers/${newKey}`);
await call('DELETE', 'DELETE', `/api/llm/providers/${cjkKey}`);
if (dup?.data?.key) await call('DELETE', 'DELETE', `/api/llm/providers/${dup.data.key}`);
if (mixed?.data?.key) await call('DELETE', 'DELETE', `/api/llm/providers/${mixed.data.key}`);
const after = await call('GET /llm/providers (删除后)', 'GET', '/api/llm/providers');
const remaining = (after?.data ?? []).filter((p) => p.custom);
remaining.length === 0 ? pass++ : fail++;
console.log(`  ${remaining.length === 0 ? 'PASS' : 'FAIL'}  自定义服务商已全部清除（剩余 ${remaining.length}）`);

section('13. 鉴权：未登录不可调用');
const savedToken = token;
token = null;
await call('POST (未登录)', 'POST', '/api/llm/providers', { label: 'x', apiBase: 'https://x.com/v1' }, 401);
token = savedToken;

console.log(`\n${'='.repeat(50)}`);
console.log(`  通过 ${pass} / 失败 ${fail} / 共 ${pass + fail}`);
console.log(`${'='.repeat(50)}\n`);
process.exit(fail > 0 ? 1 : 0);
