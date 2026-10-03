import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiResult } from '@smg/shared';

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** 包装异步路由，统一错误处理 */
export function wrap(handler: (req: Request, res: Response) => unknown | Promise<unknown>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

export function ok<T>(res: Response, data: T, status = 200): Response {
  const body: ApiResult<T> = { status: 'success', data };
  return res.status(status).json(body);
}

export function fail(res: Response, message: string, status = 400): Response {
  const body: ApiResult = { status: 'error', message };
  return res.status(status).json(body);
}

export function num(value: unknown, field = 'id'): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(`参数 ${field} 无效`);
  return n;
}

export function intParam(value: unknown, fallback: number, min = 1, max = 1000): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** 统一错误中间件 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const msg = err.issues.map((i) => `${i.path.join('.') || '参数'}: ${i.message}`).join('; ');
    fail(res, `参数校验失败 - ${msg}`, 422);
    return;
  }
  if (err instanceof HttpError) {
    fail(res, err.message, err.status);
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error('[API Error]', err);
  fail(res, message, 500);
}
