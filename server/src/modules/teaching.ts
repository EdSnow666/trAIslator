/**
 * 职责: 管理班级成员与已分配项目，以及实验、阶段、状态和受试者
 * 依赖内部: ../auth/repository.ts, ../auth/types.ts, ../context.ts, ../errors.ts, ../shared.ts, ./access.ts, ./activity.ts
 * 依赖外部: 无
 * 暴露: 班级管理 | listManagedSubmissions | 实验列表、详情、阶段、受试者和状态管理
 */

import { normalizeUsername } from '../auth/repository.js';
import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { jsonText, newId, nowIso } from '../shared.js';
import { ensureClassManage, ensureExperimentManage } from './access.js';
import { recordActivity } from './activity.js';

interface ClassSummaryRow {
  id: string;
  name: string;
  code: string;
  status: string;
  createdAt: string;
  memberCount: number;
  studentCount: number;
}

interface ExperimentSummaryRow {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
  stageCount: number;
  participantCount: number;
}

export function createClass(context: AppContext, user: AuthUser, name: string, code: string): string {
  if (!name.trim() || !code.trim()) throw new AppError(400, 'CLASS_FIELDS_REQUIRED', '班级名称和代码不能为空。');
  const id = newId();
  const time = nowIso();
  context.db.transaction(() => {
    context.db.prepare(`INSERT INTO classes
      (id, name, code, created_by, origin_instance_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name.trim(), code.trim(), user.id, context.instanceId, time, time);
    context.db.prepare(`INSERT INTO class_memberships
      (class_id, user_id, membership_role, added_by, joined_at) VALUES (?, ?, 'teacher', ?, ?)`)
      .run(id, user.id, user.id, time);
    recordActivity(context, { eventType: 'class.created', actorUserId: user.id, metadata: { classId: id } });
  }).immediate();
  return id;
}

function classIdsForUser(context: AppContext, user: AuthUser): string[] {
  if (user.roles.includes('admin')) {
    const rows = context.db.prepare(`SELECT id FROM classes
      WHERE deleted_at IS NULL AND is_personal = 0 ORDER BY created_at`)
      .all() as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }
  const rows = context.db.prepare(`SELECT DISTINCT c.id FROM classes c JOIN class_memberships cm ON cm.class_id = c.id
    WHERE cm.user_id = ? AND cm.status = 'active' AND c.deleted_at IS NULL
      AND c.is_personal = 0 ORDER BY c.created_at`)
    .all(user.id) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

function classSummary(context: AppContext, classId: string): ClassSummaryRow {
  return context.db.prepare(`SELECT c.id, c.name, c.code, c.status, c.created_at AS createdAt,
      COUNT(CASE WHEN cm.status = 'active' THEN 1 END) AS memberCount,
      COUNT(CASE WHEN cm.status = 'active' AND cm.membership_role = 'student' THEN 1 END) AS studentCount
    FROM classes c LEFT JOIN class_memberships cm ON cm.class_id = c.id
    WHERE c.id = ? GROUP BY c.id`).get(classId) as ClassSummaryRow;
}

export function listClasses(context: AppContext, user: AuthUser): ClassSummaryRow[] {
  return classIdsForUser(context, user).map((id) => classSummary(context, id));
}

export function updateClass(context: AppContext, user: AuthUser, classId: string,
  name: string, code: string): void {
  ensureClassManage(context, user, classId);
  if (!name.trim() || !code.trim()) throw new AppError(400, 'CLASS_FIELDS_REQUIRED', '班级名称和代码不能为空。');
  const result = context.db.prepare(`UPDATE classes SET name = ?, code = ?, updated_at = ?, row_version = row_version + 1
    WHERE id = ? AND deleted_at IS NULL`).run(name.trim(), code.trim(), nowIso(), classId);
  if (!result.changes) throw new AppError(404, 'CLASS_NOT_FOUND', '班级不存在。');
  recordActivity(context, { eventType: 'class.updated', actorUserId: user.id, metadata: { classId } });
}

export function dissolveClass(context: AppContext, user: AuthUser, classId: string): void {
  ensureClassManage(context, user, classId);
  const time = nowIso();
  context.db.transaction(() => {
    const result = context.db.prepare(`UPDATE classes SET status = 'archived', deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`).run(time, time, classId);
    if (!result.changes) throw new AppError(404, 'CLASS_NOT_FOUND', '班级不存在。');
    context.db.prepare("UPDATE project_assignments SET status = 'inactive' WHERE class_id = ? AND status = 'active'").run(classId);
    recordActivity(context, { eventType: 'class.dissolved', actorUserId: user.id, metadata: { classId } });
  }).immediate();
}

function listClassMembers(context: AppContext, classId: string): unknown[] {
  return context.db.prepare(`SELECT u.id, u.username, u.display_name AS displayName,
      cm.membership_role AS membershipRole, cm.status, cm.joined_at AS joinedAt,
      (SELECT json_group_array(ur.role_code) FROM user_roles ur WHERE ur.user_id = u.id) AS roles
    FROM class_memberships cm JOIN users u ON u.id = cm.user_id
    WHERE cm.class_id = ? ORDER BY cm.membership_role, u.display_name`).all(classId);
}

function listClassProjects(context: AppContext, classId: string): unknown[] {
  return context.db.prepare(`SELECT p.id, p.name, p.status, p.direction,
      pa.id AS assignmentId, pa.assigned_at AS assignedAt
    FROM project_assignments pa JOIN projects p ON p.id = pa.project_id
    WHERE pa.class_id = ? AND pa.status = 'active' AND p.deleted_at IS NULL
    ORDER BY pa.assigned_at DESC`).all(classId);
}

export function classDetail(context: AppContext, user: AuthUser, classId: string): unknown {
  ensureClassManage(context, user, classId);
  const summary = classSummary(context, classId);
  if (!summary) throw new AppError(404, 'CLASS_NOT_FOUND', '班级不存在。');
  return { ...summary, members: listClassMembers(context, classId),
    projects: listClassProjects(context, classId) };
}

function memberByRole(context: AppContext, username: string, role: 'teacher' | 'student') {
  return context.db.prepare(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.username_normalized = ? AND u.status = 'active' AND ur.role_code = ?`)
    .get(normalizeUsername(username), role) as { id: string } | undefined;
}

export function addClassMember(context: AppContext, user: AuthUser, classId: string,
  username: string, role: 'teacher' | 'student'): void {
  ensureClassManage(context, user, classId);
  const member = memberByRole(context, username, role);
  if (!member) throw new AppError(404, 'USER_ROLE_NOT_FOUND', `没有找到具备${role === 'teacher' ? '教师' : '学生'}角色的有效账号。`);
  context.db.prepare(`INSERT INTO class_memberships
    (class_id, user_id, membership_role, added_by, joined_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(class_id, user_id, membership_role) DO UPDATE SET status = 'active'`)
    .run(classId, member.id, role, user.id, nowIso());
  recordActivity(context, { eventType: 'class.member_added', actorUserId: user.id,
    metadata: { classId, memberUserId: member.id, membershipRole: role } });
}

export function removeClassMember(context: AppContext, user: AuthUser, classId: string,
  memberUserId: string, role: 'teacher' | 'student'): void {
  ensureClassManage(context, user, classId);
  const targetAdmin = context.db.prepare(`SELECT 1 FROM user_roles WHERE user_id = ? AND role_code = 'admin'`)
    .get(memberUserId);
  if (targetAdmin && !user.roles.includes('admin')) {
    throw new AppError(403, 'ADMIN_MEMBER_PROTECTED', '教师不能移除系统管理员。');
  }
  if (memberUserId === user.id && !user.roles.includes('admin')) {
    throw new AppError(409, 'CANNOT_REMOVE_SELF', '教师不能移除自己，请由管理员处理。');
  }
  const result = context.db.prepare(`UPDATE class_memberships SET status = 'inactive'
    WHERE class_id = ? AND user_id = ? AND membership_role = ? AND status = 'active'`)
    .run(classId, memberUserId, role);
  if (!result.changes) throw new AppError(404, 'MEMBERSHIP_NOT_FOUND', '未找到有效班级成员关系。');
  recordActivity(context, { eventType: 'class.member_removed', actorUserId: user.id,
    metadata: { classId, memberUserId, membershipRole: role } });
}

function managedProjectIds(context: AppContext, user: AuthUser): string[] {
  const sql = user.roles.includes('admin')
    ? `SELECT id FROM projects WHERE deleted_at IS NULL`
    : `SELECT project_id AS id FROM project_managers WHERE user_id = ?
       UNION SELECT pa.project_id AS id FROM project_assignments pa
       JOIN class_memberships cm ON cm.class_id = pa.class_id
       WHERE pa.status = 'active' AND cm.user_id = ? AND cm.membership_role = 'teacher'
         AND cm.status = 'active'`;
  const rows = user.roles.includes('admin') ? context.db.prepare(sql).all()
    : context.db.prepare(sql).all(user.id, user.id);
  return (rows as Array<{ id: string }>).map((row) => row.id);
}

function submittedPrompts(context: AppContext, projectIds: string[]): unknown[] {
  const placeholders = projectIds.map(() => '?').join(',');
  return context.db.prepare(`SELECT ps.id, ps.prompt_version_id AS promptVersionId, ps.status,
      ps.submitted_at AS submittedAt, u.display_name AS submittedBy, u.username,
      p.id AS projectId, p.name AS projectName, pv.version_number AS version,
      pv.title, pv.content, pl.prompt_kind AS promptKind
    FROM prompt_submissions ps JOIN prompt_versions pv ON pv.id = ps.prompt_version_id
    JOIN prompt_lineages pl ON pl.id = pv.lineage_id JOIN projects p ON p.id = pl.project_id
    JOIN users u ON u.id = ps.submitted_by WHERE p.id IN (${placeholders})
    ORDER BY ps.submitted_at DESC`).all(...projectIds);
}

function submittedTranslations(context: AppContext, projectIds: string[]): unknown[] {
  const placeholders = projectIds.map(() => '?').join(',');
  return context.db.prepare(`SELECT ts.id, ts.translation_version_id AS translationVersionId,
      ts.status, ts.submitted_at AS submittedAt, u.display_name AS submittedBy, u.username,
      p.id AS projectId, p.name AS projectName, s.id AS segmentId, s.source_text AS source,
      tv.content, tv.version_kind AS versionKind
    FROM translation_submissions ts JOIN translation_versions tv ON tv.id = ts.translation_version_id
    JOIN projects p ON p.id = ts.project_id JOIN segments s ON s.id = ts.segment_id
    JOIN users u ON u.id = ts.submitted_by WHERE p.id IN (${placeholders})
    ORDER BY ts.submitted_at DESC`).all(...projectIds);
}

export function listManagedSubmissions(context: AppContext, user: AuthUser): unknown {
  const projectIds = managedProjectIds(context, user);
  if (!projectIds.length) return { prompts: [], translations: [] };
  return { prompts: submittedPrompts(context, projectIds),
    translations: submittedTranslations(context, projectIds) };
}

export function createExperiment(context: AppContext, user: AuthUser, name: string,
  description: string, settings: unknown): string {
  if (!name.trim()) throw new AppError(400, 'EXPERIMENT_NAME_REQUIRED', '实验名称不能为空。');
  const id = newId();
  const time = nowIso();
  context.db.prepare(`INSERT INTO experiments (id, name, description, settings_json, created_by,
    origin_instance_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, name.trim(), description.trim(), jsonText(settings), user.id, context.instanceId, time, time);
  recordActivity(context, { eventType: 'experiment.created', actorUserId: user.id, metadata: { experimentId: id } });
  return id;
}

function experimentIdsForUser(context: AppContext, user: AuthUser): string[] {
  const sql = user.roles.includes('admin')
    ? 'SELECT id FROM experiments WHERE deleted_at IS NULL ORDER BY created_at DESC'
    : 'SELECT id FROM experiments WHERE created_by = ? AND deleted_at IS NULL ORDER BY created_at DESC';
  const rows = user.roles.includes('admin') ? context.db.prepare(sql).all()
    : context.db.prepare(sql).all(user.id);
  return (rows as Array<{ id: string }>).map((row) => row.id);
}

function experimentSummary(context: AppContext, experimentId: string): ExperimentSummaryRow | undefined {
  return context.db.prepare(`SELECT e.id, e.name, e.description, e.status, e.created_at AS createdAt,
      (SELECT COUNT(*) FROM experiment_stages es WHERE es.experiment_id = e.id) AS stageCount,
      (SELECT COUNT(*) FROM experiment_participants ep
        WHERE ep.experiment_id = e.id AND ep.status = 'active') AS participantCount
    FROM experiments e WHERE e.id = ? AND e.deleted_at IS NULL`).get(experimentId) as ExperimentSummaryRow | undefined;
}

export function listExperiments(context: AppContext, user: AuthUser): ExperimentSummaryRow[] {
  return experimentIdsForUser(context, user)
    .map((id) => experimentSummary(context, id)).filter(Boolean) as ExperimentSummaryRow[];
}

function experimentStages(context: AppContext, experimentId: string): unknown[] {
  return context.db.prepare(`SELECT id, stage_order AS stageOrder, name, settings_json AS settingsJson,
      starts_at AS startsAt, ends_at AS endsAt, created_at AS createdAt
    FROM experiment_stages WHERE experiment_id = ? ORDER BY stage_order`).all(experimentId);
}

function experimentParticipants(context: AppContext, experimentId: string): unknown[] {
  return context.db.prepare(`SELECT u.id, u.username, u.display_name AS displayName,
      ep.participant_code AS participantCode, ep.status, ep.enrolled_at AS enrolledAt
    FROM experiment_participants ep JOIN users u ON u.id = ep.user_id
    WHERE ep.experiment_id = ? ORDER BY ep.participant_code`).all(experimentId);
}

export function experimentDetail(context: AppContext, user: AuthUser, experimentId: string): unknown {
  ensureExperimentManage(context, user, experimentId);
  const summary = experimentSummary(context, experimentId);
  if (!summary) throw new AppError(404, 'EXPERIMENT_NOT_FOUND', '实验不存在。');
  return { ...summary, stages: experimentStages(context, experimentId),
    participants: experimentParticipants(context, experimentId) };
}

export function createExperimentStage(context: AppContext, user: AuthUser, experimentId: string,
  name: string, order: number, settings: unknown): string {
  ensureExperimentManage(context, user, experimentId);
  if (!name.trim() || !Number.isInteger(order) || order < 1) {
    throw new AppError(400, 'INVALID_EXPERIMENT_STAGE', '阶段名称不能为空，顺序必须为正整数。');
  }
  const duplicate = context.db.prepare(`SELECT 1 FROM experiment_stages
    WHERE experiment_id = ? AND stage_order = ?`).get(experimentId, order);
  if (duplicate) throw new AppError(409, 'STAGE_ORDER_EXISTS', '该阶段顺序已存在。');
  const id = newId();
  context.db.prepare(`INSERT INTO experiment_stages
    (id, experiment_id, stage_order, name, settings_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, experimentId, order, name.trim(), jsonText(settings), nowIso());
  recordActivity(context, { eventType: 'experiment.stage_created', actorUserId: user.id,
    metadata: { experimentId, stageId: id, stageOrder: order } });
  return id;
}

export function enrollParticipant(context: AppContext, user: AuthUser, experimentId: string,
  username: string, participantCode: string): void {
  ensureExperimentManage(context, user, experimentId);
  if (!participantCode.trim()) throw new AppError(400, 'PARTICIPANT_CODE_REQUIRED', '受试者编号不能为空。');
  const participant = context.db.prepare(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.username_normalized = ? AND u.status = 'active' AND ur.role_code = 'experiment_user'`)
    .get(normalizeUsername(username)) as { id: string } | undefined;
  if (!participant) throw new AppError(404, 'EXPERIMENT_USER_NOT_FOUND', '实验用户不存在或角色不正确。');
  ensureParticipantCode(context, experimentId, participant.id, participantCode.trim());
  upsertParticipant(context, user.id, experimentId, participant.id, participantCode.trim());
  recordActivity(context, { eventType: 'experiment.participant_enrolled', actorUserId: user.id,
    metadata: { experimentId, participantUserId: participant.id } });
}

function ensureParticipantCode(context: AppContext, experimentId: string,
  participantId: string, participantCode: string): void {
  const owner = context.db.prepare(`SELECT user_id FROM experiment_participants
    WHERE experiment_id = ? AND participant_code = ?`).get(experimentId, participantCode) as { user_id: string } | undefined;
  if (owner && owner.user_id !== participantId) {
    throw new AppError(409, 'PARTICIPANT_CODE_EXISTS', '该受试者编号已被使用。');
  }
}

function upsertParticipant(context: AppContext, actorId: string, experimentId: string,
  participantId: string, participantCode: string): void {
  context.db.prepare(`INSERT INTO experiment_participants
    (experiment_id, user_id, participant_code, enrolled_by, enrolled_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(experiment_id, user_id) DO UPDATE SET participant_code = excluded.participant_code,
      status = 'active', enrolled_by = excluded.enrolled_by, enrolled_at = excluded.enrolled_at`)
    .run(experimentId, participantId, participantCode, actorId, nowIso());
}

export function withdrawParticipant(context: AppContext, user: AuthUser, experimentId: string,
  participantUserId: string): void {
  ensureExperimentManage(context, user, experimentId);
  const result = context.db.prepare(`UPDATE experiment_participants SET status = 'withdrawn'
    WHERE experiment_id = ? AND user_id = ? AND status = 'active'`).run(experimentId, participantUserId);
  if (!result.changes) throw new AppError(404, 'PARTICIPANT_NOT_FOUND', '未找到有效受试者。');
  recordActivity(context, { eventType: 'experiment.participant_withdrawn', actorUserId: user.id,
    metadata: { experimentId, participantUserId } });
}

export function setExperimentStatus(context: AppContext, user: AuthUser, experimentId: string,
  status: 'draft' | 'active' | 'closed' | 'archived'): void {
  ensureExperimentManage(context, user, experimentId);
  if (!['draft', 'active', 'closed', 'archived'].includes(status)) {
    throw new AppError(400, 'INVALID_EXPERIMENT_STATUS', '实验状态无效。');
  }
  const result = context.db.prepare(`UPDATE experiments SET status = ?, updated_at = ?, row_version = row_version + 1
    WHERE id = ? AND deleted_at IS NULL`).run(status, nowIso(), experimentId);
  if (!result.changes) throw new AppError(404, 'EXPERIMENT_NOT_FOUND', '实验不存在。');
  recordActivity(context, { eventType: 'experiment.status_changed', actorUserId: user.id,
    metadata: { experimentId, status } });
}
