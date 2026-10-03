/**
 * 登录鉴权端到端自测脚本
 * 用法：node scripts/test-auth.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:5199';

let token = null;
let pass = 0;
let fail = 0;

async function call(name, method, path, body, { useToken = true, expect = 200 } = {}) {
  const headers = {};
  if (useToken && token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  let status = 0;
  let text = '';
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    text = await res.text();
  } catch (err) {
    console.log(`  [${name}] 网络错误: ${err.message}`);
    fail++;
    return null;
  }

  let code = status;
  let msg = text;
  try {
    const j = JSON.parse(text);
    code = j.status === 'success' ? 200 : status;
    msg = j.message ?? (j.data ? JSON.stringify(j.data).slice(0, 120) : JSON.stringify(j).slice(0, 120));
  } catch {}

  const ok = status === expect;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  [${name}] HTTP ${status}${ok ? '' : ` (期望 ${expect})`}\n         ${msg}`);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const section = (t) => console.log(`\n=== ${t} ===`);

section('1. 未登录访问受保护接口');
await call('GET /api/articles', 'GET', '/api/articles', null, { useToken: false, expect: 401 });

section('2. 未登录访问白名单 /api/auth/status');
await call('GET /api/auth/status', 'GET', '/api/auth/status', null, { useToken: false, expect: 200 });

section('3. 错误密码登录');
await call('POST /auth/login (错误密码)', 'POST', '/api/auth/login', { username: 'admin', password: 'wrongpass' }, { useToken: false, expect: 401 });

section('4. 默认账号 admin/admin123 登录');
const login = await call('POST /auth/login', 'POST', '/api/auth/login', { username: 'admin', password: 'admin123' }, { useToken: false, expect: 200 });
if (login?.data?.token) {
  token = login.data.token;
  console.log(`         >>> token=${token.slice(0, 16)}...  mustChangePassword=${login.data.mustChangePassword}`);
  // 标记仅用于「建议修改」提示，不阻断登录
  login.data.mustChangePassword === true ? pass++ : fail++;
  console.log(`  ${login.data.mustChangePassword === true ? 'PASS' : 'FAIL'}  默认账号带改密提醒标记`);
} else {
  fail++;
  console.log('  FAIL  未能获取 token');
}

section('4b. 标记为需改密时仍可正常访问业务接口（不强制跳转改密页）');
await call('带 mustChangePassword 标记访问 /api/articles', 'GET', '/api/articles', null, { expect: 200 });

section('5. 带 token 访问受保护接口');
await call('GET /api/articles', 'GET', '/api/articles');
await call('GET /api/auth/me', 'GET', '/api/auth/me');

section('6. 无效 token 被拒');
const saved = token;
token = 'deadbeefdeadbeefdeadbeefdeadbeef';
await call('GET /api/articles (伪造token)', 'GET', '/api/articles', null, { expect: 401 });
token = saved;

section('7. 管理员接口');
await call('GET /auth/settings', 'GET', '/api/auth/settings');
await call('GET /auth/users', 'GET', '/api/auth/users');
await call('GET /auth/sessions', 'GET', '/api/auth/sessions');

section('8. 新建编辑账号 editor1');
// 幂等：若已存在先删掉，保证脚本可重复运行
const existing = await call('GET /auth/users (清理前)', 'GET', '/api/auth/users');
for (const u of existing?.data ?? []) {
  if (u.username === 'editor1') {
    await call('删除旧 editor1', 'DELETE', `/api/auth/users/${u.id}`, null, { expect: 200 });
  }
}
const created = await call('POST /auth/users', 'POST', '/api/auth/users', { username: 'editor1', password: 'editor123', displayName: '内容编辑', role: 'editor' }, { expect: 201 });
const editorId = created?.data?.id;
if (!editorId) {
  console.log('  FAIL  未能取得 editor1 的 id，后续用例无法执行');
  process.exit(1);
}

section('9. 重复用户名应 409');
await call('POST /auth/users (重复)', 'POST', '/api/auth/users', { username: 'editor1', password: 'editor123' }, { expect: 409 });

section('10. 短密码应被拒');
await call('POST /auth/users (短密码)', 'POST', '/api/auth/users', { username: 'shortpw', password: '123' }, { expect: 422 });

section('11. 编辑账号登录与权限边界');
const adminToken = token;
const el = await call('POST /auth/login (editor)', 'POST', '/api/auth/login', { username: 'editor1', password: 'editor123' }, { useToken: false });
if (el?.data?.token) token = el.data.token;
await call('GET /api/articles (编辑可访问)', 'GET', '/api/articles');
await call('GET /auth/users (编辑 -> 403)', 'GET', '/api/auth/users', null, { expect: 403 });
await call('PUT /auth/settings (编辑 -> 403)', 'PUT', '/api/auth/settings', { maxAttempts: 1 }, { expect: 403 });

section('12. 管理员重置密码 -> 旧密码失效');
token = adminToken;
await call(`PUT /auth/users/${editorId}`, 'PUT', `/api/auth/users/${editorId}`, { password: 'newpass456' });
await call('旧密码登录 (-> 401)', 'POST', '/api/auth/login', { username: 'editor1', password: 'editor123' }, { useToken: false, expect: 401 });
await call('新密码登录 (-> 200)', 'POST', '/api/auth/login', { username: 'editor1', password: 'newpass456' }, { useToken: false, expect: 200 });

section('13. 自我保护');
const meRes = await call('GET /auth/me (取自己的 id)', 'GET', '/api/auth/me');
const meId = meRes?.data?.id;
await call('自降级 (-> 400)', 'PUT', `/api/auth/users/${meId}`, { role: 'editor' }, { expect: 400 });
await call('自停用 (-> 400)', 'PUT', `/api/auth/users/${meId}`, { enabled: false }, { expect: 400 });
await call('自删除 (-> 400)', 'DELETE', `/api/auth/users/${meId}`, null, { expect: 400 });

section('14. 登出后 token 失效');
await call('POST /auth/logout', 'POST', '/api/auth/logout');
await call('GET /api/auth/me (登出后 -> 401)', 'GET', '/api/auth/me', null, { expect: 401 });

section('15. WebSocket 握手鉴权');
const wsMod = await import('ws').catch(() => null);
if (!wsMod) {
  console.log('  SKIP  未安装 ws 依赖，跳过 WebSocket 测试');
} else {
  const { WebSocket } = wsMod;
  const wsUrl = `${BASE.replace('http', 'ws')}/ws`;

  // 预期：服务端在 HTTP upgrade 阶段就拒绝，客户端拿不到 101 响应，
  // 因此不会触发 open，而是 error + close(1006)
  const rejected = await new Promise((resolve) => {
    const bad = new WebSocket(`${wsUrl}?token=invalid-token-xxx`);
    let opened = false;
    bad.on('open', () => {
      opened = true;
    });
    bad.on('close', (code) => resolve({ opened, code }));
    bad.on('error', () => {});
    setTimeout(() => resolve({ opened, code: -1 }), 4000);
  });
  if (!rejected.opened) {
    pass++;
    console.log(`  PASS  无效 token 的握手被拒（未建立连接, close=${rejected.code}）`);
  } else {
    fail++;
    console.log(`  FAIL  无效 token 竟然握手成功 (close=${rejected.code})`);
  }

  // 带有效 token 应连接成功
  const fresh = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  }).then((r) => r.json());
  const goodToken = fresh?.data?.token;

  const accepted = await new Promise((resolve) => {
    const good = new WebSocket(`${wsUrl}?token=${goodToken}`);
    good.on('open', () => {
      resolve(true);
      good.close();
    });
    good.on('close', () => resolve(false));
    good.on('error', () => resolve(false));
    setTimeout(() => resolve(false), 4000);
  });
  accepted ? pass++ : fail++;
  console.log(`  ${accepted ? 'PASS' : 'FAIL'}  有效 token 握手${accepted ? '成功' : '被拒'}`);
}

section('16. 连续失败触发账号锁定');
// 第 14 节已登出，这里先重新登录管理员
const adminAgain = await call('重新登录管理员', 'POST', '/api/auth/login', { username: 'admin', password: 'admin123' }, { useToken: false });
if (adminAgain?.data?.token) token = adminAgain.data.token;
// 先用管理员接口解除可能残留的锁定，保证脚本可重复运行
await call('管理员解除锁定', 'POST', `/api/auth/users/${editorId}/unlock`, null, { expect: 200 });
await call('复位：先成功登录一次', 'POST', '/api/auth/login', { username: 'editor1', password: 'newpass456' }, { useToken: false, expect: 200 });
for (let i = 1; i <= 6; i++) {
  await call(`失败第 ${i} 次`, 'POST', '/api/auth/login', { username: 'editor1', password: 'bad' }, { useToken: false, expect: i <= 5 ? 401 : 429 });
}
await call('锁定后用正确密码仍被拒 (-> 429)', 'POST', '/api/auth/login', { username: 'editor1', password: 'newpass456' }, { useToken: false, expect: 429 });

section('17. 管理员解除锁定后恢复登录');
await call('解除锁定', 'POST', `/api/auth/users/${editorId}/unlock`, null, { expect: 200 });
await call('解锁后可正常登录 (-> 200)', 'POST', '/api/auth/login', { username: 'editor1', password: 'newpass456' }, { useToken: false, expect: 200 });

console.log(`\n${'='.repeat(50)}`);
console.log(`  通过 ${pass} / 失败 ${fail} / 共 ${pass + fail}`);
console.log(`${'='.repeat(50)}\n`);
process.exit(fail > 0 ? 1 : 0);
