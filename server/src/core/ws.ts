import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { logger } from './logger.js';
import type { WsMessage } from '@smg/shared';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

/** 鉴权开关由 index.ts 注入，避免循环依赖 */
let authEnabled = false;
export function setWsAuthEnabled(value: boolean): void {
  authEnabled = value;
}

type TokenVerifier = (token: string | undefined) => boolean;

let verifyToken: TokenVerifier = () => true;

export function setWsTokenVerifier(fn: TokenVerifier): void {
  verifyToken = fn;
}

/** 从握手请求中提取 token：优先 query，其次子协议，最后 header */
function extractToken(req: IncomingMessage): string | undefined {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const q = url.searchParams.get('token') ?? url.searchParams.get('access_token');
    if (q) return q;

    const proto = req.headers['sec-websocket-protocol'];
    if (typeof proto === 'string') {
      // 形如 "smg, token=xxxx" 或直接 "smg.xxxx"
      const parts = proto.split(',').map((p) => p.trim());
      for (const p of parts) {
        if (p.startsWith('token=')) return p.slice(6);
        if (p.startsWith('smg.')) return p.slice(4);
      }
      if (parts[0]) return parts[0];
    }

    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  } catch {
    /* ignore */
  }
  return undefined;
}

export function initWs(server: Server): void {
  wss = new WebSocketServer({
    server,
    path: '/ws',
    // 在 HTTP upgrade 阶段就完成鉴权，未授权的连接根本不会升级成 WebSocket，
    // 避免「先握手成功再关闭」导致客户端收到 open 事件、误以为连接可用
    verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
      if (!authEnabled) return true;
      const allowed = verifyToken(extractToken(info.req));
      if (!allowed) {
        logger.warn(`WebSocket 未授权连接已拒绝：${info.req.socket.remoteAddress ?? '未知来源'}`);
      }
      return allowed;
    },
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'status', status: 'idle', taskId: null } as WsMessage));

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch {
        /* ignore */
      }
    });
  });

  wss.on('error', (err) => logger.error(`WebSocket 服务异常: ${err.message}`));
}

export function broadcast(message: WsMessage | Record<string, unknown>): void {
  if (!wss) return;
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {
        /* ignore */
      }
    }
  }
}

export function getClientCount(): number {
  return clients.size;
}
