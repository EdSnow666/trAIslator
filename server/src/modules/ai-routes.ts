/**
 * 职责: 暴露服务器模型配置、AI 能力状态与真实翻译执行 API
 * 依赖内部: ../auth/authorization.ts, ../context.ts, ./ai-execution.ts, ./prompt-inspector.ts, ./server-models.ts
 * 依赖外部: fastify
 * 暴露: registerAiRoutes
 */

import type { FastifyInstance } from 'fastify';
import { requireReadyAccount, requireRoles } from '../auth/authorization.js';
import type { AppContext } from '../context.js';
import { cancelAiTranslation, executeAiTranslation, executeFullTranslation, testServerModelConnection,
  type AiExecutionInput, type FullTranslationInput } from './ai-execution.js';
import { ensureProjectView } from './access.js';
import { inspectPromptStructures } from './prompt-inspector.js';
import { disableServerModel, listServerModelDirectory, listServerModels, saveServerModel, serverModelCapability,
  type ServerModelInput } from './server-models.js';

interface ModelParams { modelConfigId: string }
interface WorkspaceParams { workspaceId: string }
interface CancelBody { requestId: string }
interface InspectQuery { projectId: string; workspaceId?: string; segmentId?: string }

function registerModelManagementRoutes(app: FastifyInstance, context: AppContext): void {
  app.get<{ Querystring: InspectQuery }>('/api/manage/prompt-structures',
    { preHandler: requireReadyAccount }, async (request) => {
      ensureProjectView(context, request.authUser!, request.query.projectId);
      return inspectPromptStructures(context, request.query);
    });
  app.get('/api/manage/server-models', { preHandler: requireRoles('admin', 'teacher') }, async () => ({
    models: listServerModels(context),
  }));
  app.post<{ Body: ServerModelInput }>('/api/manage/server-models',
    { preHandler: requireRoles('admin', 'teacher') }, async (request, reply) => reply.code(201).send({
      id: saveServerModel(context, request.authUser!, request.body),
    }));
  app.post<{ Params: ModelParams }>('/api/manage/server-models/:modelConfigId/test',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => (
      testServerModelConnection(context, request.authUser!, request.params.modelConfigId)
    ));
  app.delete<{ Params: ModelParams }>('/api/manage/server-models/:modelConfigId',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => {
      disableServerModel(context, request.authUser!, request.params.modelConfigId);
      return { ok: true };
    });
}

function registerAiExecutionRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/api/ai/server-model-directory', { preHandler: requireReadyAccount }, async () => ({
    models: listServerModelDirectory(context),
  }));
  app.get('/api/ai/capabilities', { preHandler: requireReadyAccount }, async () => ({
    serverModelAvailable: serverModelCapability(context),
  }));
  app.post<{ Params: WorkspaceParams; Body: AiExecutionInput }>('/api/workspaces/:workspaceId/ai/execute',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send(
      await executeAiTranslation(context, request.authUser!, request.params.workspaceId, request.body),
    ));
  app.post<{ Params: WorkspaceParams; Body: FullTranslationInput }>('/api/workspaces/:workspaceId/ai/execute-full',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send(
      await executeFullTranslation(context, request.authUser!, request.params.workspaceId, request.body),
    ));
  app.post<{ Params: WorkspaceParams; Body: CancelBody }>('/api/workspaces/:workspaceId/ai/cancel',
    { preHandler: requireReadyAccount }, async (request) => ({
      cancelled: cancelAiTranslation(context, request.authUser!, request.params.workspaceId,
        request.body.requestId),
    }));
}

export function registerAiRoutes(app: FastifyInstance, context: AppContext): void {
  registerModelManagementRoutes(app, context);
  registerAiExecutionRoutes(app, context);
}
