/**
 * 职责: 暴露班级、成员、实验阶段、状态和实验用户管理 API
 * 依赖内部: ../auth/authorization.ts, ../context.ts, ./teaching.ts
 * 依赖外部: fastify
 * 暴露: registerTeachingRoutes
 */

import type { FastifyInstance } from 'fastify';
import { requireReadyAccount, requireRoles } from '../auth/authorization.js';
import type { AppContext } from '../context.js';
import { addClassMember, classDetail, createClass, createExperiment, createExperimentStage,
  enrollParticipant, experimentDetail, listClasses, listExperiments, removeClassMember,
  setExperimentStatus, withdrawParticipant } from './teaching.js';

interface ClassBody { name: string; code: string }
interface ClassParams { classId: string }
interface MemberBody { username: string; membershipRole: 'teacher' | 'student' }
interface MemberParams extends ClassParams { userId: string; membershipRole: 'teacher' | 'student' }
interface ExperimentBody { name: string; description?: string; settings?: unknown }
interface ExperimentParams { experimentId: string }
interface StageBody { name: string; stageOrder: number; settings?: unknown }
interface ParticipantBody { username: string; participantCode: string }
interface ParticipantParams extends ExperimentParams { userId: string }
interface ExperimentStatusBody { status: 'draft' | 'active' | 'closed' | 'archived' }

function registerClassRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/api/classes', { preHandler: requireReadyAccount }, async (request) => ({
    classes: listClasses(context, request.authUser!),
  }));
  app.get<{ Params: ClassParams }>('/api/classes/:classId',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => ({
      class: classDetail(context, request.authUser!, request.params.classId),
    }));
  app.post<{ Body: ClassBody }>('/api/classes', { preHandler: requireRoles('admin', 'teacher') },
    async (request, reply) => reply.code(201).send({
      id: createClass(context, request.authUser!, request.body.name, request.body.code),
    }));
}

function registerMembershipRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Params: ClassParams; Body: MemberBody }>('/api/classes/:classId/members',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => {
      addClassMember(context, request.authUser!, request.params.classId,
        request.body.username, request.body.membershipRole);
      return { ok: true };
    });
  app.delete<{ Params: MemberParams }>('/api/classes/:classId/members/:userId/:membershipRole',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => {
      removeClassMember(context, request.authUser!, request.params.classId,
        request.params.userId, request.params.membershipRole);
      return { ok: true };
    });
}

function registerExperimentReadRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/api/experiments', { preHandler: requireRoles('admin', 'teacher') }, async (request) => ({
    experiments: listExperiments(context, request.authUser!),
  }));
  app.get<{ Params: ExperimentParams }>('/api/experiments/:experimentId',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => ({
      experiment: experimentDetail(context, request.authUser!, request.params.experimentId),
    }));
}

function registerExperimentWriteRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Body: ExperimentBody }>('/api/experiments', { preHandler: requireRoles('admin', 'teacher') },
    async (request, reply) => reply.code(201).send({ id: createExperiment(context, request.authUser!,
      request.body.name, request.body.description || '', request.body.settings || {}) }));
  app.post<{ Params: ExperimentParams; Body: StageBody }>('/api/experiments/:experimentId/stages',
    { preHandler: requireRoles('admin', 'teacher') }, async (request, reply) => reply.code(201).send({
      id: createExperimentStage(context, request.authUser!, request.params.experimentId,
        request.body.name, request.body.stageOrder, request.body.settings || {}),
    }));
  app.post<{ Params: ExperimentParams; Body: ParticipantBody }>('/api/experiments/:experimentId/participants',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => {
      enrollParticipant(context, request.authUser!, request.params.experimentId,
        request.body.username, request.body.participantCode);
      return { ok: true };
    });
}

function registerExperimentControlRoutes(app: FastifyInstance, context: AppContext): void {
  app.post<{ Params: ExperimentParams; Body: ExperimentStatusBody }>('/api/experiments/:experimentId/status',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => {
      setExperimentStatus(context, request.authUser!, request.params.experimentId, request.body.status);
      return { ok: true };
    });
  app.delete<{ Params: ParticipantParams }>('/api/experiments/:experimentId/participants/:userId',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => {
      withdrawParticipant(context, request.authUser!, request.params.experimentId, request.params.userId);
      return { ok: true };
    });
}

export function registerTeachingRoutes(app: FastifyInstance, context: AppContext): void {
  registerClassRoutes(app, context);
  registerMembershipRoutes(app, context);
  registerExperimentReadRoutes(app, context);
  registerExperimentWriteRoutes(app, context);
  registerExperimentControlRoutes(app, context);
}