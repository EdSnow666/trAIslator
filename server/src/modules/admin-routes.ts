/**
 * 职责: 提供管理员跨用户查询、账号创建和密码重置 API
 * 依赖内部: ../auth/authorization.ts, ../context.ts, ./activity.ts, ./users.ts
 * 依赖外部: fastify
 * 暴露: registerAdminRoutes
 */

import type { FastifyInstance } from 'fastify';
import { requireRoles } from '../auth/authorization.js';
import type { RoleCode } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { recordActivity } from './activity.js';
import { createUser, listUsers, resetPassword } from './users.js';

interface CreateUserBody { username: string; displayName: string; roles: RoleCode[] }
interface UserParams { userId: string }

export function registerAdminRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/api/admin/users', { preHandler: requireRoles('admin') }, async () => ({ users: listUsers(context) }));
  app.post<{ Body: CreateUserBody }>('/api/admin/users', { preHandler: requireRoles('admin') }, async (request, reply) => {
    const result = await createUser(context, { ...request.body, assignedBy: request.authUser!.id });
    recordActivity(context, { eventType: 'account.created', actorUserId: request.authUser!.id,
      actorSessionId: request.authSessionId, metadata: { createdUserId: result.id, roles: request.body.roles } });
    return reply.code(201).send(result);
  });
  app.post<{ Params: UserParams }>('/api/admin/users/:userId/reset-password',
    { preHandler: requireRoles('admin') }, async (request) => {
      const password = await resetPassword(context, request.params.userId);
      recordActivity(context, { eventType: 'account.password_reset', actorUserId: request.authUser!.id,
        actorSessionId: request.authSessionId, metadata: { targetUserId: request.params.userId } });
      return { password, mustChangePassword: true };
    });
}