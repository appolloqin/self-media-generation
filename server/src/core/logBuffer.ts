import type { LogEntry } from '@smg/shared';

export type BufferedLog = LogEntry & { seq: number };

const MAX = 400;
let seq = 0;
const buf: BufferedLog[] = [];

export function pushBufferedLog(entry: LogEntry): void {
  seq += 1;
  buf.push({ ...entry, seq });
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
}

export function logsSince(sinceSeq: number): { logs: BufferedLog[]; latestSeq: number } {
  // sinceSeq<=0：只对齐游标，避免把历史日志一次性灌进前端
  const logs = sinceSeq > 0 ? buf.filter((l) => l.seq > sinceSeq) : [];
  return { logs, latestSeq: seq };
}

export function latestLogSeq(): number {
  return seq;
}
