import { Router } from 'express';
import { z } from 'zod';
import { authService, DEFAULT_ADMIN, clientIp } from '../services/auth.service.js';
import { requireAdmin, requireAuth, logAuthFailure } from './auth.guard.js';
import { ok, wrap, num, HttpError } from './helpers.js';

const r = Router();

/* ---------------- 登录 / 登出 ---------------- */

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

r.post(
  '/auth/login',
  wrap((req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const ip = clientIp(req);
    try {
      const result = authService.login({
        username,
        password,
        ip,
        userAgent: String(req.headers['user-agent'] ?? ''),
      });
      ok(res, result);
    } catch (err) {
      logAuthFailure(username, ip);
      throw err;
    }
  }),
);

r.post(
  '/auth/logout',
  wrap((req, res) => {
    if (req.authToken) authService.logout(req.authToken);
    ok(res, { loggedOut: true });
  }),
);

/** 前端启动时调用：返回是否需要登录 */
r.get(
  '/auth/status',
  wrap((req, res) => {
    const settings = authService.settings;
    ok(res, {
      enabled: settings.enabled,
      allowGuest: settings.allowGuest,
      authenticated: Boolean(req.user),
      user: req.user
        ? {
            id: req.user.id,
            username: req.user.username,
            displayName: req.user.displayName,
            role: req.user.role,
            mustChangePassword: req.user.mustChangePassword === 1,
          }
        : null,
      defaultAccount: settings.enabled ? { username: DEFAULT_ADMIN.username, password: DEFAULT_ADMIN.password } : null,
    });
  }),
);

r.get(
  '/auth/me',
  requireAuth,
  wrap((req, res) => {
    const u = req.user!;
    ok(res, {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      mustChangePassword: u.mustChangePassword === 1,
    });
  }),
);

/* ---------------- 修改自己的密码 ---------------- */

r.post(
  '/auth/password',
  requireAuth,
  wrap((req, res) => {
    const { oldPassword, newPassword } = z
      .object({ oldPassword: z.string().min(1, '请输入原密码'), newPassword: z.string().min(6, '新密码至少 6 位') })
      .parse(req.body);
    authService.changePassword(req.user!.id, oldPassword, newPassword);
    // 改密后清掉当前会话，强制重新登录
    if (req.authToken) authService.logout(req.authToken);
    ok(res, { changed: true });
  }),
);

/* ---------------- 鉴权设置（管理员） ---------------- */

r.get(
  '/auth/settings',
  wrap((_req, res) => ok(res, authService.settings)),
);

r.put(
  '/auth/settings',
  requireAdmin,
  wrap((req, res) => {
    const patch = z
      .object({
        enabled: z.boolean().optional(),
        allowGuest: z.boolean().optional(),
        maxAttempts: z.number().int().min(0).max(100).optional(),
        lockMinutes: z.number().int().min(1).max(1440).optional(),
        sessionHours: z.number().int().min(1).max(24 * 365).optional(),
      })
      .parse(req.body ?? {});
    ok(res, authService.saveSettings(patch));
  }),
);

/* ---------------- 用户管理（管理员） ---------------- */

r.get('/auth/users', requireAdmin, wrap((_req, res) => ok(res, authService.listUsers())));

r.post(
  '/auth/users',
  requireAdmin,
  wrap((req, res) => {
    const body = z
      .object({
        username: z.string().min(2, '用户名至少 2 位').max(32),
        password: z.string().min(6, '密码至少 6 位'),
        displayName: z.string().max(32).optional(),
        role: z.enum(['admin', 'editor']).optional(),
      })
      .parse(req.body);
    ok(res, authService.createUser(body), 201);
  }),
);

r.put(
  '/auth/users/:id',
  requireAdmin,
  wrap((req, res) => {
    const id = num(req.params.id);
    const patch = z
      .object({
        displayName: z.string().max(32).optional(),
        role: z.enum(['admin', 'editor']).optional(),
        enabled: z.boolean().optional(),
        password: z.string().min(6, '密码至少 6 位').optional(),
        mustChangePassword: z.boolean().optional(),
      })
      .parse(req.body ?? {});

    // 防止管理员把自己降级导致系统失去管理员
    if (id === req.user!.id && patch.role && patch.role !== 'admin') {
      throw new HttpError('不能修改自己的管理员角色');
    }
    if (id === req.user!.id && patch.enabled === false) {
      throw new HttpError('不能停用自己的账号');
    }
    ok(res, authService.updateUser(id, patch));
  }),
);

r.post(
  '/auth/users/:id/unlock',
  requireAdmin,
  wrap((req, res) => {
    const target = authService.getById(num(req.params.id));
    if (!target) throw new HttpError('用户不存在', 404);
    authService.unlock(target.username);
    ok(res, { unlocked: true, username: target.username });
  }),
);

r.delete(
  '/auth/users/:id',
  requireAdmin,
  wrap((req, res) => {
    const id = num(req.params.id);
    if (id === req.user!.id) throw new HttpError('不能删除自己的账号');
    authService.deleteUser(id);
    ok(res, { removed: true });
  }),
);

/* ---------------- 会话管理 ---------------- */

r.get(
  '/auth/sessions',
  requireAdmin,
  wrap((_req, res) => ok(res, authService.listSessions())),
);

r.get(
  '/auth/sessions/mine',
  requireAuth,
  wrap((req, res) => ok(res, authService.listSessions(req.user!.id))),
);

r.delete(
  '/auth/sessions/:id',
  requireAdmin,
  wrap((req, res) => {
    authService.revokeSession(String(req.params.id));
    ok(res, { removed: true });
  }),
);

r.post(
  '/auth/sessions/purge',
  requireAdmin,
  wrap((_req, res) => ok(res, { removed: authService.purgeExpiredSessions() })),
);

export default r;
