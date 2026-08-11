/**
 * 职责: 验证 Session 生命周期、迁移备份恢复及管理员凭据不被迁移覆盖
 * 依赖内部: ../src/app.ts, ../src/db/database.ts, ../src/ops/deploy.ts
 * 依赖外部: node:assert, node:fs
 * 暴露: verifySessionLifetime | expireSessionsAndReadAdminHash | exerciseMigrationSafety
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildServer } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrationDeployment } from '../src/ops/deploy.js';

export function verifySessionLifetime(databasePath: string): void {
  const db = openDatabase(databasePath);
  try {
    const rows = db.prepare(`SELECT created_at, expires_at FROM sessions
      WHERE revoked_at IS NULL`).all() as Array<{ created_at: string; expires_at: string }>;
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 24 * 60 * 60 * 1000);
    }
  } finally { db.close(); }
}

export function expireSessionsAndReadAdminHash(databasePath: string): string {
  const db = openDatabase(databasePath);
  try {
    const row = db.prepare(`SELECT password_hash AS hash FROM users
      WHERE username = 'root-admin'`).get() as { hash: string };
    db.prepare(`UPDATE sessions SET expires_at = ? WHERE revoked_at IS NULL`)
      .run(new Date(Date.now() - 60_000).toISOString());
    return row.hash;
  } finally { db.close(); }
}

function adminHash(databasePath: string): string {
  const db = openDatabase(databasePath);
  try {
    return (db.prepare("SELECT password_hash AS hash FROM users WHERE username = 'root-admin'")
      .get() as { hash: string }).hash;
  } finally { db.close(); }
}

export async function exerciseMigrationSafety(databasePath: string, backupDir: string,
  expectedPasswordHash: string): Promise<void> {
  const before = openDatabase(databasePath);
  const userCount = (before.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
  before.prepare(`INSERT INTO schema_migrations
    (id, name, checksum, release_version, applied_at) VALUES ('9999', 'future.sql', 'future', '9.9.9', ?)`)
    .run(new Date().toISOString());
  before.close();
  await assert.rejects(() => buildServer(databasePath, false), /数据库版本高于当前程序.*未知 migration 9999/);
  await assert.rejects(() => runMigrationDeployment(databasePath, backupDir),
    /数据库版本高于当前程序.*已从 .* 自动恢复/);
  const restored = openDatabase(databasePath);
  try {
    assert.ok(restored.prepare("SELECT id FROM schema_migrations WHERE id = '9999'").get());
    const restoredUsers = (restored.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
    assert.equal(restoredUsers, userCount);
    assert.equal(adminHash(databasePath), expectedPasswordHash);
    assert.deepEqual(restored.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
    restored.prepare("DELETE FROM schema_migrations WHERE id = '9999'").run();
  } finally { restored.close(); }
}
