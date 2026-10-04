import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { APP_INFO, ENV, PATHS } from './config/env.js';
import { runMigrations, syncBuiltinResources } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import { initWs, broadcast, getClientCount, setWsAuthEnabled, setWsTokenVerifier } from './core/ws.js';
import { pushBufferedLog } from './core/logBuffer.js';
import { logger } from './core/logger.js';
import { errorHandler, ok } from './api/helpers.js';
import { queryOne } from './db/connection.js';
import { authService, DEFAULT_ADMIN } from './services/auth.service.js';
import { attachUser, createAuthGate } from './api/auth.guard.js';

import authRoutes from './api/auth.routes.js';
import configRoutes from './api/config.routes.js';
import articleRoutes from './api/article.routes.js';
import hotRoutes from './api/hot.routes.js';
import templateRoutes from './api/template.routes.js';
import copywritingRoutes from './api/copywriting.routes.js';
import libraryRoutes from './api/library.routes.js';
import novelRoutes from './api/novel.routes.js';

/* ---------------- 启动 ---------------- */

runMigrations();
authService.ensureDefaultAdmin();
syncBuiltinResources();
try {
  runSeed(false);
} catch (err) {
    logger.warn(`内置数据初始化跳过：${(err as Error).message}`);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

/** 允许的来源：同源（含自身 host:port）视为始终放行 */
const SELF_ORIGINS = new Set(
  [`http://${ENV.host}:${ENV.port}`, `http://localhost:${ENV.port}`].map((o) => o.toLowerCase()),
);

function isOriginAllowed(origin: string): boolean {
  const o = origin.toLowerCase();
  if (ENV.nodeEnv === 'production') return true;
  if (ENV.corsOrigins.some((c) => c.toLowerCase() === o)) return true;
  if (SELF_ORIGINS.has(o)) return true;
  // 同 host 但端口不同（如前端 dev server）也放行，避免本地联调被拦截
  try {
    const u = new URL(origin);
    const localHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
    if (localHosts.has(u.hostname)) return true;
  } catch {
    /* 非法 origin，按拒绝处理 */
  }
  return false;
}

app.use(
  cors({
    origin: (origin, cb) => {
      // 无 Origin（同源导航、curl、服务端调用）直接放行
      if (!origin) return cb(null, true);
      if (isOriginAllowed(origin)) return cb(null, true);
      logger.warn(`CORS 拒绝来源：${origin}`);
      cb(new Error(`CORS 拒绝来源：${origin}`));
    },
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: ENV.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: ENV.bodyLimit }));

/* ---------------- 静态资源 ---------------- */

const STATIC_DIRS: [string, string][] = [
  ['/uploads/images', PATHS.images],
  ['/uploads/articles', PATHS.articles],
  ['/uploads/templates', PATHS.templates],
];
for (const [prefix, dir] of STATIC_DIRS) {
  fs.mkdirSync(dir, { recursive: true });
  app.use(prefix, express.static(dir, { maxAge: '7d', fallthrough: true }));
}

// 生产模式下托管前端构建产物
const webDist = path.join(PATHS.root, 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { index: false }));
  app.get(/^\/(?!api|ws|uploads).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
  logger.info(`已挂载前端静态资源：${webDist}`);
}

/* ---------------- API ---------------- */

app.get('/api/health', (_req, res) => {
  const dbOk = Boolean(queryOne('SELECT 1 AS ok'));
  ok(res, {
    ...APP_INFO,
    ok: dbOk,
    port: ENV.port,
    env: ENV.nodeEnv,
    wsClients: getClientCount(),
    authRequired: authService.settings.enabled,
    uptime: Math.round(process.uptime()),
    now: new Date().toISOString(),
  });
});

// 解析登录态（不拦截），随后统一鉴权网关放行白名单
app.use('/api', attachUser);
app.use('/api', createAuthGate());

app.use('/api', authRoutes);
app.use('/api', configRoutes);
app.use('/api', articleRoutes);
app.use('/api', hotRoutes);
app.use('/api', templateRoutes);
app.use('/api', copywritingRoutes);
app.use('/api', libraryRoutes);
app.use('/api', novelRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ status: 'error', message: '接口不存在' });
});

app.use(errorHandler);

/* ---------------- 日志转发到前端 ---------------- */

logger.on('log', (entry) => {
  pushBufferedLog(entry);
  broadcast({ type: 'log', level: entry.type, message: entry.message, timestamp: entry.timestamp });
});

/* ---------------- 启动服务器 ---------------- */

const server = http.createServer(app);

// WebSocket 与 API 使用同一套登录态
setWsAuthEnabled(authService.settings.enabled);
setWsTokenVerifier((token) => Boolean(authService.verify(token)));
initWs(server);

server.listen(ENV.port, ENV.host, () => {
  const banner = [
    '',
    '  ╭──────────────────────────────────────────────╮',
    `  │  ${APP_INFO.name} ${APP_INFO.version}`.padEnd(46) + '│',
    `  │  ${APP_INFO.description}`.padEnd(46) + '│',
    '  ╰──────────────────────────────────────────────╯',
    '',
    `  ➜ API      http://${ENV.host}:${ENV.port}/api`,
    `  ➜ WebSocket ws://${ENV.host}:${ENV.port}/ws`,
    `  ➜ 数据目录  ${PATHS.data}`,
    fs.existsSync(webDist) ? `  ➜ 前端页面  http://${ENV.host}:${ENV.port}` : '  ➜ 前端页面  开发模式请另行启动 npm run dev:web',
    authService.settings.enabled
      ? `  ➜ 登录账号  ${DEFAULT_ADMIN.username} / ${DEFAULT_ADMIN.password}（可在「系统设置 → 账号安全」中修改）`
      : '  ➜ 登录账号  已关闭鉴权（可在系统设置中开启）',
    '',
  ].join('\n');
  // eslint-disable-next-line no-console
  console.log(banner);
});

/* ---------------- 优雅退出 ---------------- */

let closing = false;
function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.warn(`收到 ${signal}，正在关闭服务…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error(`未处理的 Promise 拒绝：${reason instanceof Error ? reason.message : String(reason)}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`未捕获异常：${err.message}`);
});
