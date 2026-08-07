/**
 * 职责: 加密保存统一服务器模型配置，并为 AI 调用解析默认配置
 * 依赖内部: ../auth/types.ts, ../config.ts, ../context.ts, ../errors.ts, ../shared.ts, ./activity.ts
 * 依赖外部: node:crypto, node:fs, node:path
 * 暴露: listServerModels | listServerModelDirectory | saveServerModel | disableServerModel | resolveServerModel | serverModelCapability
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { AuthUser } from '../auth/types.js';
import { appConfig } from '../config.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { newId, nowIso } from '../shared.js';
import { recordActivity } from './activity.js';

interface SealedKeyRow { ciphertext: string; iv: string; auth_tag: string }
export interface ServerModelInput {
  id?: string; name: string; provider: 'openai_compatible'; baseUrl: string; model: string;
  apiKey?: string; isDefault?: boolean; requestTimeoutMs?: number; maxRetries?: number;
}
export interface ResolvedServerModel {
  id: string; name: string; provider: string; baseUrl: string; model: string; apiKey: string;
  requestTimeoutMs: number; maxRetries: number;
}

function decodeMasterKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new AppError(500, 'SERVER_MODEL_KEY_INVALID', '服务器模型主密钥必须为 32 字节 Base64。');
  return key;
}

function localMasterKey(): Buffer {
  const path = resolve(appConfig.rootDir, 'data', 'server-model-master.key');
  try { return decodeMasterKey(readFileSync(path, 'utf8').trim()); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  mkdirSync(dirname(path), { recursive: true });
  const encoded = randomBytes(32).toString('base64');
  try { writeFileSync(path, encoded, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return decodeMasterKey(readFileSync(path, 'utf8').trim());
  }
  return decodeMasterKey(encoded);
}

function masterKey(): Buffer {
  const encoded = process.env.SERVER_MODEL_MASTER_KEY || process.env.PERSONAL_KEY_MASTER_KEY;
  if (encoded) return decodeMasterKey(encoded);
  if (appConfig.environment !== 'production') return localMasterKey();
  throw new AppError(503, 'SERVER_MODELS_DISABLED', '生产服务器尚未配置模型主密钥。');
}

function encrypt(value: string): SealedKeyRow {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64') };
}

function decrypt(row: SealedKeyRow): string {
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(row.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(row.auth_tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

function normalizedBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new AppError(400, 'INVALID_MODEL_URL', '模型 Base URL 无效。'); }
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new AppError(400, 'INSECURE_MODEL_URL', '模型地址必须使用 HTTPS；本机 localhost 可使用 HTTP。');
  }
  return url.toString().replace(/\/$/, '');
}

function validateInput(input: ServerModelInput): void {
  if (!input.name?.trim() || !input.model?.trim()) {
    throw new AppError(400, 'MODEL_FIELDS_REQUIRED', '配置名称和模型名称不能为空。');
  }
  if (input.provider !== 'openai_compatible') throw new AppError(400, 'MODEL_PROVIDER_UNSUPPORTED', '暂只支持 OpenAI-compatible 接口。');
  const timeout = input.requestTimeoutMs ?? 60000;
  const retries = input.maxRetries ?? 1;
  if (!Number.isInteger(timeout) || timeout < 5000 || timeout > 300000) {
    throw new AppError(400, 'MODEL_TIMEOUT_INVALID', '超时时间必须介于 5 至 300 秒。');
  }
  if (!Number.isInteger(retries) || retries < 0 || retries > 5) {
    throw new AppError(400, 'MODEL_RETRIES_INVALID', '重试次数必须介于 0 至 5 次。');
  }
}

function existingKey(context: AppContext, id?: string): SealedKeyRow | undefined {
  if (!id) return undefined;
  return context.db.prepare('SELECT ciphertext, iv, auth_tag FROM server_model_configs WHERE id = ?')
    .get(id) as SealedKeyRow | undefined;
}

function shouldBeDefault(context: AppContext, input: ServerModelInput): boolean {
  if (input.isDefault) return true;
  const row = context.db.prepare(`SELECT 1 FROM server_model_configs
    WHERE status = 'active' AND is_default = 1 AND id <> ?`).get(input.id || '');
  return !row;
}

function writeModel(context: AppContext, user: AuthUser, input: ServerModelInput,
  sealed: SealedKeyRow, id: string, isDefault: boolean): void {
  const time = nowIso();
  context.db.prepare(`INSERT INTO server_model_configs (id, name, provider, base_url, model,
    ciphertext, iv, auth_tag, status, is_default, request_timeout_ms, max_retries,
    created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, provider = excluded.provider,
      base_url = excluded.base_url, model = excluded.model, ciphertext = excluded.ciphertext,
      iv = excluded.iv, auth_tag = excluded.auth_tag, status = 'active', is_default = excluded.is_default,
      request_timeout_ms = excluded.request_timeout_ms, max_retries = excluded.max_retries,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .run(id, input.name.trim(), input.provider, normalizedBaseUrl(input.baseUrl), input.model.trim(),
      sealed.ciphertext, sealed.iv, sealed.auth_tag, isDefault ? 1 : 0,
      input.requestTimeoutMs ?? 60000, input.maxRetries ?? 1, user.id, user.id, time, time);
}

export function listServerModels(context: AppContext): unknown[] {
  return context.db.prepare(`SELECT smc.id, smc.name, smc.provider, smc.base_url AS baseUrl,
      smc.model, smc.status, smc.is_default AS isDefault,
      smc.request_timeout_ms AS requestTimeoutMs, smc.max_retries AS maxRetries,
      smc.last_used_at AS lastUsedAt, smc.created_at AS createdAt, smc.updated_at AS updatedAt,
      u.display_name AS updatedBy, 1 AS hasApiKey
    FROM server_model_configs smc LEFT JOIN users u ON u.id = smc.updated_by
    ORDER BY smc.is_default DESC, smc.updated_at DESC`).all();
}

export function listServerModelDirectory(context: AppContext): unknown[] {
  return context.db.prepare(`SELECT id, name, provider, model, is_default AS isDefault,
      updated_at AS updatedAt FROM server_model_configs
    WHERE status = 'active' ORDER BY is_default DESC, updated_at DESC`).all();
}

export function saveServerModel(context: AppContext, user: AuthUser, input: ServerModelInput): string {
  validateInput(input);
  const id = input.id || newId();
  const previous = existingKey(context, input.id);
  if (!input.apiKey?.trim() && !previous) throw new AppError(400, 'MODEL_API_KEY_REQUIRED', '新配置必须提供 API Key。');
  const sealed = input.apiKey?.trim() ? encrypt(input.apiKey.trim()) : previous!;
  const isDefault = shouldBeDefault(context, input);
  context.db.transaction(() => {
    if (isDefault) context.db.prepare('UPDATE server_model_configs SET is_default = 0').run();
    writeModel(context, user, input, sealed, id, isDefault);
    recordActivity(context, { eventType: 'model.server_config_saved', actorUserId: user.id,
      metadata: { modelConfigId: id, provider: input.provider, model: input.model.trim(), isDefault } });
  }).immediate();
  return id;
}

function promoteReplacement(context: AppContext): void {
  const replacement = context.db.prepare(`SELECT id FROM server_model_configs
    WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1`).get() as { id: string } | undefined;
  if (replacement) context.db.prepare('UPDATE server_model_configs SET is_default = 1 WHERE id = ?').run(replacement.id);
}

export function disableServerModel(context: AppContext, user: AuthUser, id: string): void {
  const row = context.db.prepare('SELECT is_default FROM server_model_configs WHERE id = ? AND status = ?')
    .get(id, 'active') as { is_default: number } | undefined;
  if (!row) throw new AppError(404, 'SERVER_MODEL_NOT_FOUND', '服务器模型配置不存在。');
  context.db.transaction(() => {
    context.db.prepare(`UPDATE server_model_configs SET status = 'disabled', is_default = 0,
      updated_by = ?, updated_at = ? WHERE id = ?`).run(user.id, nowIso(), id);
    if (row.is_default) promoteReplacement(context);
    recordActivity(context, { eventType: 'model.server_config_disabled', actorUserId: user.id,
      metadata: { modelConfigId: id } });
  }).immediate();
}

export function resolveServerModel(context: AppContext, id?: string): ResolvedServerModel {
  const row = context.db.prepare(`SELECT id, name, provider, base_url AS baseUrl, model,
      ciphertext, iv, auth_tag, request_timeout_ms AS requestTimeoutMs, max_retries AS maxRetries
    FROM server_model_configs WHERE status = 'active' AND (? IS NULL OR id = ?)
    ORDER BY is_default DESC, updated_at DESC LIMIT 1`).get(id || null, id || null) as
    (ResolvedServerModel & SealedKeyRow) | undefined;
  if (!row) throw new AppError(503, 'SERVER_MODEL_UNAVAILABLE', '当前没有可用的服务器模型配置。');
  context.db.prepare('UPDATE server_model_configs SET last_used_at = ? WHERE id = ?').run(nowIso(), row.id);
  return { id: row.id, name: row.name, provider: row.provider, baseUrl: row.baseUrl,
    model: row.model, apiKey: decrypt(row), requestTimeoutMs: row.requestTimeoutMs,
    maxRetries: row.maxRetries };
}

export function serverModelCapability(context: AppContext): boolean {
  return Boolean(context.db.prepare(`SELECT 1 FROM server_model_configs
    WHERE status = 'active' AND is_default = 1`).get());
}
