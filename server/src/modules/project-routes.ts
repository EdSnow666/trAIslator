/**
 * 职责: 暴露项目查询、快照、本地创建、任务书、发布/取消发布、软删除、分配和工作空间 API
 * 依赖内部: ../auth/authorization.ts, ../context.ts, ./project-generation-routes.ts, ./project-resources.ts, ./project-snapshot.ts, ./projects.ts
 * 依赖外部: fastify
 * 暴露: registerProjectRoutes
 */

import type { FastifyInstance } from 'fastify';
import { requireReadyAccount, requireRoles } from '../auth/authorization.js';
import type { AppContext } from '../context.js';
import { registerProjectGenerationRoutes } from './project-generation-routes.js';
import { currentProjectBrief, listProjectResourceCatalog, saveProjectBrief,
  type BriefContent } from './project-resources.js';
import { buildProjectSnapshot } from './project-snapshot.js';
import { assignProject, createProject, createWorkspace, deleteProject, listVisibleProjects,
  openProjectWorkspace, projectDetail, publishProject, unassignProject, unpublishProject,
  type ProjectInput } from './projects.js';

interface ProjectParams { projectId: string }
interface AssignmentParams { assignmentId: string }
interface AssignBody { classId?: string; experimentStageId?: string }
interface SnapshotQuery { workspaceId?: string }
interface BriefBody { content: Partial<BriefContent> }

function registerProjectReadRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/api/projects', { preHandler: requireReadyAccount }, async (request) => ({
    projects: listVisibleProjects(context, request.authUser!),
  }));
  app.get('/api/project-resources/catalog', { preHandler: requireReadyAccount }, async (request) => ({
    resources: listProjectResourceCatalog(context, request.authUser!),
  }));
  app.get<{ Params: ProjectParams }>('/api/projects/:projectId/brief',
    { preHandler: requireReadyAccount }, async (request) => ({
      brief: currentProjectBrief(context, request.authUser!, request.params.projectId),
    }));
  app.get<{ Params: ProjectParams; Querystring: SnapshotQuery }>('/api/projects/:projectId/snapshot',
    { preHandler: requireReadyAccount }, async (request) => ({
      project: buildProjectSnapshot(context, request.authUser!, request.params.projectId, request.query.workspaceId),
    }));
  app.get<{ Params: ProjectParams }>('/api/projects/:projectId',
    { preHandler: requireReadyAccount }, async (request) => (
      projectDetail(context, request.authUser!, request.params.projectId)
    ));
}

function registerProjectWriteRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Body: ProjectInput }>('/api/projects', { preHandler: requireReadyAccount },
    async (request, reply) => reply.code(201).send({
      id: await createProject(context, request.authUser!, request.body),
    }));
  app.post<{ Params: ProjectParams; Body: BriefBody }>('/api/projects/:projectId/briefs',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send({
      id: saveProjectBrief(context, request.authUser!, request.params.projectId, request.body.content),
    }));
  app.post<{ Params: ProjectParams }>('/api/projects/:projectId/publish',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => {
      publishProject(context, request.authUser!, request.params.projectId);
      return { ok: true };
    });
  app.post<{ Params: ProjectParams }>('/api/projects/:projectId/unpublish',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => {
      unpublishProject(context, request.authUser!, request.params.projectId);
      return { ok: true };
    });
  app.delete<{ Params: ProjectParams }>('/api/projects/:projectId',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => {
      deleteProject(context, request.authUser!, request.params.projectId);
      return { ok: true };
    });
}

function registerWorkspaceRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Params: ProjectParams; Body: AssignBody }>('/api/projects/:projectId/assignments',
    { preHandler: requireRoles('admin', 'teacher') }, async (request, reply) => reply.code(201).send({
      id: assignProject(context, request.authUser!, request.params.projectId,
        request.body.classId, request.body.experimentStageId),
    }));
  app.post<{ Params: ProjectParams }>('/api/projects/:projectId/workspace',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send({
      id: openProjectWorkspace(context, request.authUser!, request.params.projectId),
    }));
  app.post<{ Params: AssignmentParams }>('/api/assignments/:assignmentId/workspaces',
    { preHandler: requireReadyAccount }, async (request, reply) => reply.code(201).send({
      id: createWorkspace(context, request.authUser!, request.params.assignmentId),
    }));
  app.delete<{ Params: AssignmentParams }>('/api/assignments/:assignmentId',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => {
      unassignProject(context, request.authUser!, request.params.assignmentId);
      return { ok: true };
    });
}

export function registerProjectRoutes(app: FastifyInstance, context: AppContext): void {
  registerProjectReadRoutes(app, context);
  registerProjectWriteRoutes(app, context);
  registerWorkspaceRoutes(app, context);
  registerProjectGenerationRoutes(app, context);
}
