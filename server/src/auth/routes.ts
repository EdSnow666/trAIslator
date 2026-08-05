/**
 * 职责: 提供登录、当前身份、退出和首次密码修改 API
 * 依赖内部: ../config.ts, ../context.ts, ../modules/activity.ts, ./authorization.ts, ./password.ts, ./repository.ts
 * 依赖外部: fastify
 * 暴露: registerAuthRoutes
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { appConfig } from '../config.js';
import type { AppContext } from '../context.js';
import { recordActivity } from '../modules/activity.js';
import { hashPassword, verifyPassword } from './password.js';
import { SESSION_COOKIE, requireAuth } from './authorization.js';
import { createSession, findCredential, recordLoginAttempt, revokeSession } from './repository.js';
import { nowIso } from '../shared.js';

interface LoginBody { username: string; password: string }
interface PasswordBody { currentPassword: string; newPassword: string }

function cookieOptions() {
  return { path: '/', httpOnly: true, secure: appConfig.secureCookie, sameSite: 'lax' as const, maxAge: 86400 };
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

async function login(context: AppContext, body: LoginBody, reply: FastifyReply, userAgent?: string): Promise<void> {
  const credential = findCredential(context, body.username);
  const valid = credential && await verifyPassword(credential.password_hash, body.password);
  recordLoginAttempt(context, body.username, Boolean(valid), credential?.id, valid ? undefined : 'invalid_credentials');
  if (!credential || !valid) {
    await reply.code(401).send({ error: 'INVALID_CREDENTIALS', message: '用户名或密码错误。' });
    return;
  }
  const session = createSession(context, credential, userAgent);
  recordActivity(context, { eventType: 'auth.login_succeeded', actorUserId: credential.id,
    actorSessionId: session.identity.sessionId });
  reply.setCookie(SESSION_COOKIE, session.token, cookieOptions()).send({ user: session.identity.user });
}

async function changePassword(context: AppContext, request: Parameters<typeof requireAuth>[0], body: PasswordBody, reply: FastifyReply): Promise<void> {
  const user = request.authUser!;
  const credential = findCredential(context, user.username);
  if (!credential || !await verifyPassword(credential.password_hash, body.currentPassword)) {
    await reply.code(400).send({ error: 'INVALID_CURRENT_PASSWORD', message: '当前密码不正确。' });
    return;
  }
  if (body.newPassword.length < 12) {
    await reply.code(400).send({ error: 'WEAK_PASSWORD', message: '新密码至少需要 12 个字符。' });
    return;
  }
  const passwordHash = await hashPassword(body.newPassword);
  const time = nowIso();
  context.db.transaction(() => {
    context.db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0,
      password_changed_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?`)
      .run(passwordHash, time, time, user.id);
    context.db.prepare(`UPDATE sessions SET revoked_at = ?, revoke_reason = 'password_changed'
      WHERE user_id = ? AND revoked_at IS NULL`).run(time, user.id);
  }).immediate();
  recordActivity(context, { eventType: 'auth.password_changed', actorUserId: user.id, actorSessionId: request.authSessionId });
  clearSessionCookie(reply);
  reply.send({ ok: true, reloginRequired: true });
}

export function registerAuthRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Body: LoginBody }>('/api/auth/login', async (request, reply) => {
    await login(context, request.body, reply, request.headers['user-agent']);
  });
  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => ({ user: request.authUser }));
  app.post('/api/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    revokeSession(context, request.authSessionId!, 'user_logout');
    recordActivity(context, { eventType: 'auth.logout', actorUserId: request.authUser!.id,
      actorSessionId: request.authSessionId });
    clearSessionCookie(reply);
    return { ok: true };
  });
  app.post<{ Body: PasswordBody }>('/api/auth/change-password', { preHandler: requireAuth }, async (request, reply) => {
    await changePassword(context, request, request.body, reply);
  });
}