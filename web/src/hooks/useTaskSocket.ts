import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { LogEntry, TaskStatus, WsMessage } from '@smg/shared';
import { getToken } from '@/api/client';

export type ProgressState = {
  stage: string;
  progress: number;
  message?: string;
};

type TaskState = {
  connected: boolean;
  running: boolean;
  taskId: number | null;
  status: TaskStatus;
  progress: ProgressState;
  logs: LogEntry[];
  lastArticleId: number | null;
  lastMessage: string;
  error: string | null;

  setConnected: (v: boolean) => void;
  setRunning: (v: boolean) => void;
  setProgress: (p: ProgressState) => void;
  setStatus: (status: TaskStatus, taskId: number | null) => void;
  pushLog: (entry: LogEntry) => void;
  clearLogs: () => void;
  complete: (taskId: number, articleId: number | null, message: string) => void;
  fail: (taskId: number, error: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

const MAX_LOGS = 500;

export const useTaskStore = create<TaskState>((set) => ({
  connected: false,
  running: false,
  taskId: null,
  status: 'idle',
  progress: { stage: 'idle', progress: 0 },
  logs: [],
  lastArticleId: null,
  lastMessage: '',
  error: null,

  setConnected: (v) => set({ connected: v }),
  setRunning: (v) => set({ running: v }),
  setProgress: (p) => set({ progress: p }),
  setStatus: (status, taskId) =>
    set({ status, taskId, running: status === 'running' }),
  pushLog: (entry) =>
    set((s) => ({ logs: [...s.logs, entry].slice(-MAX_LOGS) })),
  clearLogs: () => set({ logs: [] }),
  complete: (taskId, articleId, message) =>
    set({
      taskId,
      lastArticleId: articleId,
      lastMessage: message,
      status: 'completed',
      running: false,
      progress: { stage: 'done', progress: 100, message },
    }),
  fail: (taskId, error) =>
    set({
      taskId,
      error,
      status: 'failed',
      running: false,
      progress: { stage: 'failed', progress: 100, message: error },
    }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      error: null,
      lastMessage: '',
      lastArticleId: null,
      progress: { stage: 'idle', progress: 0 },
      status: 'idle',
      running: false,
      taskId: null,
    }),
}));

let socket: WebSocket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let manualClose = false;
/** 连续因鉴权失败被拒的次数；超过阈值停止重连，等待用户重新登录 */
let authRejects = 0;
const MAX_AUTH_REJECTS = 3;

/** 建立全局唯一的任务 WebSocket 连接 */
export function connectTaskSocket(): () => void {
  const store = useTaskStore.getState();

  const open = () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // 开启鉴权时需携带 token，服务端在 HTTP upgrade 阶段校验
    const token = getToken();
    if (!token) authRejects = 0;
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    const url = `${proto}://${window.location.host}/ws${query}`;

    try {
      socket = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      authRejects = 0;
      store.setConnected(true);
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
      }, 25_000);
    };

    socket.onmessage = (ev) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      handleMessage(msg);
    };

    socket.onclose = (ev) => {
      useTaskStore.getState().setConnected(false);
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (manualClose) return;

      // upgrade 阶段被服务端拒绝时，浏览器只会给 1006（异常断开），
      // 无法区分「服务没启动」和「token 失效」，因此这里在无 token 时直接不再重连
      if (ev.code === 1008 || ev.code === 4401 || getToken() === null) {
        authRejects += 1;
        if (authRejects >= MAX_AUTH_REJECTS) {
          store.setError('登录已失效，请重新登录');
          return;
        }
      }
      scheduleReconnect();
    };

    socket.onerror = () => {
      socket?.close();
    };
  };

  const scheduleReconnect = () => {
    if (manualClose || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, 3000);
  };

  open();

  return () => {
    manualClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    socket?.close();
    socket = null;
  };
}

function handleMessage(msg: WsMessage): void {
  const store = useTaskStore.getState();
  switch (msg.type) {
    case 'log':
      store.pushLog({ type: msg.level ?? 'info', message: msg.message, timestamp: msg.timestamp });
      break;
    case 'progress':
      store.setProgress({ stage: msg.stage, progress: msg.progress, message: msg.message });
      break;
    case 'status':
      store.setStatus(msg.status, msg.taskId);
      break;
    case 'completed':
      store.complete(msg.taskId, msg.articleId, msg.message);
      break;
    case 'failed':
      store.fail(msg.taskId, msg.error);
      break;
    default:
      break;
  }
}

/** 订阅任务完成 / 失败事件（每次状态变化触发一次回调） */
export function useTaskEvents(handlers: {
  onCompleted?: (articleId: number | null, message: string) => void;
  onFailed?: (error: string) => void;
}) {
  const ref = useRef(handlers);
  ref.current = handlers;

  const status = useTaskStore((s) => s.status);
  const lastArticleId = useTaskStore((s) => s.lastArticleId);
  const lastMessage = useTaskStore((s) => s.lastMessage);
  const error = useTaskStore((s) => s.error);

  useEffect(() => {
    if (status === 'completed') ref.current.onCompleted?.(lastArticleId, lastMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, lastArticleId]);

  useEffect(() => {
    if (status === 'failed' && error) ref.current.onFailed?.(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, error]);
}
