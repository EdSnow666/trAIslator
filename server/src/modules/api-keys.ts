/**
 * 职责: 使用服务器主密钥加密个人模型 Key，并限定为当前用户读写
 * 依赖内部: ../auth/types.ts, ../config.ts, ../context.ts, ../errors.ts, ../shared.ts, ./activity.ts
 * 依赖外部: node:crypto, node:fs, node:path
 * 暴露: listPersonalKeys | savePersonalKey | disablePersonalKey | resolvePersonalKey
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuthUser } from '../auth/types.js';
import { appConfig } from '../config.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { newId, nowIso } from '../shared.js';
import { recordActivity } from './activity.js';

interface KeyRow {
  id: string; ciphertext: string; iv: string; auth_tag: string; key_version: number;
}
interface PersonalKeyInput { provider: string; label: string; apiKey: string }

function decodeMasterKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new AppError(500, 'PERSONAL_KEY_CONFIG_INVALID', '个人 API Key 主密钥配置无效。');
  return key;
}

function masterKey(): Buffer {
  const encoded = process.env.PERSONAL_KEY_MASTER_KEY || process.env.SERVER_MODEL_MASTER_KEY;
  if (encoded) return decodeMasterKey(encoded);
  if (appConfig.environment !== 'production') {
    const path = resolve(appConfig.rootDir, 'data', 'server-model-master.key');
    try { return decodeMasterKey(readFileSync(path, 'utf8').trim()); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      throw new AppError(503, 'PERSONAL_KEYS_DISABLED', '请先保存一次服务器模型配置以初始化本机主密钥。');
    }
  }
  throw new AppError(503, 'PERSONAL_KEYS_DISABLED', '生产服务器尚未配置个人 API Key 主密钥。');
}

function encrypt(value: string): { ciphertext: string; iv: string; authTag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64') };
}

function decrypt(row: KeyRow): string {
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(row.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(row.auth_tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

export function listPersonalKeys(context: AppContext, user: AuthUser): unknown[] {
  return context.db.prepare(`SELECT id, provider, label, status, last_used_at AS lastUsedAt,
    created_at AS createdAt, updated_at AS updatedAt FROM user_api_keys
    WHERE user_id = ? ORDER BY provider, label`).all(user.id);
}

export function savePersonalKey(context: AppContext, user: AuthUser, input: PersonalKeyInput): string {
  if (!input.provider.trim() || !input.label.trim() || !input.apiKey.trim()) {
    throw new AppError(400, 'INVALID_API_KEY', '服务商、名称和 API Key 均不能为空。');
  }
  const id = newId();
  const sealed = encrypt(input.apiKey.trim());
  const time = nowIso();
  context.db.prepare(`INSERT INTO user_api_keys (id, user_id, provider, label, ciphertext,
    iv, auth_tag, key_version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)
    ON CONFLICT(user_id, provider, label) DO UPDATE SET ciphertext = excluded.ciphertext,
      iv = excluded.iv, auth_tag = excluded.auth_tag, key_version = excluded.key_version,
      status = 'active', updated_at = excluded.updated_at`)
    .run(id, user.id, input.provider.trim(), input.label.trim(), sealed.ciphertext,
      sealed.iv, sealed.authTag, time, time);
  recordActivity(context, { eventType: 'account.personal_api_key_saved', actorUserId: user.id,
    metadata: { provider: input.provider.trim(), label: input.label.trim() } });
  const row = context.db.prepare(`SELECT id FROM user_api_keys
    WHERE user_id = ? AND provider = ? AND label = ?`)
    .get(user.id, input.provider.trim(), input.label.trim()) as { id: string };
  return row.id;
}

export function disablePersonalKey(context: AppContext, user: AuthUser, id: string): void {
  const result = context.db.prepare(`UPDATE user_api_keys SET status = 'disabled', updated_at = ?
    WHERE id = ? AND user_id = ?`).run(nowIso(), id, user.id);
  if (!result.changes) throw new AppError(404, 'API_KEY_NOT_FOUND', '个人 API Key 不存在。');
  recordActivity(context, { eventType: 'account.personal_api_key_disabled', actorUserId: user.id,
    metadata: { apiKeyId: id } });
}

export function resolvePersonalKey(context: AppContext, userId: string,
  provider: string, label: string): string | null {
  const row = context.db.prepare(`SELECT id, ciphertext, iv, auth_tag, key_version FROM user_api_keys
    WHERE user_id = ? AND provider = ? AND label = ? AND status = 'active'`)
    .get(userId, provider, label) as KeyRow | undefined;
  if (!row) return null;
  context.db.prepare('UPDATE user_api_keys SET last_used_at = ? WHERE id = ?').run(nowIso(), row.id);
  return decrypt(row);
}
