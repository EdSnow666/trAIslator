/**
 * 职责: 暴露译文生成、人工保存、参考译文、当前版本和 AI 决策 API
 * 依赖内部: ../auth/authorization.ts, ../context.ts, ./translations.ts
 * 依赖外部: fastify
 * 暴露: registerTranslationRoutes
 */

import type { FastifyInstance } from 'fastify';
import { requireReadyAccount, requireRoles } from '../auth/authorization.js';
import type { AppContext } from '../context.js';
import { addReferenceTranslation, recordGeneratedTranslation, saveAiDecision, saveHumanPostEdit,
  confirmWorkspaceTranslations, selectCurrentVersion, submitWorkspaceTranslations,
  workspaceTranslations, type GeneratedTranslationInput } from './translations.js';

interface WorkspaceParams { workspaceId: string }
interface ProjectParams { projectId: string }
interface PostEditBody {
  segmentId: string; content: string; parentVersionId?: string; baseVersionId?: string;
  promptVersionId?: string; requestId: string;
}
interface ReferenceBody { segmentId: string; content: string }
interface CurrentBody { segmentId: string; translationVersionId: string; requestId?: string }
interface DecisionBody { aiVersionId: string; changeId: string; decision: 'accepted' | 'rejected'; requestId?: string }
interface BatchStateBody { segmentIds?: string[] }

function registerTranslationReadRoutes(app: FastifyInstance, context: AppContext): void {
  app.get<{ Params: WorkspaceParams }>('/api/workspaces/:workspaceId/translations',
    { preHandler: requireReadyAccount }, async (request) => ({
      translations: workspaceTranslations(context, request.authUser!, request.params.workspaceId),
    }));
}

function registerTranslationCreateRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Params: WorkspaceParams; Body: PostEditBody }>('/api/workspaces/:workspaceId/post-edits',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send({
      id: saveHumanPostEdit(context, request.authUser!, request.params.workspaceId, request.body),
    }));
  app.post<{ Params: WorkspaceParams; Body: GeneratedTranslationInput }>(
    '/api/workspaces/:workspaceId/generated-translations',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send({
      id: recordGeneratedTranslation(context, request.authUser!, request.params.workspaceId, request.body),
    }));
  app.post<{ Params: ProjectParams; Body: ReferenceBody }>('/api/projects/:projectId/reference-translations',
    { preHandler: requireRoles('admin', 'teacher') }, async (request, reply) => reply.code(201).send({
      id: addReferenceTranslation(context, request.authUser!, request.params.projectId, request.body),
    }));
}

function registerTranslationStateRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Params: WorkspaceParams; Body: CurrentBody }>('/api/workspaces/:workspaceId/current-version',
    { preHandler: requireReadyAccount }, async (request) => {
      selectCurrentVersion(context, request.authUser!, request.params.workspaceId, request.body.segmentId,
        request.body.translationVersionId, request.body.requestId);
      return { ok: true };
    });
  app.post<{ Params: WorkspaceParams; Body: DecisionBody }>('/api/workspaces/:workspaceId/ai-decisions',
    { preHandler: requireReadyAccount }, async (request) => {
      saveAiDecision(context, request.authUser!, request.params.workspaceId, request.body.aiVersionId,
        request.body.changeId, request.body.decision, request.body.requestId);
      return { ok: true };
    });
  app.post<{ Params: WorkspaceParams; Body: BatchStateBody }>('/api/workspaces/:workspaceId/translations/confirm',
    { preHandler: requireReadyAccount }, async (request) => ({
      count: confirmWorkspaceTranslations(context, request.authUser!, request.params.workspaceId, request.body?.segmentIds),
    }));
  app.post<{ Params: WorkspaceParams; Body: BatchStateBody }>('/api/workspaces/:workspaceId/translations/submit',
    { preHandler: requireReadyAccount }, async (request) => ({
      count: submitWorkspaceTranslations(context, request.authUser!, request.params.workspaceId, request.body?.segmentIds),
    }));
}

export function registerTranslationRoutes(app: FastifyInstance, context: AppContext): void {
  registerTranslationReadRoutes(app, context);
  registerTranslationCreateRoutes(app, context);
  registerTranslationStateRoutes(app, context);
}
