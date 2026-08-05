/**
 * 职责: 打开并配置 Translation AIducator 的单个 SQLite 数据库
 * 依赖内部: ../config.ts
 * 依赖外部: better-sqlite3, node:fs, node:path
 * 暴露: openDatabase | SqliteDatabase
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { appConfig } from '../config.js';

export type SqliteDatabase = Database.Database;
const MINIMUM_SQLITE_VERSION = [3, 51, 3] as const;

function versionParts(value: string): number[] {
  return value.split('.').map((part) => Number(part));
}

function compareVersions(actual: number[], required: readonly number[]): number {
  for (let index = 0; index < required.length; index += 1) {
    const difference = (actual[index] || 0) - required[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

function assertSafeSqliteVersion(db: SqliteDatabase): void {
  const row = db.prepare('SELECT sqlite_version() AS version').get() as { version: string };
  const actual = versionParts(row.version);
  if (compareVersions(actual, MINIMUM_SQLITE_VERSION) < 0) {
    throw new Error(`SQLite ${row.version} 低于要求的 3.51.3。`);
  }
}

function configureDatabase(db: SqliteDatabase): void {
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('busy_timeout = 5000');
  assertSafeSqliteVersion(db);
}

export function openDatabase(path = appConfig.databasePath): SqliteDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  configureDatabase(db);
  return db;
}