import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { authService } from '../services/auth.service.js';
import { logger } from '../core/logger.js';
import { fail } from './helpers.js';
import type { AuthUser } from '@smg/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      authToken?: string;
    }
  }
}

/** 免登录接口前缀 */
const PUBLIC_PATHS = new Set(['/health', '/auth/login', '/auth/settings', '/auth/status']);

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const custom = req.headers['x-auth-token'];
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return undefined;
}

/**
 * 解析登录态但不拦截。
 * 所有 /api 请求都经过它，以便路由内使用 req.user。
 */
export const attachUser: RequestHandler = (req, _res, next) => {
  const settings = authService.settings;
  if (!settings.enabled) {
    // 鉴权关闭时给一个虚拟管理员，避免下游 req.user 为空导致报错
    req.user = authService.getById(1);
    return next();
  }
  const token = readToken(req);
  if (token) {
    const user = authService.verify(token);
    if (user) {
      req.user = user;
      req.authToken = token;
    }
  }
  next();
};

/** 强制登录：未登录返回 401 */
export const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!authService.settings.enabled) return next();
  if (req.user) return next();
  fail(res, '未登录或登录已过期，请重新登录', 401);
};

/** 管理员专属：非 admin 角色返回 403 */
export const requireAdmin: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!authService.settings.enabled) return next();
  if (!req.user) return fail(res, '未登录或登录已过期，请重新登录', 401);
  if (req.user.role !== 'admin') return fail(res, '需要管理员权限', 403);
  next();
};

/**
 * 统一鉴权网关：默认保护所有 /api，仅放行白名单。
 * 挂在所有业务路由之前。
 */
export function createAuthGate(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const settings = authService.settings;
    if (!settings.enabled) return next();

    // req.originalUrl 形如 /api/xxx，比较时同时兼容带 /api 前缀和不带两种形式
    const url = (req.originalUrl || req.url).split('?')[0];
    const normalized = url.startsWith('/api') ? url.slice(4) || '/' : url;
    if (PUBLIC_PATHS.has(url) || PUBLIC_PATHS.has(normalized)) return next();

    if (req.user) return next();
    if (settings.allowGuest) return next();

    return fail(res, '未登录或登录已过期，请重新登录', 401);
  };
}

/** 登录失败次数过多时打日志，便于排查暴力破解 */
export function logAuthFailure(username: string, ip: string): void {
  logger.warn(`登录失败：用户名「${username}」 来源 ${ip}`);
}
