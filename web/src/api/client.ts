import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ApiResult } from '@smg/shared';

const TOKEN_KEY = 'smg.auth.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 隐私模式下 localStorage 不可用，忽略 */
  }
}

const http: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 600_000,
  headers: { 'Content-Type': 'application/json' },
});

/** 未登录时的回调，由 AuthProvider 注册 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.set?.('Authorization', `Bearer ${token}`);
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const message =
      error?.response?.data?.message ??
      (error?.code === 'ECONNABORTED' ? '请求超时，请检查网络或模型响应速度' : error?.message) ??
      '网络异常';

    // 401：清除本地 token 并通知上层跳转登录页
    // 登录接口自身的 401 不触发，避免登录页反复跳转
    const url = String(error?.config?.url ?? '');
    if (status === 401 && !url.includes('/auth/login')) {
      setToken(null);
      onUnauthorized?.();
    }
    return Promise.reject(new Error(message));
  },
);

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await http.request<ApiResult<T>>(config);
  const body = res.data;
  if (body?.status === 'error') throw new Error(body.message ?? '请求失败');
  return body?.data as T;
}

export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) => request<T>({ url, method: 'GET', params }),
  post: <T>(url: string, data?: unknown) => request<T>({ url, method: 'POST', data }),
  put: <T>(url: string, data?: unknown) => request<T>({ url, method: 'PUT', data }),
  patch: <T>(url: string, data?: unknown) => request<T>({ url, method: 'PATCH', data }),
  delete: <T>(url: string, params?: Record<string, unknown>) => request<T>({ url, method: 'DELETE', params }),
  upload: <T>(url: string, form: FormData, onProgress?: (percent: number) => void) =>
    request<T>({
      url,
      method: 'POST',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
      },
    }),
};

export const httpClient = http;
