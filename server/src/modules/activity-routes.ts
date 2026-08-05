/**
 * 职责: 提供管理员、教师和项目管理者的跨用户活动审计查询
 * 依赖内部: ../auth/authorization.ts, ../auth/types.ts, ../context.ts, ./access.ts
 * 依赖外部: fastify
 * 暴露: registerActivityRoutes
 */

import type { FastifyInstance } from 'fastify';
import { requireReadyAccount, requireRoles } from '../auth/authorization.js';
import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { ensureProjectManage } from './access.js';

interface ProjectParams { projectId: string }
interface ActivityQuery { userId?: string; eventType?: string; eventPrefix?: string; projectId?: string; limit?: string }
interface ActivityRow {
  id: string;
  eventType: string;
  actorKind: string;
  actorUserId: string | null;
  projectId: string | null;
  projectName: string | null;
  username: string | null;
  displayName: string | null;
  metadataJson: string;
  occurredAt: string;
}

function safeLimit(value?: string): number {
  const parsed = Number(value || 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(parsed, 1), 500);
}

function projectEvents(context: AppContext, projectId: string, limit: number): unknown[] {
  return context.db.prepare(`SELECT ae.*, u.username, u.display_name AS displayName
    FROM activity_events ae LEFT JOIN users u ON u.id = ae.actor_user_id
    WHERE ae.project_id = ? ORDER BY ae.occurred_at DESC LIMIT ?`).all(projectId, limit);
}

function allEvents(context: AppContext, query: ActivityQuery): unknown[] {
  return context.db.prepare(`SELECT ae.*, u.username, u.display_name AS displayName
    FROM activity_events ae LEFT JOIN users u ON u.id = ae.actor_user_id
    WHERE (? IS NULL OR ae.actor_user_id = ?) AND (? IS NULL OR ae.event_type = ?)
      AND (? IS NULL OR ae.project_id = ?)
    ORDER BY ae.occurred_at DESC LIMIT ?`)
    .all(query.userId || null, query.userId || null, query.eventType || null, query.eventType || null,
      query.projectId || null, query.projectId || null, safeLimit(query.limit));
}

function managedScope(user: AuthUser): { sql: string; values: string[] } {
  if (user.roles.includes('admin')) return { sql: '1 = 1', values: [] };
  const sql = `(ae.actor_user_id = ? OR EXISTS (SELECT 1 FROM project_managers pm
      WHERE pm.project_id = ae.project_id AND pm.user_id = ?)
    OR EXISTS (SELECT 1 FROM class_memberships cm WHERE cm.user_id = ?
      AND cm.membership_role = 'teacher' AND cm.status = 'active'
      AND cm.class_id = json_extract(ae.metadata_json, '$.classId'))
    OR EXISTS (SELECT 1 FROM experiments e WHERE e.created_by = ? AND e.deleted_at IS NULL
      AND e.id = json_extract(ae.metadata_json, '$.experimentId')))`;
  return { sql, values: [user.id, user.id, user.id, user.id] };
}

function parseMetadata(value: string): unknown {
  try { return JSON.parse(value); } catch { return {}; }
}

function normalizeEvent(row: ActivityRow): unknown {
  return { id: row.id, eventType: row.eventType, actorKind: row.actorKind,
    actorUserId: row.actorUserId, username: row.username, displayName: row.displayName,
    projectId: row.projectId, projectName: row.projectName,
    metadata: parseMetadata(row.metadataJson), occurredAt: row.occurredAt };
}

function managedEvents(context: AppContext, user: AuthUser, query: ActivityQuery): unknown[] {
  const scope = managedScope(user);
  const prefix = query.eventPrefix ? `${query.eventPrefix}%` : null;
  const rows = context.db.prepare(`SELECT ae.id, ae.event_type AS eventType, ae.actor_kind AS actorKind,
      ae.actor_user_id AS actorUserId, ae.project_id AS projectId, p.name AS projectName,
      u.username, u.display_name AS displayName, ae.metadata_json AS metadataJson,
      ae.occurred_at AS occurredAt
    FROM activity_events ae LEFT JOIN users u ON u.id = ae.actor_user_id
    LEFT JOIN projects p ON p.id = ae.project_id WHERE ${scope.sql}
      AND (? IS NULL OR ae.event_type LIKE ?) ORDER BY ae.occurred_at DESC LIMIT ?`)
    .all(...scope.values, prefix, prefix, safeLimit(query.limit)) as ActivityRow[];
  return rows.map(normalizeEvent);
}

export function registerActivityRoutes(app: FastifyInstance, context: AppContext): void {
  app.get<{ Querystring: ActivityQuery }>('/api/admin/activity',
    { preHandler: requireRoles('admin') }, async (request) => ({ events: allEvents(context, request.query) }));
  app.get<{ Querystring: ActivityQuery }>('/api/activity/managed',
    { preHandler: requireRoles('admin', 'teacher') }, async (request) => ({
      events: managedEvents(context, request.authUser!, request.query),
    }));
  app.get<{ Params: ProjectParams; Querystring: ActivityQuery }>('/api/projects/:projectId/activity',
    { preHandler: requireReadyAccount }, async (request) => {
      ensureProjectManage(context, request.authUser!, request.params.projectId);
      return { events: projectEvents(context, request.params.projectId, safeLimit(request.query.limit)) };
    });
}