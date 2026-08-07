/**
 * 职责: 管理私有 Prompt、系统模板继承、候选提交和教师 overarching Prompt 发布/取消及安全归档
 * 依赖内部: ../auth/types.ts, ../context.ts, ../errors.ts, ../shared.ts, ./access.ts, ./activity.ts
 * 依赖外部: 无
 * 暴露: PromptKind | listVisiblePrompts | createPromptVersion | submitPrompt | publishPrompt | unpublishPrompt | archivePromptVersion | restorePromptVersion | selectWorkspacePrompt
 */

import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { jsonText, newId, nowIso, sha256 } from '../shared.js';
import { ensureProjectManage, ensureProjectView, ensureWorkspaceOwner } from './access.js';
import { recordActivity } from './activity.js';

export type PromptKind = 'translation' | 'post_edit';
export interface PromptInput {
  lineageId?: string;
  parentVersionId?: string;
  title: string;
  note?: string;
  content: string;
  sourceType?: 'human' | 'ai_generated';
  requestId?: string;
  provider?: string;
  model?: string;
  aiRunId?: string;
  promptKind?: PromptKind;
}

function ensurePromptCreateAccess(context: AppContext, user: AuthUser, projectId: string): void {
  ensureProjectView(context, user, projectId);
  const project = context.db.prepare('SELECT project_kind FROM projects WHERE id = ?')
    .get(projectId) as { project_kind: string } | undefined;
  if (project?.project_kind === 'system_template' && !user.roles.includes('admin')) {
    throw new AppError(403, 'SYSTEM_TEMPLATE_READ_ONLY', '系统模板为只读，请先克隆为教学项目。');
  }
}

function ownsLineage(context: AppContext, userId: string, projectId: string, lineageId: string): boolean {
  return Boolean(context.db.prepare(`SELECT 1 FROM prompt_lineages
    WHERE id = ? AND owner_user_id = ? AND project_id = ?`).get(lineageId, userId, projectId));
}

function canViewPublishedHistory(context: AppContext, user: AuthUser, projectId: string): boolean {
  if (user.roles.includes('admin')) return true;
  return Boolean(context.db.prepare(`SELECT 1 FROM project_managers WHERE project_id = ? AND user_id = ?
    UNION SELECT 1 FROM project_assignments pa JOIN class_memberships cm ON cm.class_id = pa.class_id
    WHERE pa.project_id = ? AND pa.status = 'active' AND cm.user_id = ?
      AND cm.membership_role = 'teacher' AND cm.status = 'active'`).get(projectId, user.id, projectId, user.id));
}

function promptKind(input: PromptInput): PromptKind {
  return input.promptKind === 'post_edit' ? 'post_edit' : 'translation';
}

