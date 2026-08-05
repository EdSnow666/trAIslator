/**
 * 职责: 从 Cookie 恢复认证身份并提供统一角色授权钩子
 * 依赖内部: ../context.ts, ./repository.ts, ./types.ts
 * 依赖外部: fastify
 * 暴露: SESSION_COOKIE | attachSession | requireAuth | requireReadyAccount | requireRoles | hasRole
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import { resolveSession } from './repository.js';
import type { AuthUser, RoleCode } from './types.js';

export const SESSION_COOKIE = 'ta_session';

export function hasRole(user: AuthUser, roles: RoleCode[]): boolean {
  return user.roles.some((role) => roles.includes(role));
}

export async function attachSession(context: AppContext, request: FastifyRequest): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return;
  const identity = resolveSession(context, token);
  request.authUser = identity?.user || null;
  request.authSessionId = identity?.sessionId || null;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.authUser) return;
  await reply.code(401).send({ error: 'AUTH_REQUIRED', message: '请先登录。' });
}

export async function requireReadyAccount(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser) return requireAuth(request, reply);
  if (!request.authUser.mustChangePassword) return;
  await reply.code(403).send({ error: 'PASSWORD_CHANGE_REQUIRED', message: '首次登录必须修改随机初始密码。' });
}

export function requireRoles(...roles: RoleCode[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.authUser) return requireAuth(request, reply);
    if (request.authUser.mustChangePassword) return requireReadyAccount(request, reply);
    if (hasRole(request.authUser, roles)) return;
    await reply.code(403).send({ error: 'FORBIDDEN', message: '当前账号没有此操作权限。' });
  };
}