/**
 * 职责: 加载、校验并执行不可变 SQL migration，拒绝未知的更高数据库版本
 * 依赖内部: ../config.ts, ../shared.ts, ./database.ts
 * 依赖外部: node:fs, node:path
 * 暴露: migrateDatabase | migrationStatus | assertMigrationsReady | MigrationState
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { appConfig } from '../config.js';
import { nowIso, sha256 } from '../shared.js';
import type { SqliteDatabase } from './database.js';

interface MigrationFile {
  id: string;
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationState {
  id: string;
  name: string;
  applied: boolean;
  checksumValid: boolean;
}

function ensureMigrationTable(db: SqliteDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    release_version TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`);
}

function loadMigrationFiles(): MigrationFile[] {
  const directory = resolve(appConfig.rootDir, 'server/migrations');
  return readdirSync(directory).filter((name) => /^\d+.*\.sql$/.test(name)).sort()
    .map((name) => loadMigration(directory, name));
}

function loadMigration(directory: string, name: string): MigrationFile {
  const sql = readFileSync(resolve(directory, name), 'utf8');
  return { id: name.split('_')[0] || name, name, sql, checksum: sha256(sql) };
}

function appliedMigrations(db: SqliteDatabase): Map<string, string> {
  const rows = db.prepare('SELECT id, checksum FROM schema_migrations').all() as Array<{ id: string; checksum: string }>;
  return new Map(rows.map((row) => [row.id, row.checksum]));
}

function applyMigration(db: SqliteDatabase, migration: MigrationFile): void {
  const insert = db.prepare(`INSERT INTO schema_migrations
    (id, name, checksum, release_version, applied_at) VALUES (?, ?, ?, ?, ?)`);
  db.transaction(() => {
    db.exec(migration.sql);
    insert.run(migration.id, migration.name, migration.checksum, appConfig.releaseVersion, nowIso());
  }).immediate();
}

export function migrationStatus(db: SqliteDatabase): MigrationState[] {
  ensureMigrationTable(db);
  const applied = appliedMigrations(db);
  const files = loadMigrationFiles();
  const known = new Set(files.map((item) => item.id));
  const states = files.map((item) => ({ id: item.id, name: item.name,
    applied: applied.has(item.id),
    checksumValid: !applied.has(item.id) || applied.get(item.id) === item.checksum }));
  const unknown = [...applied.keys()].filter((id) => !known.has(id)).map((id) => ({
    id, name: `未知 migration ${id}`, applied: true, checksumValid: false,
  }));
  return [...states, ...unknown];
}

export function assertMigrationsReady(db: SqliteDatabase): void {
  const invalid = migrationStatus(db).filter((item) => !item.applied || !item.checksumValid);
  if (invalid.length) {
    const names = invalid.map((item) => item.name).join(', ');
    throw new Error(`数据库 schema 未就绪：${names}。请先运行 npm run db:deploy。`);
  }
}

export function migrateDatabase(db: SqliteDatabase): MigrationState[] {
  ensureMigrationTable(db);
  const applied = appliedMigrations(db);
  const files = loadMigrationFiles();
  const known = new Set(files.map((item) => item.id));
  const unknown = [...applied.keys()].filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`数据库版本高于当前程序：未知 migration ${unknown.join(', ')}。`);
  for (const migration of files) {
    const knownChecksum = applied.get(migration.id);
    if (knownChecksum && knownChecksum !== migration.checksum) throw new Error(`Migration ${migration.name} 校验失败。`);
    if (!knownChecksum) applyMigration(db, migration);
  }
  return migrationStatus(db);
}