import crypto from 'node:crypto';
import { query, queryOne, run, transaction } from '../db/connection.js';
import { logger } from '../core/logger.js';
import { HttpError } from '../api/helpers.js';
import type { AuthSettings, AuthUser, LoginResult, PublicUser, SessionInfo, UserRole } from '@smg/shared';

const USER_COLS = `id, username, display_name AS displayName, password_hash AS passwordHash,
  password_salt AS passwordSalt, role, must_change_password AS mustChangePassword,
  enabled, created_at AS createdAt, last_login_at AS lastLoginAt`;

const DEFAULT_ADMIN = { username: 'admin', password: 'admin123', displayName: '系统管理员', role: 'admin' as const };

export const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  enabled: true,
  allowGuest: false,
  maxAttempts: 5,
  lockMinutes: 15,
  sessionHours: 24 * 7,
};

/* ---------------- 密码哈希（scrypt） ---------------- */

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return { hash, salt: s };
}

function verifyPassword(password: string, user: AuthUser): boolean {
  const actual = Buffer.from(hashPassword(password, user.passwordSalt).hash, 'hex');
  const expected = Buffer.from(user.passwordHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/* ---------------- 设置存取 ---------------- */

function loadSettings(): AuthSettings {
  const row = queryOne<{ value: string }>("SELECT value FROM app_config WHERE key = 'auth'");
  if (!row?.value) return { ...DEFAULT_AUTH_SETTINGS };
  try {
    return { ...DEFAULT_AUTH_SETTINGS, ...(JSON.parse(row.value) as Partial<AuthSettings>) };
  } catch {
    return { ...DEFAULT_AUTH_SETTINGS };
  }
}

function saveSettings(next: AuthSettings): AuthSettings {
  const merged = { ...DEFAULT_AUTH_SETTINGS, ...next };
  run(
    `INSERT INTO app_config (key, value, updated_at) VALUES ('auth', ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [JSON.stringify(merged)],
  );
  return merged;
}

/** 去掉密码相关字段，其余（含 enabled / mustChangePassword）保留给前端展示 */
function toPublic(user: AuthUser): PublicUser {
  const { passwordHash: _h, passwordSalt: _s, ...pub } = user;
  return pub;
}

function clientIp(req: { ip?: string; socket: { remoteAddress?: string } }): string {
  return req.ip ?? req.socket?.remoteAddress ?? '';
}

/* ---------------- AuthService ---------------- */

class AuthService {
  /* ---------------- 初始化 ---------------- */

  /** 首次启动创建默认管理员；已有用户时不覆盖 */
  ensureDefaultAdmin(): void {
    const count = (query<{ c: number }>('SELECT COUNT(*) AS c FROM users')[0]?.c ?? 0);
    if (count > 0) return;
    const { hash, salt } = hashPassword(DEFAULT_ADMIN.password);
    run(
      `INSERT INTO users (username, display_name, password_hash, password_salt, role, must_change_password, enabled)
       VALUES (?,?,?,?,?,1,1)`,
      [DEFAULT_ADMIN.username, DEFAULT_ADMIN.displayName, hash, salt, DEFAULT_ADMIN.role],
    );
    logger.warn(
      `已创建默认管理员账号：${DEFAULT_ADMIN.username} / ${DEFAULT_ADMIN.password}（可在「系统设置 → 账号安全」中自行修改）`,
    );
  }

  /* ---------------- 设置 ---------------- */

  get settings(): AuthSettings {
    return loadSettings();
  }

  saveSettings(patch: Partial<AuthSettings>): AuthSettings {
    const next = saveSettings({ ...loadSettings(), ...patch });
    if (next.enabled === false) logger.warn('登录鉴权已关闭，所有接口可匿名访问');
    return next;
  }

  /* ---------------- 登录 ---------------- */

  login(req: { username: string; password: string; ip: string; userAgent: string }): LoginResult {
    const settings = loadSettings();
    const username = (req.username ?? '').trim();

    if (!username || !req.password) throw new HttpError('请输入用户名和密码');

    if (this.isLocked(username)) {
      const mins = settings.lockMinutes;
      throw new HttpError(`登录失败次数过多，账号已锁定，请 ${mins} 分钟后再试`, 429);
    }

    const user = this.findByUsername(username);
    // 无论用户是否存在都执行一次哈希校验，避免通过响应时间枚举用户名
    const ok = user ? verifyPassword(req.password, user) : verifyPassword(req.password, DUMMY_USER);

    if (!user || !ok) {
      this.recordAttempt(username, req.ip, false);
      throw new HttpError('用户名或密码错误', 401);
    }
    if (!user.enabled) {
      this.recordAttempt(username, req.ip, false);
      throw new HttpError('该账号已被停用', 403);
    }

    this.recordAttempt(username, req.ip, true);
    this.clearAttempts(username);
    return this.createSession(user, req.ip, req.userAgent, settings.sessionHours);
  }

  private createSession(user: AuthUser, ip: string, userAgent: string, hours: number): LoginResult {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + hours * 3600_000);

    // expires_at 统一用 SQLite 本地时间格式，便于与 datetime('now') 直接比较
    run(
      `INSERT INTO sessions (id, user_id, ip, user_agent, expires_at)
       VALUES (?,?,?,?, datetime('now','localtime', ?))`,
      [token, user.id, ip, userAgent.slice(0, 300), `+${hours} hours`],
    );
    run("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?", [user.id]);

    logger.success(`用户 ${user.username} 登录成功（${ip}）`);
    return {
      token,
      user: toPublic({ ...user, lastLoginAt: new Date().toISOString() }),
      expiresAt: expiresAt.toISOString(),
      mustChangePassword: user.mustChangePassword === 1,
    };
  }

  logout(token: string): void {
    run('DELETE FROM sessions WHERE id = ?', [token]);
  }

  logoutAll(userId: number): number {
    const r = run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    return r.changes;
  }

  /** 校验 token，返回用户；无效或过期返回 null */
  verify(token: string | undefined): AuthUser | null {
    if (!token) return null;
    // 过期判断交给 SQLite，与写入格式保持一致，避免 JS 解析本地时间字符串出错
    const row = queryOne<AuthUser & { expired: number; lastSeenAt: string | null }>(
      `SELECT ${USER_COLS.split(',').map((c) => 'u.' + c.trim()).join(', ')},
              s.last_seen_at AS lastSeenAt,
              (s.expires_at <= datetime('now','localtime')) AS expired
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
      [token],
    );
    if (!row) return null;

    if (row.expired) {
      run('DELETE FROM sessions WHERE id = ?', [token]);
      return null;
    }
    if (!row.enabled) return null;

    // 每 5 分钟更新一次 last_seen，避免高频写库
    const lastSeen = new Date(row.lastSeenAt ?? 0).getTime();
    if (Date.now() - lastSeen > 300_000) {
      run("UPDATE sessions SET last_seen_at = datetime('now','localtime') WHERE id = ?", [token]);
    }
    return row as AuthUser;
  }

  /* ---------------- 失败锁定 ---------------- */

  private isLocked(username: string): boolean {
    const settings = loadSettings();
    if (settings.maxAttempts <= 0) return false;
    // 注意：created_at 用 SQLite 的 datetime('now','localtime') 存储（本地时间、无 T/Z），
    // 这里必须用 datetime() 生成同格式的边界值，不能用 ISO 字符串，否则字符串比较会失效
    const fails = query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM login_attempts
       WHERE username = ? AND ok = 0
         AND created_at > datetime('now','localtime', ?)`,
      [username, `-${settings.lockMinutes} minutes`],
    )[0]?.c ?? 0;
    return fails >= settings.maxAttempts;
  }

  private recordAttempt(username: string, ip: string, ok: boolean): void {
    run('INSERT INTO login_attempts (username, ip, ok) VALUES (?,?,?)', [username, ip, ok ? 1 : 0]);
    // 清理 7 天前的记录
    run("DELETE FROM login_attempts WHERE created_at < datetime('now','localtime','-7 day')");
  }

  private clearAttempts(username: string): void {
    run('DELETE FROM login_attempts WHERE username = ?', [username]);
  }

  /** 解除账号锁定：清空该用户名的失败计数 */
  unlock(username: string): void {
    this.clearAttempts(username);
  }

  /* ---------------- 用户管理 ---------------- */

  listUsers(): PublicUser[] {
    return query<AuthUser>(`SELECT ${USER_COLS} FROM users ORDER BY id`).map(toPublic);
  }

  findByUsername(username: string): AuthUser | undefined {
    return queryOne<AuthUser>(`SELECT ${USER_COLS} FROM users WHERE username = ?`, [username]);
  }

  getById(id: number): AuthUser | undefined {
    return queryOne<AuthUser>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [id]);
  }

  createUser(data: { username: string; password: string; displayName?: string; role?: UserRole }): PublicUser {
    const username = data.username.trim();
    if (!username) throw new HttpError('用户名不能为空');
    if (!data.password || data.password.length < 6) throw new HttpError('密码至少 6 位');
    if (this.findByUsername(username)) throw new HttpError(`用户名「${username}」已存在`, 409);

    const { hash, salt } = hashPassword(data.password);
    const res = run(
      `INSERT INTO users (username, display_name, password_hash, password_salt, role, must_change_password, enabled)
       VALUES (?,?,?,?,?,?,1)`,
      [username, data.displayName?.trim() || username, hash, salt, data.role ?? 'editor', 1],
    );
    return toPublic(this.getById(Number(res.lastInsertRowid))!);
  }

  updateUser(
    id: number,
    patch: { displayName?: string; role?: UserRole; enabled?: boolean; password?: string; mustChangePassword?: boolean },
  ): PublicUser {
    const cur = this.getById(id);
    if (!cur) throw new HttpError('用户不存在', 404);

    if (patch.password) {
      if (patch.password.length < 6) throw new HttpError('密码至少 6 位');
      const { hash, salt } = hashPassword(patch.password);
      run(
        'UPDATE users SET password_hash=?, password_salt=?, must_change_password=0 WHERE id=?',
        [hash, salt, id],
      );
      // 改密后吊销该用户所有会话，强制重新登录；同时解除可能存在的锁定
      this.logoutAll(id);
      this.clearAttempts(cur.username);
    } else {
      run(
        `UPDATE users SET display_name=?, role=?, enabled=?, must_change_password=? WHERE id=?`,
        [
          patch.displayName ?? cur.displayName,
          patch.role ?? cur.role,
          patch.enabled === undefined ? cur.enabled : patch.enabled ? 1 : 0,
          patch.mustChangePassword === undefined ? cur.mustChangePassword : patch.mustChangePassword ? 1 : 0,
          id,
        ],
      );
    }
    if (patch.enabled === false) {
      this.logoutAll(id);
      this.clearAttempts(cur.username);
    }
    return toPublic(this.getById(id)!);
  }

  changePassword(userId: number, oldPassword: string, newPassword: string): void {
    const user = this.getById(userId);
    if (!user) throw new HttpError('用户不存在', 404);
    if (!verifyPassword(oldPassword, user)) throw new HttpError('原密码错误', 401);
    if (!newPassword || newPassword.length < 6) throw new HttpError('新密码至少 6 位');
    if (newPassword === oldPassword) throw new HttpError('新密码不能与原密码相同');
    const { hash, salt } = hashPassword(newPassword);
    run('UPDATE users SET password_hash=?, password_salt=?, must_change_password=0 WHERE id=?', [hash, salt, userId]);
    // 用户已证明身份，解除锁定
    this.clearAttempts(user.username);
    logger.success(`用户 ${user.username} 修改了密码`);
  }

  deleteUser(id: number): void {
    const user = this.getById(id);
    if (!user) throw new HttpError('用户不存在', 404);
    if (user.role === 'admin') {
      const admins = query<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND enabled = 1")[0]?.c ?? 0;
      if (admins <= 1) throw new HttpError('至少需要保留一个管理员账号');
    }
    run('DELETE FROM users WHERE id = ?', [id]);
    // 同时清理该用户名的失败记录，避免同名账号重建后仍处于锁定状态
    this.clearAttempts(user.username);
  }

  /* ---------------- 会话管理 ---------------- */

  listSessions(userId?: number): SessionInfo[] {
    const rows = userId
      ? query<any>(
          `SELECT s.id, s.user_id AS userId, u.username, s.ip, s.user_agent AS userAgent,
                  s.created_at AS createdAt, s.expires_at AS expiresAt, s.last_seen_at AS lastSeenAt
           FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.user_id = ? ORDER BY s.created_at DESC`,
          [userId],
        )
      : query<any>(
          `SELECT s.id, s.user_id AS userId, u.username, s.ip, s.user_agent AS userAgent,
                  s.created_at AS createdAt, s.expires_at AS expiresAt, s.last_seen_at AS lastSeenAt
           FROM sessions s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC`,
        );
    return rows;
  }

  revokeSession(id: string): void {
    run('DELETE FROM sessions WHERE id = ?', [id]);
  }

  purgeExpiredSessions(): number {
    return run("DELETE FROM sessions WHERE expires_at < datetime('now')").changes;
  }
}

/** 用户不存在时用于消耗等量时间的假哈希 */
const DUMMY_USER: AuthUser = (() => {
  const { hash, salt } = hashPassword('dummy-password-placeholder');
  return {
    id: 0,
    username: '',
    displayName: '',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'editor',
    mustChangePassword: 0,
    enabled: 0,
    createdAt: '',
    lastLoginAt: null,
  };
})();

export const authService = new AuthService();
export { DEFAULT_ADMIN, clientIp, hashPassword };
