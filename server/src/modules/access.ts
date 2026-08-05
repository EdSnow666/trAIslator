/**
 * 职责: 集中执行项目、班级、作业空间的行级访问判断
 * 依赖内部: ../auth/types.ts, ../context.ts, ../errors.ts
 * 依赖外部: 无
 * 暴露: ensureProjectView | ensureProjectManage | ensureWorkspaceView | ensureWorkspaceOwner | ensureClassManage | ensureExperimentManage
 */

import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';

function isAdmin(user: AuthUser): boolean {
  return user.roles.includes('admin');
}

function isTeacher(user: AuthUser): boolean {
  return user.roles.includes('teacher');
}

function projectKind(context: AppContext, projectId: string): string | null {
  const row = context.db.prepare('SELECT project_kind FROM projects WHERE id = ? AND deleted_at IS NULL')
    .get(projectId) as { project_kind: string } | undefined;
  return row?.project_kind || null;
}

function managesProject(context: AppContext, userId: string, projectId: string): boolean {
  return Boolean(context.db.prepare('SELECT 1 FROM project_managers WHERE project_id = ? AND user_id = ?')
    .get(projectId, userId));
}

function hasAssignedProject(context: AppContext, userId: string, projectId: string): boolean {
  return Boolean(context.db.prepare(`SELECT 1 FROM project_assignments pa
    LEFT JOIN class_memberships cm ON cm.class_id = pa.class_id AND cm.user_id = ? AND cm.status = 'active'
    LEFT JOIN experiment_stages es ON es.id = pa.experiment_stage_id
    LEFT JOIN experiment_participants ep ON ep.experiment_id = es.experiment_id AND ep.user_id = ? AND ep.status = 'active'
    WHERE pa.project_id = ? AND pa.status = 'active' AND (cm.user_id IS NOT NULL OR ep.user_id IS NOT NULL) LIMIT 1`)
    .get(userId, userId, projectId));
}

export function ensureProjectView(context: AppContext, user: AuthUser, projectId: string): void {
  const kind = projectKind(context, projectId);
  if (!kind) throw new AppError(404, 'PROJECT_NOT_FOUND', '项目不存在。');
  if (isAdmin(user) || managesProject(context, user.id, projectId)) return;
  if (kind === 'system_template' && isTeacher(user)) return;
  if (hasAssignedProject(context, user.id, projectId)) return;
  throw new AppError(403, 'PROJECT_FORBIDDEN', '无权查看此项目。');
}

export function ensureProjectManage(context: AppContext, user: AuthUser, projectId: string): void {
  if (isAdmin(user) || managesProject(context, user.id, projectId)) return;
  throw new AppError(403, 'PROJECT_MANAGE_FORBIDDEN', '无权管理此项目。');
}

function workspaceRow(context: AppContext, workspaceId: string): { owner_user_id: string; project_id: string } | undefined {
  return context.db.prepare(`SELECT owner_user_id, project_id FROM project_workspaces
    WHERE id = ? AND deleted_at IS NULL`).get(workspaceId) as { owner_user_id: string; project_id: string } | undefined;
}

export function ensureWorkspaceView(context: AppContext, user: AuthUser, workspaceId: string): void {
  const row = workspaceRow(context, workspaceId);
  if (!row) throw new AppError(404, 'WORKSPACE_NOT_FOUND', '工作空间不存在。');
  if (row.owner_user_id === user.id || isAdmin(user) || managesProject(context, user.id, row.project_id)) return;
  throw new AppError(403, 'WORKSPACE_FORBIDDEN', '无权查看此工作空间。');
}

export function ensureWorkspaceOwner(context: AppContext, user: AuthUser, workspaceId: string): void {
  const row = workspaceRow(context, workspaceId);
  if (!row) throw new AppError(404, 'WORKSPACE_NOT_FOUND', '工作空间不存在。');
  if (row.owner_user_id === user.id || isAdmin(user)) return;
  throw new AppError(403, 'WORKSPACE_EDIT_FORBIDDEN', '不能修改其他用户的工作空间。');
}

export function ensureClassManage(context: AppContext, user: AuthUser, classId: string): void {
  if (isAdmin(user)) return;
  const row = context.db.prepare(`SELECT 1 FROM class_memberships
    WHERE class_id = ? AND user_id = ? AND membership_role = 'teacher' AND status = 'active'`)
    .get(classId, user.id);
  if (!row) throw new AppError(403, 'CLASS_MANAGE_FORBIDDEN', '无权管理此班级。');
}
export function ensureExperimentManage(context: AppContext, user: AuthUser, experimentId: string): void {
  if (isAdmin(user)) return;
  const row = context.db.prepare(`SELECT 1 FROM experiments
    WHERE id = ? AND created_by = ? AND deleted_at IS NULL`).get(experimentId, user.id);
  if (!row) throw new AppError(403, 'EXPERIMENT_FORBIDDEN', '无权管理此实验。');
}