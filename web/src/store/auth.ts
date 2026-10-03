import { create } from 'zustand';
import { authApi, setToken, getToken, type AuthStatus, type AuthUserInfo } from '@/api';

type AuthStore = {
  /** 是否已完成初始化的登录态探测 */
  initialized: boolean;
  loading: boolean;
  /** 服务端是否开启了鉴权；关闭时直接进入系统 */
  required: boolean;
  user: AuthUserInfo | null;
  defaultAccount: { username: string; password: string } | null;
  error: string | null;

  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => void;
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  initialized: false,
  loading: false,
  required: true,
  user: null,
  defaultAccount: null,
  error: null,

  init: async () => {
    set({ loading: true, error: null });
    try {
      const status: AuthStatus = await authApi.status();
      set({
        required: status.enabled,
        user: status.user,
        defaultAccount: status.defaultAccount,
        initialized: true,
        loading: false,
      });
    } catch (err) {
      set({ initialized: true, loading: false, error: (err as Error).message });
    }
  },

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const result = await authApi.login(username, password);
      setToken(result.token);
      set({
        user: {
          id: result.user.id,
          username: result.user.username,
          displayName: result.user.displayName,
          role: result.user.role,
          mustChangePassword: result.mustChangePassword,
        },
        loading: false,
        initialized: true,
        error: null,
      });
      return true;
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
      return false;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      /* 即使服务端调用失败也要清掉本地状态 */
    }
    setToken(null);
    set({ user: null });
  },

  refresh: async () => {
    if (!getToken()) return;
    try {
      const me = await authApi.me();
      set({ user: me });
    } catch {
      /* 401 已由拦截器处理 */
    }
  },

  /** 收到 401 时由拦截器调用 */
  clear: () => set({ user: null }),
}));
