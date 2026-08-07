/**
 * 职责: 暴露项目术语、翻译记忆和参考译文的交错段落导入 API
 * 依赖内部: ../auth/authorization.ts, ../context.ts, ./resource-imports.ts
 * 依赖外部: fastify
 * 暴露: registerResourceImportRoutes
 */

import type { FastifyInstance } from 'fastify';
import { requireReadyAccount } from '../auth/authorization.js';
import type { AppContext } from '../context.js';
import { importProjectPairs, type ResourceImportKind, type ResourcePair } from './resource-imports.js';

interface Params { projectId: string; kind: ResourceImportKind }
interface Body { pairs: ResourcePair[] }

export function registerResourceImportRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Params: Params; Body: Body }>('/api/projects/:projectId/resources/:kind/import',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send({
      count: importProjectPairs(context, request.authUser!, request.params.projectId,
        request.params.kind, request.body.pairs || []),
    }));
}
