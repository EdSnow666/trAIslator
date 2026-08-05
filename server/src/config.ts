/**
 * 职责: 解析后端运行目录、数据库、Cookie 与发布配置
 * 依赖内部: 无
 * 依赖外部: node:path
 * 暴露: appConfig | AppConfig
 */

import { resolve } from 'node:path';

export interface AppConfig {
  rootDir: string;
  databasePath: string;
  backupDir: string;
  host: string;
  port: number;
  environment: 'development' | 'test' | 'production';
  releaseVersion: string;
  secureCookie: boolean;
}

function environmentName(): AppConfig['environment'] {
  const value = process.env.NODE_ENV;
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

function numericPort(value: string | undefined): number {
  const port = Number(value || 8765);
  return Number.isInteger(port) && port > 0 ? port : 8765;
}

function buildConfig(): AppConfig {
  const rootDir = resolve(process.env.APP_ROOT || process.cwd());
  const environment = environmentName();
  return {
    rootDir,
    databasePath: resolve(process.env.DATABASE_PATH || `${rootDir}/data/translation-aiducator.db`),
    backupDir: resolve(process.env.BACKUP_DIR || `${rootDir}/backups`),
    host: process.env.HOST || '127.0.0.1',
    port: numericPort(process.env.PORT),
    environment,
    releaseVersion: process.env.APP_RELEASE || '0.2.0',
    secureCookie: environment === 'production',
  };
}

export const appConfig = buildConfig();