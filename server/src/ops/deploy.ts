/**
 * 职责: 在无用户 Token 的服务器运维平面完成备份、migration、校验与失败恢复
 * 依赖内部: ../config.ts, ../db/backup.ts, ../db/database.ts, ../db/instance.ts, ../db/migrations.ts, ../modules/translation-diffs.ts, ../shared.ts
 * 依赖外部: 无
 * 暴露: runMigrationDeployment
 */

import { appConfig } from '../config.js';
import { createDatabaseBackup, restoreDatabaseBackup } from '../db/backup.js';
import { openDatabase } from '../db/database.js';
import { ensureAppInstance } from '../db/instance.js';
import { migrateDatabase, migrationStatus } from '../db/migrations.js';
import { backfillVersionDiffArtifacts } from '../modules/translation-diffs.js';
import { newId, nowIso } from '../shared.js';

function schemaLabel(states: ReturnType<typeof migrationStatus>): string {
  return states.filter((item) => item.applied).map((item) => item.id).join(',') || 'empty';
}

function verifyDatabase(db: ReturnType<typeof openDatabase>): void {
  const integrity = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  const foreignKeys = db.pragma('foreign_key_check') as unknown[];
  if (integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite integrity_check 失败。');
  if (foreignKeys.length) throw new Error(`SQLite foreign_key_check 发现 ${foreignKeys.length} 个问题。`);
}

function recordRun(db: ReturnType<typeof openDatabase>, id: string, before: string,
  after: string, backupId: string | null, status: string, error?: string): void {
  db.prepare(`INSERT INTO deployment_runs (id, release_version, runner_identity, status,
    schema_before, schema_after, backup_record_id, started_at, completed_at, error_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, appConfig.releaseVersion, 'server-cli', status, before, after, backupId,
      nowIso(), nowIso(), error || null);
}

function latestBackupId(db: ReturnType<typeof openDatabase>): string | null {
  const row = db.prepare('SELECT id FROM backup_records ORDER BY created_at DESC LIMIT 1').get() as { id: string } | undefined;
  return row?.id || null;
}

function restoredFailure(error: unknown, backupPath: string, restoreError?: unknown): Error {
  const cause = error instanceof Error ? error.message : String(error);
  const suffix = restoreError ? `；自动恢复也失败：${String(restoreError)}` : `；已从 ${backupPath} 自动恢复`;
  return new Error(`数据库迁移失败：${cause}${suffix}`);
}

export async function runMigrationDeployment(databasePath?: string,
  backupDir?: string): Promise<{ backupPath: string; schema: string }> {
  const targetPath = databasePath || appConfig.databasePath;
  const db = openDatabase(targetPath);
  const runId = newId();
  let backupPath = '';
  let closed = false;
  try {
    const before = schemaLabel(migrationStatus(db));
    backupPath = await createDatabaseBackup(db, backupDir);
    const after = schemaLabel(migrateDatabase(db));
    backfillVersionDiffArtifacts({ db, instanceId: ensureAppInstance(db) });
    verifyDatabase(db);
    recordRun(db, runId, before, after, latestBackupId(db), 'succeeded');
    return { backupPath, schema: after };
  } catch (error) {
    db.close();
    closed = true;
    if (!backupPath) throw error;
    try { restoreDatabaseBackup(targetPath, backupPath); }
    catch (restoreError) { throw restoredFailure(error, backupPath, restoreError); }
    throw restoredFailure(error, backupPath);
  } finally {
    if (!closed) db.close();
  }
}
