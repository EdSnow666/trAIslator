/**
 * 职责: 为本地或云端数据库建立稳定的运行实例身份
 * 依赖内部: ../config.ts, ../shared.ts, ./database.ts
 * 依赖外部: 无
 * 暴露: ensureAppInstance
 */

import { hostname } from 'node:os';
import { appConfig } from '../config.js';
import { newId, nowIso } from '../shared.js';
import type { SqliteDatabase } from './database.js';

interface InstanceRow {
  id: string;
}

export function ensureAppInstance(db: SqliteDatabase): string {
  const existing = db.prepare('SELECT id FROM app_instances WHERE environment = ? ORDER BY created_at LIMIT 1')
    .get(appConfig.environment) as InstanceRow | undefined;
  if (existing) return existing.id;
  const id = newId();
  db.prepare('INSERT INTO app_instances (id, environment, name, created_at) VALUES (?, ?, ?, ?)')
    .run(id, appConfig.environment, `${hostname()}-${appConfig.environment}`, nowIso());
  return id;
}