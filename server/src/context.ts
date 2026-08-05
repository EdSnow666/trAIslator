/**
 * 职责: 创建数据库、migration 与实例身份组成的后端运行上下文
 * 依赖内部: ./db/database.ts, ./db/instance.ts, ./db/migrations.ts
 * 依赖外部: 无
 * 暴露: createAppContext | AppContext
 */

import { openDatabase, type SqliteDatabase } from './db/database.js';
import { ensureAppInstance } from './db/instance.js';
import { assertMigrationsReady, migrateDatabase } from './db/migrations.js';

export interface AppContext {
  db: SqliteDatabase;
  instanceId: string;
}

export function createAppContext(databasePath?: string, autoMigrate = true): AppContext {
  const db = openDatabase(databasePath);
  try {
    if (autoMigrate) migrateDatabase(db);
    else assertMigrationsReady(db);
    return { db, instanceId: ensureAppInstance(db) };
  } catch (error) {
    db.close();
    throw error;
  }
}