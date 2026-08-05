/**
 * 职责: 提供不依赖网页登录 Token 的数据库和管理员运维命令
 * 依赖内部: ./context.ts, ./db, ./ops
 * 依赖外部: 无
 * 暴露: CLI 入口
 */

import { createAppContext } from './context.js';
import { appConfig } from './config.js';
import { createDatabaseBackup } from './db/backup.js';
import { openDatabase } from './db/database.js';
import { migrateDatabase, migrationStatus } from './db/migrations.js';
import { initializeAdmin, resetAdminPassword } from './ops/admin.js';
import { runMigrationDeployment } from './ops/deploy.js';
import { seedDemoTemplates } from './seed/demo-templates.js';

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function runContextCommand(command: string): Promise<unknown> {
  const context = createAppContext();
  try {
    if (command === 'admin:init') return await initializeAdmin(context,
      option('username', 'admin'), option('display-name', '系统管理员'));
    if (command === 'admin:reset-password') return await resetAdminPassword(context, option('username', 'admin'));
    if (command === 'db:backup') return { backupPath: await createDatabaseBackup(context.db) };
    if (command === 'db:seed-demo') return await seedDemoTemplates(context);
    return null;
  } finally {
    context.db.close();
  }
}

async function execute(command: string): Promise<unknown> {
  if (command === 'db:deploy') return runMigrationDeployment();
  if (['admin:init', 'admin:reset-password', 'db:backup', 'db:seed-demo'].includes(command)) return runContextCommand(command);
  const db = openDatabase();
  try {
    if (command === 'db:migrate') return migrateDatabase(db);
    if (command === 'db:status') return migrationStatus(db);
    throw new Error(`未知命令：${command}`);
  } finally {
    db.close();
  }
}

const command = process.argv[2] || 'db:status';

try {
  const result = await execute(command);
  process.stdout.write(`${JSON.stringify({ ok: true, database: appConfig.databasePath, result }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: String(error) }, null, 2)}\n`);
  process.exitCode = 1;
}