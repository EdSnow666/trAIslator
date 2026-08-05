/**
 * 职责: 查询用户凭据、角色并持久化 24 小时 Session
 * 依赖内部: ../context.ts, ../shared.ts, ./types.ts
 * 依赖外部: node:crypto
 * 暴露: findCredential | createSession | resolveSession | revokeSession | recordLoginAttempt
 */

import { randomBytes } from 'node:crypto';
import type { AppContext } from '../context.js';
import { newId, nowIso, sha256 } from '../shared.js';
import type { AuthUser, RoleCode, SessionIdentity } from './types.js';

interface CredentialRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  must_change_password: number;
}

export function normalizeUsername(username: string): string {
  return username.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export function findCredential(context: AppContext, username: string): CredentialRow | undefined {
  return context.db.prepare(`SELECT id, username, display_name, password_hash, must_change_password
    FROM users WHERE username_normalized = ? AND status = 'active' AND deleted_at IS NULL`)
    .get(normalizeUsername(username)) as CredentialRow | undefined;
}

function rolesForUser(context: AppContext, userId: string): RoleCode[] {
  const rows = context.db.prepare('SELECT role_code FROM user_roles WHERE user_id = ? ORDER BY role_code')
    .all(userId) as Array<{ role_code: RoleCode }>;
  return rows.map((row) => row.role_code);
}

function authUser(context: AppContext, row: CredentialRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    mustChangePassword: Boolean(row.must_change_password),
    roles: rolesForUser(context, row.id),
  };
}

export function createSession(context: AppContext, row: CredentialRow, userAgent?: string, ipHash?: string): { token: string; identity: SessionIdentity } {
  const id = newId();
  const token = randomBytes(32).toString('base64url');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  context.db.prepare(`INSERT INTO sessions
    (id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, row.id, sha256(token), expiresAt, createdAt, createdAt, userAgent || null, ipHash || null);
  return { token, identity: { sessionId: id, user: authUser(context, row) } };
}

export function resolveSession(context: AppContext, token: string): SessionIdentity | null {
  const row = context.db.prepare(`SELECT u.id, u.username, u.display_name, u.password_hash,
      u.must_change_password, s.id AS session_id
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
      AND u.status = 'active' AND u.deleted_at IS NULL`)
    .get(sha256(token), nowIso()) as (CredentialRow & { session_id: string }) | undefined;
  if (!row) return null;
  context.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), row.session_id);
  return { sessionId: row.session_id, user: authUser(context, row) };
}

export function revokeSession(context: AppContext, sessionId: string, reason: string): void {
  context.db.prepare('UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE id = ? AND revoked_at IS NULL')
    .run(nowIso(), reason, sessionId);
}

export function recordLoginAttempt(context: AppContext, username: string, succeeded: boolean, userId?: string, reason?: string): void {
  context.db.prepare(`INSERT INTO login_attempts
    (id, user_id, username_normalized, succeeded, failure_reason, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(newId(), userId || null, normalizeUsername(username), succeeded ? 1 : 0, reason || null, nowIso());
}