/**
 * 职责: 查询角色可见项目并创建本地项目、发布分配项目和个人工作空间
 * 依赖内部: ../auth/types.ts, ../context.ts, ../errors.ts, ../shared.ts, ./access.ts, ./activity.ts, ./project-resources.ts
 * 依赖外部: 无
 * 暴露: listVisibleProjects | createProject | publishProject | unpublishProject | deleteProject | assignProject | unassignProject | createWorkspace | openProjectWorkspace | projectDetail
 */

import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { newId, nowIso, sha256 } from '../shared.js';
import { ensureClassManage, ensureExperimentManage, ensureProjectManage, ensureProjectView } from './access.js';
import { recordActivity } from './activity.js';
import { initializeProjectResources, type ResourceSetup } from './project-resources.js';
import { cloneTemplateContent } from './template-clone.js';

export interface ProjectInput {
  name: string;
  direction: string;
  sourceLanguage: string;
  targetLanguage: string;
  description?: string;
  kind?: 'class_project' | 'experiment_project';
  sourceTemplateProjectId?: string;
  sourceText?: string;
  documentTitle?: string;
  setup?: ResourceSetup;
}

interface ProjectListRow {
  id: string; name: string; projectKind: string; direction: string; status: string; updatedAt: string;
  managerUserId: string | null;
  teachingAssignmentCount: number;
  classTags: string | null;
}

function eligibleAssignment(context: AppContext, userId: string, projectId: string) {
  return context.db.prepare(`SELECT pa.id FROM project_assignments pa
    LEFT JOIN class_memberships cm ON cm.class_id = pa.class_id AND cm.user_id = ? AND cm.status = 'active'
    LEFT JOIN experiment_stages es ON es.id = pa.experiment_stage_id
    LEFT JOIN experiment_participants ep ON ep.experiment_id = es.experiment_id
      AND ep.user_id = ? AND ep.status = 'active'
    WHERE pa.project_id = ? AND pa.status = 'active'
      AND (cm.user_id IS NOT NULL OR ep.user_id IS NOT NULL)
    ORDER BY pa.assigned_at LIMIT 1`).get(userId, userId, projectId) as { id: string } | undefined;
}

function userWorkspace(context: AppContext, userId: string, projectId: string) {
  return context.db.prepare(`SELECT id FROM project_workspaces
    WHERE project_id = ? AND owner_user_id = ? AND status = 'active' AND deleted_at IS NULL
    ORDER BY created_at LIMIT 1`).get(projectId, userId) as { id: string } | undefined;
}

function projectAccess(context: AppContext, userId: string, projectId: string) {
  const assignment = eligibleAssignment(context, userId, projectId);
  const workspace = userWorkspace(context, userId, projectId);
  return { assignmentId: assignment?.id || null, workspaceId: workspace?.id || null,
    editable: Boolean(assignment || workspace) };
}

export function listVisibleProjects(context: AppContext, user: AuthUser): unknown[] {
  const admin = user.roles.includes('admin') ? 1 : 0;
  const teacher = user.roles.includes('teacher') ? 1 : 0;
  const rows = context.db.prepare(`SELECT DISTINCT p.id, p.name, p.project_kind AS projectKind,
      p.direction, p.status, p.updated_at AS updatedAt, pm.user_id AS managerUserId,
      (SELECT COUNT(*) FROM project_assignments pa2 JOIN classes c2 ON c2.id = pa2.class_id
        WHERE pa2.project_id = p.id AND pa2.status = 'active' AND c2.is_personal = 0) AS teachingAssignmentCount,
      (SELECT GROUP_CONCAT(c3.name, '||') FROM project_assignments pa3 JOIN classes c3 ON c3.id = pa3.class_id
        WHERE pa3.project_id = p.id AND pa3.status = 'active' AND c3.is_personal = 0) AS classTags
    FROM projects p
    LEFT JOIN project_managers pm ON pm.project_id = p.id AND pm.user_id = ?
    LEFT JOIN project_assignments pa ON pa.project_id = p.id AND pa.status = 'active'
    LEFT JOIN class_memberships cm ON cm.class_id = pa.class_id AND cm.user_id = ? AND cm.status = 'active'
    LEFT JOIN experiment_stages es ON es.id = pa.experiment_stage_id
    LEFT JOIN experiment_participants ep ON ep.experiment_id = es.experiment_id AND ep.user_id = ? AND ep.status = 'active'
    WHERE p.deleted_at IS NULL AND (? = 1 OR pm.user_id IS NOT NULL OR
      (p.project_kind = 'system_template' AND ? = 1) OR cm.user_id IS NOT NULL OR ep.user_id IS NOT NULL)
    ORDER BY p.project_kind, p.created_at`).all(user.id, user.id, user.id, admin, teacher) as ProjectListRow[];
  return rows.map(({ managerUserId, classTags, teachingAssignmentCount, ...row }) => ({ ...row,
    canManage: Boolean(admin || managerUserId), isLocal: teachingAssignmentCount === 0,
    classTags: classTags ? classTags.split('||') : [], teachingAssignmentCount,
    ...projectAccess(context, user.id, row.id) }));
}

