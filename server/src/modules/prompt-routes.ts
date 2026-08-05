/**
 * 职责: 暴露 Prompt 私有版本、主动提交、工作空间选择和教师发布/取消发布 API
 * 依赖内部: ../auth/authorization.ts, ../context.ts, ./prompts.ts
 * 依赖外部: fastify
 * 暴露: registerPromptRoutes
 */

import type { FastifyInstance } from 'fastify';
import { requireReadyAccount, requireRoles } from '../auth/authorization.js';
import type { AppContext } from '../context.js';
import { createPromptVersion, listVisiblePrompts, publishPrompt, selectWorkspacePrompt, unpublishPrompt,
  submitPrompt, type PromptInput } from './prompts.js';

interface ProjectParams { projectId: string }
interface PromptParams { promptVersionId: string }
interface WorkspaceParams { workspaceId: string }
interface PublishBody { promptVersionId: string }
interface ActivePromptBody { promptVersionId: string; requestId?: string }

function registerPromptReadRoutes(app: FastifyInstance, context: AppContext): void {
  app.get<{ Params: ProjectParams }>('/api/projects/:projectId/prompts',
    { preHandler: requireReadyAccount }, async (request) => ({
      prompts: listVisiblePrompts(context, request.authUser!, request.params.projectId),
    }));
}

function registerPromptAuthorRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Params: ProjectParams; Body: PromptInput }>('/api/projects/:projectId/prompts',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send({
      id: createPromptVersion(context, request.authUser!, request.params.projectId, request.body),
    }));
  app.post<{ Params: PromptParams }>('/api/prompts/:promptVersionId/submit',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send({
      id: submitPrompt(context, request.authUser!, request.params.promptVersionId),
    }));
  app.post<{ Params: WorkspaceParams; Body: ActivePromptBody }>('/api/workspaces/:workspaceId/active-prompt',
    { preHandler: requireReadyAccount }, async (request) => {
      selectWorkspacePrompt(context, request.authUser!, request.params.workspaceId,
        request.body.promptVersionId, request.body.requestId);
      return { ok: true };
    });
}

function registerPromptPublishRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Params: ProjectParams; Body: PublishBody }>('/api/projects/:projectId/prompts/publish',
    { preHandler: requireRoles('admin', 'teacher') }, async (request, reply) => reply.code(201).send({
      id: publishPrompt(context, request.authUser!, request.params.projectId, request.body.promptVersionId),
    }));
  app.post<{ Params: ProjectParams; Body: PublishBody }>('/api/projects/:projectId/prompts/unpublish',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => {
      unpublishPrompt(context, request.authUser!, request.params.projectId, request.body.promptVersionId);
      return { ok: true };
    });
}

export function registerPromptRoutes(app: FastifyInstance, context: AppContext): void {
  registerPromptReadRoutes(app, context);
  registerPromptAuthorRoutes(app, context);
  registerPromptPublishRoutes(app, context);
}
