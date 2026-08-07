/**
 * 职责: 暴露可选择输出语言且可取消的项目任务书与全文 Prompt 生成 API
 * 依赖内部: ../auth/authorization.ts, ../context.ts, ./ai-execution.ts, ./project-resources.ts
 * 依赖外部: fastify
 * 暴露: registerProjectGenerationRoutes
 */

import type { FastifyInstance } from 'fastify';
import { requireReadyAccount } from '../auth/authorization.js';
import type { AppContext } from '../context.js';
import { cancelProjectTextGeneration } from './ai-execution.js';
import { generateProjectBrief, generateProjectPrompt } from './project-resources.js';
import type { GenerationLanguage } from './prompt-structures.js';

interface ProjectParams { projectId: string }
interface GenerateBody { modelConfigId?: string; language?: GenerationLanguage; requestId?: string }
interface CancelBody { requestId: string }

function options(body?: GenerateBody) {
  return { modelConfigId: body?.modelConfigId, outputLanguage: body?.language, requestId: body?.requestId };
}

export function registerProjectGenerationRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Params: ProjectParams; Body: GenerateBody }>('/api/projects/:projectId/brief/generate',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send({
      id: await generateProjectBrief(context, request.authUser!, request.params.projectId, options(request.body)),
    }));
  app.post<{ Params: ProjectParams; Body: GenerateBody }>('/api/projects/:projectId/prompt/generate',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send({
      id: await generateProjectPrompt(context, request.authUser!, request.params.projectId, options(request.body)),
    }));
  app.post<{ Params: ProjectParams; Body: CancelBody }>('/api/projects/:projectId/generation/cancel',
    { preHandler: requireReadyAccount }, async (request) => ({
      cancelled: cancelProjectTextGeneration(context, request.authUser!, request.params.projectId, request.body.requestId),
    }));
}