function ensureLineage(context: AppContext, user: AuthUser, projectId: string, input: PromptInput): string {
  if (input.lineageId) {
    if (!ownsLineage(context, user.id, projectId, input.lineageId)) throw new AppError(403, 'PROMPT_LINEAGE_FORBIDDEN', '不能修改其他用户的 Prompt 谱系。');
    return input.lineageId;
  }
  const id = newId();
  context.db.prepare(`INSERT INTO prompt_lineages
    (id, project_id, owner_user_id, name, created_at, prompt_kind)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, projectId, user.id, input.title, nowIso(), promptKind(input));
  return id;
}

function nextVersion(context: AppContext, projectId: string, kind: PromptKind): number {
  const row = context.db.prepare(`SELECT COALESCE(MAX(pv.version_number), 0) + 1 AS version
    FROM prompt_versions pv JOIN prompt_lineages pl ON pl.id = pv.lineage_id
    WHERE pl.project_id = ? AND pl.prompt_kind = ?`).get(projectId, kind) as { version: number };
  return row.version;
}

function insertAiRun(context: AppContext, user: AuthUser, projectId: string, input: PromptInput): string | null {
  if (input.aiRunId) {
    const run = context.db.prepare(`SELECT id FROM ai_runs WHERE id = ? AND project_id = ?
      AND actor_user_id = ? AND status = 'succeeded'`).get(input.aiRunId, projectId, user.id);
    if (!run) throw new AppError(400, 'AI_RUN_INVALID', 'Prompt 生成记录无效。');
    return input.aiRunId;
  }
  if (input.sourceType !== 'ai_generated' || !input.requestId) return null;
  const id = newId();
  const time = nowIso();
  context.db.prepare(`INSERT INTO ai_runs (id, operation_type, actor_user_id, project_id,
    provider, model, request_id, input_hash, output_text, status, started_at, completed_at)
    VALUES (?, 'prompt_generate', ?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?)`)
    .run(id, user.id, projectId, input.provider || 'mock', input.model || 'mock', input.requestId,
      sha256(input.content), input.content, time, time);
  return id;
}

function existingPromptRequest(context: AppContext, userId: string, requestId?: string): string | null {
  if (!requestId) return null;
  const row = context.db.prepare(`SELECT prompt_version_id AS id FROM activity_events
    WHERE actor_user_id = ? AND request_id = ? AND event_type IN ('prompt.saved', 'prompt.generated')`)
    .get(userId, requestId) as { id: string } | undefined;
  return row?.id || null;
}

function validatedParent(context: AppContext, user: AuthUser, projectId: string,
  input: PromptInput): string | null {
  if (!input.parentVersionId) return null;
  const parent = context.db.prepare(`SELECT pv.lineage_id AS lineageId, pl.project_id AS projectId,
      pl.prompt_kind AS promptKind
    FROM prompt_versions pv JOIN prompt_lineages pl ON pl.id = pv.lineage_id WHERE pv.id = ?`)
    .get(input.parentVersionId) as { lineageId: string; projectId: string; promptKind: PromptKind } | undefined;
  if (!parent) throw new AppError(404, 'PROMPT_PARENT_NOT_FOUND', '父 Prompt 不存在。');
  const visible = listVisiblePrompts(context, user, parent.projectId) as Array<{ id: string; archivedAt?: string }>;
  if (!visible.some((item) => item.id === input.parentVersionId && !item.archivedAt)) {
    throw new AppError(403, 'PROMPT_PARENT_FORBIDDEN', '不能继承不可见的 Prompt。');
  }
  if (input.lineageId && parent.lineageId !== input.lineageId) {
    throw new AppError(400, 'PROMPT_PARENT_LINEAGE_MISMATCH', '父 Prompt 与所选谱系不一致。');
  }
  if (parent.promptKind !== promptKind(input)) {
    throw new AppError(400, 'PROMPT_KIND_MISMATCH', '翻译与译后编辑 Prompt 不能相互继承。');
  }
  return input.parentVersionId;
}
export function createPromptVersion(context: AppContext, user: AuthUser, projectId: string, input: PromptInput): string {
  ensurePromptCreateAccess(context, user, projectId);
  const existing = existingPromptRequest(context, user.id, input.requestId);
  const parentVersionId = validatedParent(context, user, projectId, input);
  if (existing) return existing;
  const id = newId();
  context.db.transaction(() => {
    const lineageId = ensureLineage(context, user, projectId, input);
    const aiRunId = insertAiRun(context, user, projectId, input);
    context.db.prepare(`INSERT INTO prompt_versions (id, lineage_id, parent_version_id, created_by,
      ai_run_id, version_number, title, note, content, content_hash, source_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, lineageId, parentVersionId, user.id, aiRunId, nextVersion(context, projectId, promptKind(input)),
        input.title, input.note || '', input.content, sha256(input.content), input.sourceType || 'human', nowIso());
    recordActivity(context, { eventType: input.sourceType === 'ai_generated' ? 'prompt.generated' : 'prompt.saved',
      actorUserId: user.id, projectId, promptVersionId: id, requestId: input.requestId });
  }).immediate();
  return id;
}

export function submitPrompt(context: AppContext, user: AuthUser, promptVersionId: string): string {
  const row = context.db.prepare(`SELECT pl.project_id, pl.owner_user_id FROM prompt_versions pv
    JOIN prompt_lineages pl ON pl.id = pv.lineage_id
    LEFT JOIN prompt_version_archives pva ON pva.prompt_version_id = pv.id
    WHERE pv.id = ? AND pva.prompt_version_id IS NULL`).get(promptVersionId) as
    { project_id: string; owner_user_id: string } | undefined;
  if (!row || row.owner_user_id !== user.id) throw new AppError(403, 'PROMPT_SUBMIT_FORBIDDEN', '只能提交自己的 Prompt。');
  const existing = context.db.prepare(`SELECT id FROM prompt_submissions
    WHERE prompt_version_id = ? AND submitted_by = ?`).get(promptVersionId, user.id) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = newId();
  context.db.prepare(`INSERT INTO prompt_submissions
    (id, prompt_version_id, submitted_by, status, submitted_at) VALUES (?, ?, ?, 'submitted', ?)`)
    .run(id, promptVersionId, user.id, nowIso());
  recordActivity(context, { eventType: 'prompt.submitted', actorUserId: user.id,
    projectId: row.project_id, promptVersionId });
  return id;
}

