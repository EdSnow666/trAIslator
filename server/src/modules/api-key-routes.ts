/**
 * 职责: 暴露当前用户个人模型 Key 的元数据、加密保存和禁用 API
 * 依赖内部: ../auth/authorization.ts, ../context.ts, ./api-keys.ts
 * 依赖外部: fastify
 * 暴露: registerApiKeyRoutes
 */

import type { FastifyInstance } from 'fastify';
import { requireReadyAccount } from '../auth/authorization.js';
import type { AppContext } from '../context.js';
import { disablePersonalKey, listPersonalKeys, savePersonalKey } from './api-keys.js';

interface KeyBody { provider: string; label: string; apiKey: string }
interface KeyParams { keyId: string }

export function registerApiKeyRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/api/me/api-keys', { preHandler: requireReadyAccount },
    async (request) => ({ keys: listPersonalKeys(context, request.authUser!) }));
  app.post<{ Body: KeyBody }>('/api/me/api-keys', { preHandler: requireReadyAccount },
    async (request, reply) => {
      const id = savePersonalKey(context, request.authUser!, request.body);
      return reply.code(201).send({ id });
    });
  app.delete<{ Params: KeyParams }>('/api/me/api-keys/:keyId', { preHandler: requireReadyAccount },
    async (request) => {
      disablePersonalKey(context, request.authUser!, request.params.keyId);
      return { ok: true };
    });
}
