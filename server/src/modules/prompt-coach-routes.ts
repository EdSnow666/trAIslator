/**
 * 职责: 暴露个人与全班 AI Prompt 教练 API
 * 依赖内部: ../auth/authorization.ts, ../context.ts, ./prompt-coach.ts, ./prompt-coach-history.ts
 * 依赖外部: fastify
 * 暴露: 单工作空间、多项目、全班 Prompt Coach 运行、教练 Prompt 保存/生成、取消与历史浏览路由
 */

import type { FastifyInstance } from 'fastify';
import { requireReadyAccount, requireRoles } from '../auth/authorization.js';
import type { AppContext } from '../context.js';
import { coachHistoryDetail, listCoachHistory } from './prompt-coach-history.js';
import { cancelClassPromptCoach, cancelProjectPromptCoach, cancelWorkspacePromptCoach,
  getPromptCoachSettings, updatePromptCoachSettings, generatePromptCoachInstruction, runClassPromptCoach, runProjectPromptCoach,
  runWorkspacePromptCoach, type ProjectPromptCoachInput, type PromptCoachInput } from './prompt-coach.js';

interface WorkspaceParams { workspaceId: string }
interface ClassParams { classId: string }
interface CancelBody { requestId: string }

export function registerPromptCoachRoutes(app: FastifyInstance, context: AppContext): void {
  app.get<{ Querystring: { projectId?: string; offset?: string } }>('/api/prompt-coach/history',
    { preHandler: requireReadyAccount }, async (request) => listCoachHistory(context,
      request.authUser!, request.query.projectId, request.query.offset));
  app.get<{ Params: { runId: string } }>('/api/prompt-coach/history/:runId',
    { preHandler: requireReadyAccount }, async (request) => coachHistoryDetail(context,
      request.authUser!, request.params.runId));
  app.get('/api/prompt-coach/settings', { preHandler: requireReadyAccount }, async (request) => (
    getPromptCoachSettings(context, request.authUser!.id)
  ));
  app.put<{ Body: { coachPrompt: string } }>('/api/prompt-coach/settings',
    { preHandler: requireReadyAccount }, async (request) => updatePromptCoachSettings(
      context, request.authUser!, request.body.coachPrompt));
  app.post<{ Body: ProjectPromptCoachInput }>('/api/prompt-coach/instruction/generate',
    { preHandler: requireReadyAccount }, async (request) => generatePromptCoachInstruction(
      context, request.authUser!, request.body));
  app.post<{ Body: ProjectPromptCoachInput }>('/api/prompt-coach/projects',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send(
      await runProjectPromptCoach(context, request.authUser!, request.body),
    ));
  app.post<{ Params: WorkspaceParams; Body: PromptCoachInput }>('/api/workspaces/:workspaceId/prompt-coach',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send(
      await runWorkspacePromptCoach(context, request.authUser!, request.params.workspaceId, request.body),
    ));
  app.post<{ Params: ClassParams; Body: PromptCoachInput }>('/api/classes/:classId/prompt-coach',
    { preHandler: requireRoles('admin', 'teacher') }, async (request, reply) => reply.code(201).send(
      await runClassPromptCoach(context, request.authUser!, request.params.classId, request.body),
    ));
  app.post<{ Params: WorkspaceParams; Body: CancelBody }>('/api/workspaces/:workspaceId/prompt-coach/cancel',
    { preHandler: requireReadyAccount }, async (request) => ({ cancelled: cancelWorkspacePromptCoach(
      context, request.authUser!, request.params.workspaceId, request.body.requestId) }));
  app.post<{ Params: ClassParams; Body: CancelBody }>('/api/classes/:classId/prompt-coach/cancel',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => ({ cancelled: cancelClassPromptCoach(
      context, request.authUser!, request.params.classId, request.body.requestId) }));
  app.post<{ Body: CancelBody }>('/api/prompt-coach/projects/cancel',
    { preHandler: requireReadyAccount }, async (request) => ({
      cancelled: cancelProjectPromptCoach(request.authUser!, request.body.requestId),
    }));
}