export function publishPrompt(context: AppContext, user: AuthUser, projectId: string, promptVersionId: string): string {
  ensureProjectManage(context, user, projectId);
  const version = context.db.prepare(`SELECT pl.prompt_kind AS promptKind FROM prompt_versions pv JOIN prompt_lineages pl ON pl.id = pv.lineage_id
    LEFT JOIN prompt_version_archives pva ON pva.prompt_version_id = pv.id
    WHERE pv.id = ? AND pl.project_id = ? AND pva.prompt_version_id IS NULL`).get(promptVersionId, projectId);
  if (!version) throw new AppError(400, 'PROMPT_PROJECT_MISMATCH', 'Prompt 不属于此项目。');
  const kind = (version as { promptKind: PromptKind }).promptKind;
  const active = context.db.prepare(`SELECT id FROM project_prompt_publications
    WHERE project_id = ? AND prompt_version_id = ? AND prompt_kind = ? AND retired_at IS NULL`)
    .get(projectId, promptVersionId, kind) as { id: string } | undefined;
  if (active) return active.id;
  const id = newId();
  const time = nowIso();
  context.db.transaction(() => {
    context.db.prepare(`UPDATE project_prompt_publications SET retired_at = ?
      WHERE project_id = ? AND prompt_kind = ? AND retired_at IS NULL`).run(time, projectId, kind);
    context.db.prepare(`INSERT INTO project_prompt_publications
      (id, project_id, prompt_version_id, published_by, published_at, prompt_kind)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, projectId, promptVersionId, user.id, time, kind);
    context.db.prepare(`UPDATE prompt_submissions SET status = 'accepted', reviewed_by = ?, reviewed_at = ?
      WHERE prompt_version_id = ? AND status = 'submitted'`).run(user.id, time, promptVersionId);
    recordActivity(context, { eventType: 'prompt.published', actorUserId: user.id,
      projectId, promptVersionId });
  }).immediate();
  return id;
}


export function unpublishPrompt(context: AppContext, user: AuthUser, projectId: string,
  promptVersionId: string): void {
  ensureProjectManage(context, user, projectId);
  const time = nowIso();
  const result = context.db.prepare(`UPDATE project_prompt_publications SET retired_at = ?
    WHERE project_id = ? AND prompt_version_id = ? AND retired_at IS NULL`)
    .run(time, projectId, promptVersionId);
  if (!result.changes) throw new AppError(404, 'PROMPT_PUBLICATION_NOT_FOUND', '该 Prompt 当前未发布。');
  recordActivity(context, { eventType: 'prompt.unpublished', actorUserId: user.id,
    projectId, promptVersionId });
}

function promptArchiveRow(context: AppContext, promptVersionId: string) {
  return context.db.prepare(`SELECT pl.project_id AS projectId, pl.owner_user_id AS ownerUserId
    FROM prompt_versions pv JOIN prompt_lineages pl ON pl.id = pv.lineage_id WHERE pv.id = ?`)
    .get(promptVersionId) as { projectId: string; ownerUserId: string | null } | undefined;
}

export function archivePromptVersion(context: AppContext, user: AuthUser,
  promptVersionId: string): void {
  const row = promptArchiveRow(context, promptVersionId);
  if (!row) throw new AppError(404, 'PROMPT_NOT_FOUND', 'Prompt 版本不存在。');
  if (row.ownerUserId !== user.id) ensureProjectManage(context, user, row.projectId);
  const published = context.db.prepare(`SELECT 1 FROM project_prompt_publications
    WHERE prompt_version_id = ? AND retired_at IS NULL`).get(promptVersionId);
  if (published) throw new AppError(409, 'PROMPT_STILL_PUBLISHED', '请先取消发布，再删除此 Prompt。');
  const active = context.db.prepare(`SELECT 1 FROM project_workspaces
    WHERE (active_prompt_version_id = ? OR active_post_edit_prompt_version_id = ?)
      AND deleted_at IS NULL`).get(promptVersionId, promptVersionId);
  if (active) throw new AppError(409, 'PROMPT_STILL_ACTIVE', '请先将使用该版本的工作空间切换到其他 Prompt。');
  context.db.prepare(`INSERT OR IGNORE INTO prompt_version_archives
    (prompt_version_id, archived_by, archived_at, reason) VALUES (?, ?, ?, 'user_archived')`)
    .run(promptVersionId, user.id, nowIso());
  recordActivity(context, { eventType: 'prompt.archived', actorUserId: user.id,
    projectId: row.projectId, promptVersionId });
}
function inheritTemplatePrompt(context: AppContext, user: AuthUser,
  projectId: string, promptVersionId: string, kind: PromptKind): string | null {
  if (!user.roles.some((role) => role === 'admin' || role === 'teacher')) return null;
  const source = context.db.prepare(`SELECT pv.title, pv.content, pl.prompt_kind AS promptKind FROM prompt_versions pv
    JOIN prompt_lineages pl ON pl.id = pv.lineage_id JOIN projects p ON p.id = pl.project_id
    WHERE pv.id = ? AND p.project_kind = 'system_template' AND p.deleted_at IS NULL`)
    .get(promptVersionId) as { title: string; content: string; promptKind: PromptKind } | undefined;
  if (!source || source.promptKind !== kind) return null;
  ensureProjectManage(context, user, projectId);
  return createPromptVersion(context, user, projectId, { title: `继承：${source.title}`,
    note: '从系统模板 Prompt 继承；后续修改不会影响模板。', content: source.content,
    promptKind: kind });
}

export function restorePromptVersion(context: AppContext, user: AuthUser,
  promptVersionId: string): void {
  const row = promptArchiveRow(context, promptVersionId);
  if (!row) throw new AppError(404, 'PROMPT_NOT_FOUND', 'Prompt 版本不存在。');
  if (row.ownerUserId !== user.id) ensureProjectManage(context, user, row.projectId);
  const result = context.db.prepare('DELETE FROM prompt_version_archives WHERE prompt_version_id = ?')
    .run(promptVersionId);
  if (!result.changes) throw new AppError(404, 'PROMPT_ARCHIVE_NOT_FOUND', '该 Prompt 未归档。');
  recordActivity(context, { eventType: 'prompt.restored', actorUserId: user.id,
    projectId: row.projectId, promptVersionId });
}

export function selectWorkspacePrompt(context: AppContext, user: AuthUser, workspaceId: string,
  promptVersionId: string, requestId?: string, kind: PromptKind = 'translation'): void {
  ensureWorkspaceOwner(context, user, workspaceId);
  const workspace = context.db.prepare(`SELECT project_id FROM project_workspaces
    WHERE id = ? AND deleted_at IS NULL`).get(workspaceId) as { project_id: string } | undefined;
  if (!workspace) throw new AppError(404, 'WORKSPACE_NOT_FOUND', '工作空间不存在。');
  const visible = listVisiblePrompts(context, user, workspace.project_id) as Array<{ id: string; archivedAt?: string; promptKind: PromptKind }>;
  const localPrompt = visible.some((prompt) => prompt.id === promptVersionId
    && prompt.promptKind === kind && !prompt.archivedAt)
    ? promptVersionId : null;
  const selectedId = localPrompt || inheritTemplatePrompt(context, user, workspace.project_id, promptVersionId, kind);
  if (!selectedId) throw new AppError(403, 'PROMPT_NOT_VISIBLE', '此 Prompt 不能用于当前工作空间。');
  const column = kind === 'post_edit' ? 'active_post_edit_prompt_version_id' : 'active_prompt_version_id';
  context.db.prepare(`UPDATE project_workspaces SET ${column} = ?,
    row_version = row_version + 1, updated_at = ? WHERE id = ?`)
    .run(selectedId, nowIso(), workspaceId);
  recordActivity(context, { eventType: 'prompt.activated', actorUserId: user.id,
    projectId: workspace.project_id, workspaceId, promptVersionId: selectedId, requestId,
    metadata: { promptKind: kind, inheritedFromPromptVersionId: localPrompt ? null : promptVersionId } });
}

export function listVisiblePrompts(context: AppContext, user: AuthUser, projectId: string): unknown[] {
  ensureProjectView(context, user, projectId);
  const historyViewer = canViewPublishedHistory(context, user, projectId) ? 1 : 0;
  const templateViewer = user.roles.some((role) => role === 'admin' || role === 'teacher')
    && Boolean(context.db.prepare("SELECT 1 FROM projects WHERE id = ? AND project_kind = 'system_template'").get(projectId));
  return context.db.prepare(`SELECT pv.*, pl.owner_user_id AS ownerUserId,
      pl.prompt_kind AS promptKind,
      ps.status AS submissionStatus, ppp.published_at AS publishedAt,
      pva.archived_at AS archivedAt, parent.title AS parentTitle,
      parent_project.name AS parentProjectName
    FROM prompt_versions pv JOIN prompt_lineages pl ON pl.id = pv.lineage_id
    LEFT JOIN prompt_versions parent ON parent.id = pv.parent_version_id
    LEFT JOIN prompt_lineages parent_lineage ON parent_lineage.id = parent.lineage_id
    LEFT JOIN projects parent_project ON parent_project.id = parent_lineage.project_id
    LEFT JOIN prompt_submissions ps ON ps.prompt_version_id = pv.id
    LEFT JOIN project_prompt_publications ppp ON ppp.prompt_version_id = pv.id AND ppp.retired_at IS NULL
    LEFT JOIN prompt_version_archives pva ON pva.prompt_version_id = pv.id
    WHERE pl.project_id = ? AND (pl.owner_user_id = ? OR ppp.id IS NOT NULL OR ? = 1 OR
      (? = 1 AND EXISTS (SELECT 1 FROM project_prompt_publications history
        WHERE history.prompt_version_id = pv.id)))
    ORDER BY pv.created_at`).all(projectId, user.id, templateViewer ? 1 : 0, historyViewer);
}
