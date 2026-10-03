import Database from 'better-sqlite3';
import { PATHS } from '../config/env.js';

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;

  instance = new Database(PATHS.db);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.pragma('busy_timeout = 5000');
  instance.pragma('synchronous = NORMAL');
  return instance;
}

export type Row = Record<string, any>;

/** 便捷查询封装 */
export function query<T = Row>(sql: string, params: any[] | Record<string, any> = []): T[] {
  return getDb().prepare(sql).all(params as any) as T[];
}

export function queryOne<T = Row>(sql: string, params: any[] | Record<string, any> = []): T | undefined {
  return getDb().prepare(sql).get(params as any) as T | undefined;
}

export function run(sql: string, params: any[] | Record<string, any> = []): Database.RunResult {
  return getDb().prepare(sql).run(params as any);
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction(fn)();
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
