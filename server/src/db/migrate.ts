import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './connection.js';
import { SCHEMA_SQL } from './schema.js';
import { PATHS } from '../config/env.js';

let migrated = false;

export function runMigrations(): void {
  if (migrated) return;
  const db = getDb();

  db.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT)');

  // v1: 基础 schema（幂等）
  db.exec(SCHEMA_SQL);

  const current = db
    .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM _migrations')
    .get() as { v: number };

  if (current.v < 1) {
    db.prepare('INSERT OR REPLACE INTO _migrations (version, applied_at) VALUES (?, datetime(\'now\',\'localtime\'))').run(1);
  }

  migrated = true;
}

/** 启动时确保资源目录存在（内置数据由 runSeed 写入） */
export function syncBuiltinResources(): void {
  for (const dir of [PATHS.templates, PATHS.images, PATHS.articles, PATHS.logs]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
