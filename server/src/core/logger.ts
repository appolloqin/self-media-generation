import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PATHS } from '../config/env.js';
import type { LogEntry } from '@smg/shared';

const COLORS: Record<LogEntry['type'], string> = {
  info: '\x1b[36m',
  success: '\x1b[32m',
  warning: '\x1b[33m',
  error: '\x1b[31m',
  status: '\x1b[35m',
  internal: '\x1b[90m',
};
const RESET = '\x1b[0m';

class Logger extends EventEmitter {
  private fileStream: fs.WriteStream | null = null;
  private date: string = '';

  private ensureStream() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.fileStream && this.date === today) return this.fileStream;
    this.fileStream?.end();
    this.date = today;
    this.fileStream = fs.createWriteStream(path.join(PATHS.logs, `smg_${today}.log`), {
      flags: 'a',
    });
    return this.fileStream;
  }

  log(type: LogEntry['type'], message: string) {
    const entry: LogEntry = { type, message, timestamp: Date.now() };
    const time = new Date(entry.timestamp).toTimeString().slice(0, 8);

    const tag = type.toUpperCase().padEnd(7);
    const line = `[${time}] [${tag}] ${message}`;

    // 控制台
    const color = COLORS[type] ?? '';
    const stream = type === 'error' ? process.stderr : process.stdout;
    stream.write(`${color}${line}${RESET}\n`);

    // 文件
    try {
      this.ensureStream().write(`${line}\n`);
    } catch {
      /* ignore */
    }

    // 广播给前端
    this.emit('log', entry);
  }

  info(m: string) {
    this.log('info', m);
  }
  success(m: string) {
    this.log('success', m);
  }
  warn(m: string) {
    this.log('warning', m);
  }
  error(m: string) {
    this.log('error', m);
  }
  status(m: string) {
    this.log('status', m);
  }
  internal(m: string) {
    this.log('internal', m);
  }
}

export const logger = new Logger();
