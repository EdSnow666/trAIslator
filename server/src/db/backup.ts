/**
 * 职责: 使用 SQLite 在线备份 API 创建可校验的数据库快照
 * 依赖内部: ../config.ts, ../shared.ts, ./database.ts
 * 依赖外部: better-sqlite3, node:fs, node:path
 * 暴露: createDatabaseBackup | restoreDatabaseBackup
 */

import Database from 'better-sqlite3';
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { appConfig } from '../config.js';
import { newId, nowIso, sha256 } from '../shared.js';
import type { SqliteDatabase } from './database.js';

function backupFilename(): string {
  return `translation-aiducator-${new Date().toISOString().replaceAll(':', '-')}.db`;
}

function hasBackupTable(db: SqliteDatabase): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='backup_records'").get());
}

function recordBackup(db: SqliteDatabase, path: string, checksum: string): void {
  if (!hasBackupTable(db)) return;
  db.prepare(`INSERT INTO backup_records
    (id, path, checksum, size_bytes, status, created_at) VALUES (?, ?, ?, ?, 'completed', ?)`)
    .run(newId(), path, checksum, statSync(path).size, nowIso());
}

export async function createDatabaseBackup(db: SqliteDatabase, backupDir = appConfig.backupDir): Promise<string> {
  mkdirSync(backupDir, { recursive: true });
  const destination = resolve(backupDir, backupFilename());
  await db.backup(destination);
  const checksum = sha256(readFileSync(destination));
  recordBackup(db, destination, checksum);
  return destination;
}
function verifyBackup(path: string): void {
  const backup = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = backup.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const foreignKeys = backup.pragma('foreign_key_check') as unknown[];
    if (integrity[0]?.integrity_check !== 'ok' || foreignKeys.length) {
      throw new Error('迁移前备份校验失败，拒绝执行恢复。');
    }
  } finally { backup.close(); }
}

export function restoreDatabaseBackup(databasePath: string, backupPath: string): void {
  verifyBackup(backupPath);
  for (const suffix of ['-wal', '-shm']) rmSync(`${databasePath}${suffix}`, { force: true });
  copyFileSync(backupPath, databasePath);
}
