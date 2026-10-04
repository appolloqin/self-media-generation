import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { WORKFLOW_STAGES, type LogEntry, type TaskStatus, type WsMessage } from '@smg/shared';
import { getToken } from '@/api/client';
import { generateApi } from '@/api';

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

/** 跨组件重挂载去重（Strict Mode / 再进工作台不应重复弹窗） */
let handledCompleteKey = '';
let handledFailKey = '';

export function completionEventKey(taskId: number | null, articleId: number | null, message: string): string {
  return `c:${taskId ?? 0}:${articleId ?? 0}:${message}`;
}

export function consumeEventKey(prev: string, next: string): { handled: boolean; key: string } {
  if (!next || prev === next) return { handled: false, key: prev };
  return { handled: true, key: next };
}

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
    set((s) => {
      // 服务端在 completed/failed 后会再推 idle；不可盖掉终态，否则 useTaskEvents 收不到完成回调、按钮一直 loading
      if (status === 'idle' && (s.status === 'completed' || s.status === 'failed')) {
        return { running: false, taskId: null };
      }
      return { status, taskId, running: status === 'running' };
    }),
  pushLog: (entry) =>
    set((s) => ({ logs: [...s.logs, entry].slice(-MAX_LOGS) })),
  clearLogs: () => set({ logs: [] }),
  complete: (taskId, articleId, message) =>
    set((s) => {
      if (s.status === 'completed' && s.lastArticleId === articleId && s.lastMessage === message) return s;
      return {
        taskId,
        lastArticleId: articleId,
        lastMessage: message,
        status: 'completed',
        running: false,
        progress: { stage: 'done', progress: 100, message },
      };
    }),
  fail: (taskId, error) =>
    set((s) => {
      if (s.status === 'failed' && s.error === error) return s;
      return {
        taskId,
        error,
        status: 'failed',
        running: false,
        progress: { stage: 'failed', progress: 100, message: error },
      };
    }),
  setError: (error) => set({ error }),
  reset: () => {
    handledCompleteKey = '';
    handledFailKey = '';
    set({
      error: null,
      lastMessage: '',
      lastArticleId: null,
      progress: { stage: 'idle', progress: 0 },
      status: 'idle',
      running: false,
      taskId: null,
    });
  },
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
      pushLogSafe({ type: msg.level ?? 'info', message: msg.message, timestamp: msg.timestamp });
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

/** 订阅任务完成 / 失败事件（同一完成只提示一次） */
export function useTaskEvents(handlers: {
  onCompleted?: (articleId: number | null, message: string) => void;
  onFailed?: (error: string) => void;
}) {
  const ref = useRef(handlers);
  ref.current = handlers;

  const status = useTaskStore((s) => s.status);
  const taskId = useTaskStore((s) => s.taskId);
  const lastArticleId = useTaskStore((s) => s.lastArticleId);
  const lastMessage = useTaskStore((s) => s.lastMessage);
  const error = useTaskStore((s) => s.error);

  useEffect(() => {
    if (status !== 'completed') return;
    const next = completionEventKey(taskId, lastArticleId, lastMessage);
    const hit = consumeEventKey(handledCompleteKey, next);
    if (!hit.handled) return;
    handledCompleteKey = hit.key;
    ref.current.onCompleted?.(lastArticleId, lastMessage);
  }, [status, taskId, lastArticleId, lastMessage]);

  useEffect(() => {
    if (status !== 'failed' || !error) return;
    const next = `f:${taskId ?? 0}:${error}`;
    const hit = consumeEventKey(handledFailKey, next);
    if (!hit.handled) return;
    handledFailKey = hit.key;
    ref.current.onFailed?.(error);
  }, [status, taskId, error]);
}

/* ---------------- HTTP 轮询（WS 代理失败时的进度/日志兜底） ---------------- */

let livePollTimer: ReturnType<typeof setInterval> | null = null;
let liveLogSeq = 0;
const seenLogKeys = new Set<string>();

function logKey(message: string, timestamp: number): string {
  return `${timestamp}|${message}`;
}

function pushLogSafe(entry: LogEntry): void {
  const key = logKey(entry.message, entry.timestamp);
  if (seenLogKeys.has(key)) return;
  seenLogKeys.add(key);
  if (seenLogKeys.size > 800) {
    const drop = [...seenLogKeys].slice(0, 400);
    for (const k of drop) seenLogKeys.delete(k);
  }
  useTaskStore.getState().pushLog(entry);
}

async function pullGenerateLive(): Promise<void> {
  try {
    const live = await generateApi.live(liveLogSeq);
    liveLogSeq = live.logSeq;
    const store = useTaskStore.getState();

    if (live.task && (live.running || store.status === 'running')) {
      const label = WORKFLOW_STAGES.find((s) => s.key === live.task!.stage)?.label ?? live.task.stage;
      store.setStatus('running', live.task.id);
      store.setProgress({
        stage: live.task.stage,
        progress: live.task.progress,
        message: label,
      });
    }

    for (const log of live.logs) {
      pushLogSafe({ type: log.type, message: log.message, timestamp: log.timestamp });
    }
  } catch {
    /* 轮询失败时忽略，下次再试 */
  }
}

/** 开始 HTTP 轮询联动执行状态与日志 */
export function startTaskLivePoll(): void {
  stopTaskLivePoll();
  liveLogSeq = 0;
  seenLogKeys.clear();
  void pullGenerateLive();
  livePollTimer = setInterval(() => {
    void pullGenerateLive();
  }, 500);
}

export function stopTaskLivePoll(): void {
  if (livePollTimer) {
    clearInterval(livePollTimer);
    livePollTimer = null;
  }
}

/** 结束时再拉一次，避免尾部日志丢失 */
export async function flushTaskLivePoll(): Promise<void> {
  await pullGenerateLive();
  stopTaskLivePoll();
}
