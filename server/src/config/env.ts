import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 定位项目根目录
 * 开发模式：<root>/server/src/config -> 上一级为 server，再上一级为根
 * 构建模式：<root>/server/dist       -> 上一级为 server，再上一级为根
 */
function resolveRoot(): string {
  // src 或 dist 的父目录是 server
  const serverDir = path.resolve(__dirname, '..', '..');
  const base = path.basename(serverDir) === 'server' ? serverDir : path.resolve(__dirname, '..');
  return path.resolve(base, '..');
}

export const SERVER_ROOT = path.resolve(__dirname, '..');
export const PROJECT_ROOT = resolveRoot();

dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

const dataDir = process.env.SMG_DATA_DIR
  ? path.resolve(process.env.SMG_DATA_DIR)
  : path.join(PROJECT_ROOT, 'data');

export const PATHS = {
  root: PROJECT_ROOT,
  server: SERVER_ROOT,
  data: dataDir,
  db: path.join(dataDir, 'smg.db'),
  dbDir: path.join(dataDir, 'db'),
  uploads: path.join(dataDir, 'uploads'),
  images: path.join(dataDir, 'images'),
  articles: path.join(dataDir, 'articles'),
  templates: path.join(dataDir, 'templates'),
  logs: path.join(dataDir, 'logs'),
  cache: path.join(dataDir, 'cache'),
  tmp: path.join(dataDir, 'tmp'),
} as const;

export const ENV = {
  port: Number(process.env.PORT ?? 5178),
  host: process.env.HOST ?? '127.0.0.1',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** 允许的前端来源（逗号分隔），生产环境同源无需配置 */
  corsOrigins: (
    process.env.CORS_ORIGINS ??
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5178,http://127.0.0.1:5178'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** 单次请求体上限 */
  bodyLimit: process.env.BODY_LIMIT ?? '30mb',
  /** 默认是否开启内置模拟数据（无 LLM Key 时前端仍可演示） */
  mockMode: process.env.SMG_MOCK === '1',
} as const;

for (const dir of [
  PATHS.data,
  PATHS.dbDir,
  PATHS.uploads,
  PATHS.images,
  PATHS.articles,
  PATHS.templates,
  PATHS.logs,
  PATHS.cache,
  PATHS.tmp,
]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const APP_INFO = {
  name: '智媒工坊',
  shortName: 'SMG',
  version: '1.0.0',
  description: 'AI 自媒体内容创作平台',
} as const;