function sourceParagraphs(sourceText?: string): string[] {
  return (sourceText || '').replace(/\r\n?/g, '\n').split(/\n\s*\n+/)
    .map((item) => item.trim()).filter(Boolean);
}

function insertSourceDocument(context: AppContext, projectId: string, input: ProjectInput): void {
  const paragraphs = sourceParagraphs(input.sourceText);
  if (!paragraphs.length) return;
  const documentId = newId();
  const time = nowIso();
  context.db.prepare(`INSERT INTO documents (id, project_id, title, document_order, created_at)
    VALUES (?, ?, ?, 1, ?)`).run(documentId, projectId, input.documentTitle || input.name, time);
  const insert = context.db.prepare(`INSERT INTO segments (id, document_id, segment_key, segment_order,
    source_text, source_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  paragraphs.forEach((text, index) => insert.run(newId(), documentId, `p-${index + 1}`,
    index + 1, text, sha256(text), time));
}

function personalClass(context: AppContext, user: AuthUser): string {
  const existing = context.db.prepare(`SELECT c.id FROM classes c JOIN class_memberships cm ON cm.class_id = c.id
    WHERE c.is_personal = 1 AND cm.user_id = ? AND cm.status = 'active' LIMIT 1`)
    .get(user.id) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = newId();
  const time = nowIso();
  const role = user.roles.some((item) => item === 'admin' || item === 'teacher') ? 'teacher' : 'student';
  context.db.prepare(`INSERT INTO classes (id, name, code, created_by, origin_instance_id,
    created_at, updated_at, is_personal) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`)
    .run(id, `${user.displayName}的本地项目`, `LOCAL-${user.id}`, user.id, context.instanceId, time, time);
  context.db.prepare(`INSERT INTO class_memberships (class_id, user_id, membership_role, added_by, joined_at)
    VALUES (?, ?, ?, ?, ?)`).run(id, user.id, role, user.id, time);
  return id;
}

function createPersonalAssignment(context: AppContext, user: AuthUser, projectId: string): string {
  const id = newId();
  context.db.prepare(`INSERT INTO project_assignments
    (id, project_id, class_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, projectId, personalClass(context, user), user.id, nowIso());
  return id;
}

function validateProjectInput(context: AppContext, user: AuthUser, input: ProjectInput): void {
  if (!input.name?.trim() || !input.direction || !input.sourceLanguage || !input.targetLanguage) {
    throw new AppError(400, 'PROJECT_FIELDS_REQUIRED', '项目名称、翻译方向和语言不能为空。');
  }
  if (input.sourceTemplateProjectId && input.sourceText?.trim()) {
    throw new AppError(400, 'PROJECT_SOURCE_CONFLICT', '模板项目与新导入原文不能同时使用。');
  }
  if (input.sourceTemplateProjectId) ensureProjectView(context, user, input.sourceTemplateProjectId);
  if (input.kind === 'experiment_project' && !user.roles.some((role) => role === 'admin' || role === 'teacher')) {
    throw new AppError(403, 'PROJECT_KIND_FORBIDDEN', '只有教师和管理员可以创建实验项目。');
  }
}


function setInitialWorkspacePrompt(context: AppContext, projectId: string, workspaceId: string): void {
  const rows = context.db.prepare(`SELECT pv.id, pl.prompt_kind AS kind,
      CASE WHEN ppp.id IS NULL THEN 0 ELSE 1 END AS published FROM prompt_versions pv
    JOIN prompt_lineages pl ON pl.id = pv.lineage_id
    LEFT JOIN project_prompt_publications ppp ON ppp.prompt_version_id = pv.id
      AND ppp.retired_at IS NULL
    LEFT JOIN prompt_version_archives pva ON pva.prompt_version_id = pv.id
    WHERE pl.project_id = ? AND pva.prompt_version_id IS NULL
    ORDER BY published DESC, pv.created_at DESC`).all(projectId) as Array<{ id: string; kind: string }>;
  const translation = rows.find((row) => row.kind === 'translation')?.id || null;
  const postEdit = rows.find((row) => row.kind === 'post_edit')?.id || null;
  context.db.prepare(`UPDATE project_workspaces SET active_prompt_version_id = ?,
    active_post_edit_prompt_version_id = ?, updated_at = ?, row_version = row_version + 1
    WHERE id = ?`).run(translation, postEdit, nowIso(), workspaceId);
}

function createDefaultPostEditPrompt(context: AppContext, user: AuthUser,
  projectId: string, time: string): string {
  const lineageId = newId();
  const versionId = newId();
  const content = '在不改变原意的前提下，对当前译文进行句法、衔接和表达层面的译后编辑。忽略术语替换；只输出编辑后的完整译文。';
  context.db.prepare(`INSERT INTO prompt_lineages
    (id, project_id, owner_user_id, name, created_at, prompt_kind)
    VALUES (?, ?, ?, '项目译后编辑 Prompt', ?, 'post_edit')`).run(lineageId, projectId, user.id, time);
  context.db.prepare(`INSERT INTO prompt_versions (id, lineage_id, created_by, version_number,
    title, note, content, content_hash, source_type, created_at)
    VALUES (?, ?, ?, 1, '基础译后编辑 Prompt', '项目初始化译后编辑规则', ?, ?, 'human', ?)`)
    .run(versionId, lineageId, user.id, content, sha256(content), time);
  context.db.prepare(`INSERT INTO project_prompt_publications (id, project_id, prompt_version_id,
    published_by, published_at, prompt_kind) VALUES (?, ?, ?, ?, ?, 'post_edit')`)
    .run(newId(), projectId, versionId, user.id, time);
  return versionId;
}

export async function createProject(context: AppContext, user: AuthUser, input: ProjectInput): Promise<string> {
  validateProjectInput(context, user, input);
  const id = newId();
  const time = nowIso();
  let personalAssignmentId = '';
  context.db.transaction(() => {
    context.db.prepare(`INSERT INTO projects (id, project_kind, source_template_project_id, name,
      direction, source_language, target_language, description, created_by, origin_instance_id,
      created_at, updated_at, creation_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.kind || 'class_project', input.sourceTemplateProjectId || null, input.name,
        input.direction, input.sourceLanguage, input.targetLanguage, input.description || '',
        user.id, context.instanceId, time, time, input.sourceTemplateProjectId ? 'template'
          : input.sourceText ? 'imported' : 'local');
    context.db.prepare(`INSERT INTO project_managers (project_id, user_id, assigned_by, assigned_at)
      VALUES (?, ?, ?, ?)`).run(id, user.id, user.id, time);
    if (input.sourceTemplateProjectId) {
      cloneTemplateContent(context, input.sourceTemplateProjectId, id, user.id);
    }
    insertSourceDocument(context, id, input);
    personalAssignmentId = createPersonalAssignment(context, user, id);
    createDefaultPostEditPrompt(context, user, id, time);
    recordActivity(context, { eventType: 'project.created', actorUserId: user.id, projectId: id,
      metadata: { sourceTemplateProjectId: input.sourceTemplateProjectId || null } });
  }).immediate();
  const workspaceId = createWorkspace(context, user, personalAssignmentId);
  await initializeProjectResources(context, user, id, input.setup || {});
  setInitialWorkspacePrompt(context, id, workspaceId);
  return id;
}

export function publishProject(context: AppContext, user: AuthUser, projectId: string): void {
  ensureProjectManage(context, user, projectId);
  const project = context.db.prepare('SELECT status FROM projects WHERE id = ? AND deleted_at IS NULL')
    .get(projectId) as { status: string } | undefined;
  if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', '项目不存在。');
  if (project.status === 'published') return;
  const time = nowIso();
  context.db.transaction(() => {
    context.db.prepare(`UPDATE projects SET status = 'published', published_by = ?, published_at = ?,
      updated_at = ?, row_version = row_version + 1 WHERE id = ?`).run(user.id, time, time, projectId);
    recordActivity(context, { eventType: 'project.published', actorUserId: user.id, projectId });
  }).immediate();
}

function mutableProject(context: AppContext, projectId: string): { status: string; kind: string } {
  const row = context.db.prepare(`SELECT status, project_kind AS kind FROM projects
    WHERE id = ? AND deleted_at IS NULL`).get(projectId) as { status: string; kind: string } | undefined;
  if (!row) throw new AppError(404, 'PROJECT_NOT_FOUND', '项目不存在。');
  if (row.kind === 'system_template') throw new AppError(403, 'SYSTEM_TEMPLATE_IMMUTABLE', '系统模板不能删除或取消发布。');
  return row;
}

export function unpublishProject(context: AppContext, user: AuthUser, projectId: string): void {
  ensureProjectManage(context, user, projectId);
  mutableProject(context, projectId);
  const time = nowIso();
  context.db.transaction(() => {
    context.db.prepare(`UPDATE projects SET status = 'draft', published_by = NULL, published_at = NULL,
      updated_at = ?, row_version = row_version + 1 WHERE id = ?`).run(time, projectId);
    context.db.prepare(`UPDATE project_assignments SET status = 'closed' WHERE project_id = ? AND status = 'active'
      AND (experiment_stage_id IS NOT NULL OR class_id IN (SELECT id FROM classes WHERE is_personal = 0))`).run(projectId);
    recordActivity(context, { eventType: 'project.unpublished', actorUserId: user.id, projectId });
  }).immediate();
}

export function deleteProject(context: AppContext, user: AuthUser, projectId: string): void {
  ensureProjectManage(context, user, projectId);
  mutableProject(context, projectId);
  const time = nowIso();
  context.db.transaction(() => {
    context.db.prepare(`UPDATE projects SET status = 'archived', deleted_at = ?, updated_at = ?,
      row_version = row_version + 1 WHERE id = ?`).run(time, time, projectId);
    context.db.prepare(`UPDATE project_assignments SET status = 'closed'
      WHERE project_id = ? AND status = 'active'`).run(projectId);
    context.db.prepare(`UPDATE project_workspaces SET deleted_at = ?, updated_at = ?,
      row_version = row_version + 1 WHERE project_id = ? AND deleted_at IS NULL`).run(time, time, projectId);
    recordActivity(context, { eventType: 'project.deleted', actorUserId: user.id, projectId });
  }).immediate();
}

function ensureAssignmentTarget(context: AppContext, user: AuthUser,
  classId?: string, stageId?: string): void {
  if (classId) return ensureClassManage(context, user, classId);
  const stage = context.db.prepare('SELECT experiment_id FROM experiment_stages WHERE id = ?')
    .get(stageId) as { experiment_id: string } | undefined;
  if (!stage) throw new AppError(404, 'EXPERIMENT_STAGE_NOT_FOUND', '实验阶段不存在。');
  ensureExperimentManage(context, user, stage.experiment_id);
}

function existingAssignment(context: AppContext, projectId: string,
  classId?: string, stageId?: string): string | null {
  const row = context.db.prepare(`SELECT id FROM project_assignments
    WHERE project_id = ? AND class_id IS ? AND experiment_stage_id IS ? AND status = 'active'`)
    .get(projectId, classId || null, stageId || null) as { id: string } | undefined;
  return row?.id || null;
}

export function assignProject(context: AppContext, user: AuthUser, projectId: string,
  classId?: string, stageId?: string): string {
  ensureProjectManage(context, user, projectId);
  if (Boolean(classId) === Boolean(stageId)) {
    throw new AppError(400, 'INVALID_ASSIGNMENT', '必须指定班级或实验阶段之一。');
  }
  ensureAssignmentTarget(context, user, classId, stageId);
  const existing = existingAssignment(context, projectId, classId, stageId);
  if (existing) return existing;
  const id = newId();
  context.db.prepare(`INSERT INTO project_assignments
    (id, project_id, class_id, experiment_stage_id, assigned_by, assigned_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, projectId, classId || null, stageId || null, user.id, nowIso());
  recordActivity(context, { eventType: 'project.assigned', actorUserId: user.id, projectId,
    metadata: { assignmentId: id, classId: classId || null, experimentStageId: stageId || null } });
  return id;
}

export function unassignProject(context: AppContext, user: AuthUser, assignmentId: string): void {
  const row = context.db.prepare(`SELECT project_id FROM project_assignments
    WHERE id = ? AND status = 'active'`).get(assignmentId) as { project_id: string } | undefined;
  if (!row) throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', '项目分配不存在或已移除。');
  ensureProjectManage(context, user, row.project_id);
  context.db.prepare(`UPDATE project_assignments SET status = 'closed' WHERE id = ?`)
    .run(assignmentId);
  recordActivity(context, { eventType: 'project.unassigned', actorUserId: user.id,
    projectId: row.project_id, metadata: { assignmentId } });
}

function canJoinAssignment(context: AppContext, userId: string, assignmentId: string): { project_id: string } | undefined {
  return context.db.prepare(`SELECT pa.project_id FROM project_assignments pa
    LEFT JOIN class_memberships cm ON cm.class_id = pa.class_id AND cm.user_id = ? AND cm.status = 'active'
    LEFT JOIN experiment_stages es ON es.id = pa.experiment_stage_id
    LEFT JOIN experiment_participants ep ON ep.experiment_id = es.experiment_id AND ep.user_id = ? AND ep.status = 'active'
    WHERE pa.id = ? AND pa.status = 'active' AND (cm.user_id IS NOT NULL OR ep.user_id IS NOT NULL)`)
    .get(userId, userId, assignmentId) as { project_id: string } | undefined;
}

export function createWorkspace(context: AppContext, user: AuthUser, assignmentId: string): string {
  const assignment = canJoinAssignment(context, user.id, assignmentId);
  if (!assignment) throw new AppError(403, 'ASSIGNMENT_FORBIDDEN', '当前用户不属于此项目发布范围。');
  const existing = context.db.prepare('SELECT id FROM project_workspaces WHERE assignment_id = ? AND owner_user_id = ?')
    .get(assignmentId, user.id) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = newId();
  const time = nowIso();
  context.db.prepare(`INSERT INTO project_workspaces
    (id, project_id, assignment_id, owner_user_id, origin_instance_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, assignment.project_id, assignmentId, user.id, context.instanceId, time, time);
  setInitialWorkspacePrompt(context, assignment.project_id, id);
  recordActivity(context, { eventType: 'workspace.created', actorUserId: user.id,
    projectId: assignment.project_id, workspaceId: id });
  return id;
}

export function openProjectWorkspace(context: AppContext, user: AuthUser, projectId: string): string {
  ensureProjectView(context, user, projectId);
  const existing = userWorkspace(context, user.id, projectId);
  if (existing) return existing.id;
  const assignment = eligibleAssignment(context, user.id, projectId);
  if (assignment) return createWorkspace(context, user, assignment.id);
  ensureProjectManage(context, user, projectId);
  return createWorkspace(context, user, createPersonalAssignment(context, user, projectId));
}

export function projectDetail(context: AppContext, user: AuthUser, projectId: string): unknown {
  ensureProjectView(context, user, projectId);
  const project = context.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  const documents = context.db.prepare('SELECT * FROM documents WHERE project_id = ? ORDER BY document_order').all(projectId);
  const segments = context.db.prepare(`SELECT s.* FROM segments s JOIN documents d ON d.id = s.document_id
    WHERE d.project_id = ? ORDER BY d.document_order, s.segment_order`).all(projectId);
  return { project, documents, segments };
}
