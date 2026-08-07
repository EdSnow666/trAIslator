/**
 * 职责: 创建不可变 AI/人工译文版本、当前版本指针与 AI 修改决策
 * 依赖内部: ../auth/types.ts, ../context.ts, ../errors.ts, ../shared.ts, ./access.ts, ./activity.ts
 * 依赖外部: 无
 * 暴露: saveHumanPostEdit | recordGeneratedTranslation | finalizeAiTranslation | addReferenceTranslation | selectCurrentVersion | confirmWorkspaceTranslations | submitWorkspaceTranslations | saveAiDecision | workspaceTranslations
 */

import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { jsonText, newId, nowIso, sha256 } from '../shared.js';
import { ensureProjectManage, ensureWorkspaceOwner, ensureWorkspaceView } from './access.js';
import { recordActivity } from './activity.js';

interface WorkspaceRow { id: string; project_id: string; owner_user_id: string }
interface VersionInput {
  segmentId: string;
  content: string;
  parentVersionId?: string;
  baseVersionId?: string;
  promptVersionId?: string;
}

export interface GeneratedTranslationInput extends VersionInput {
  kind: 'ai_translation' | 'ai_post_edit';
  requestId: string;
  provider: string;
  model: string;
  context?: unknown;
}

export interface ExecutedTranslationInput extends VersionInput {
  kind: 'ai_translation' | 'ai_post_edit';
}

function workspace(context: AppContext, workspaceId: string): WorkspaceRow {
  const row = context.db.prepare(`SELECT id, project_id, owner_user_id FROM project_workspaces
    WHERE id = ? AND deleted_at IS NULL`).get(workspaceId) as WorkspaceRow | undefined;
  if (!row) throw new AppError(404, 'WORKSPACE_NOT_FOUND', '工作空间不存在。');
  return row;
}

function ensureSegmentProject(context: AppContext, segmentId: string, projectId: string): void {
  const row = context.db.prepare(`SELECT 1 FROM segments s JOIN documents d ON d.id = s.document_id
    WHERE s.id = ? AND d.project_id = ?`).get(segmentId, projectId);
  if (!row) throw new AppError(400, 'SEGMENT_PROJECT_MISMATCH', '句段不属于当前项目。');
}

function ensureVersionAccessible(context: AppContext, versionId: string | undefined, workspaceId: string, projectId: string): void {
  if (!versionId) return;
  const row = context.db.prepare(`SELECT 1 FROM translation_versions
    WHERE id = ? AND project_id = ? AND (workspace_id = ? OR scope_type = 'project')`)
    .get(versionId, projectId, workspaceId);
  if (!row) throw new AppError(400, 'VERSION_FORBIDDEN', '基础译文版本不可用。');
}

function existingActivityVersion(context: AppContext, userId: string, eventType: string, requestId: string): string | null {
  const row = context.db.prepare(`SELECT translation_version_id AS id FROM activity_events
    WHERE actor_user_id = ? AND event_type = ? AND request_id = ?`)
    .get(userId, eventType, requestId) as { id: string } | undefined;
  return row?.id || null;
}

function insertVersion(context: AppContext, userId: string | null, projectId: string, workspaceId: string | null,
  input: VersionInput, kind: string, aiRunId: string | null, scope: 'project' | 'workspace'): string {
  const id = newId();
  context.db.prepare(`INSERT INTO translation_versions (id, project_id, workspace_id, segment_id,
    parent_version_id, base_translation_version_id, prompt_version_id, ai_run_id, version_kind,
    scope_type, content, content_hash, created_by, origin_instance_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, projectId, workspaceId, input.segmentId, input.parentVersionId || null,
      input.baseVersionId || null, input.promptVersionId || null, aiRunId, kind, scope,
      input.content, sha256(input.content), userId, context.instanceId, nowIso());
  return id;
}

function setCurrentState(context: AppContext, workspaceId: string, segmentId: string, versionId: string, status: string): void {
  context.db.prepare(`INSERT INTO workspace_segment_states
    (workspace_id, segment_id, current_translation_version_id, status, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, segment_id) DO UPDATE SET current_translation_version_id = excluded.current_translation_version_id,
      status = excluded.status, updated_at = excluded.updated_at`)
    .run(workspaceId, segmentId, versionId, status, nowIso());
}

export function saveHumanPostEdit(context: AppContext, user: AuthUser, workspaceId: string,
  input: VersionInput & { requestId: string }): string {
  ensureWorkspaceOwner(context, user, workspaceId);
  const currentWorkspace = workspace(context, workspaceId);
  ensureSegmentProject(context, input.segmentId, currentWorkspace.project_id);
  ensureVersionAccessible(context, input.parentVersionId, workspaceId, currentWorkspace.project_id);
  const existing = existingActivityVersion(context, user.id, 'translation.human_post_edit_saved', input.requestId);
  if (existing) return existing;
  let versionId = '';
  context.db.transaction(() => {
    versionId = insertVersion(context, user.id, currentWorkspace.project_id, workspaceId,
      input, 'human_post_edit', null, 'workspace');
    setCurrentState(context, workspaceId, input.segmentId, versionId, 'human_edited');
    recordActivity(context, { eventType: 'translation.human_post_edit_saved', actorUserId: user.id,
      projectId: currentWorkspace.project_id, workspaceId, segmentId: input.segmentId,
      translationVersionId: versionId, requestId: input.requestId });
  }).immediate();
  return versionId;
}

function insertAiRun(context: AppContext, user: AuthUser, row: WorkspaceRow, input: GeneratedTranslationInput): string {
  const id = newId();
  const time = nowIso();
  context.db.prepare(`INSERT INTO ai_runs (id, operation_type, actor_user_id, project_id, workspace_id,
    segment_id, prompt_version_id, provider, model, request_id, input_hash, context_manifest_json,
    output_text, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?)`)
    .run(id, input.kind === 'ai_post_edit' ? 'ai_post_edit' : 'translation_generate', user.id,
      row.project_id, row.id, input.segmentId, input.promptVersionId || null, input.provider, input.model,
      input.requestId, sha256(input.content), jsonText(input.context), input.content, time, time);
  return id;
}

export function recordGeneratedTranslation(context: AppContext, user: AuthUser, workspaceId: string,
  input: GeneratedTranslationInput): string {
  ensureWorkspaceOwner(context, user, workspaceId);
  const row = workspace(context, workspaceId);
  ensureSegmentProject(context, input.segmentId, row.project_id);
  ensureVersionAccessible(context, input.baseVersionId, workspaceId, row.project_id);
  const existingRun = context.db.prepare('SELECT id FROM ai_runs WHERE request_id = ?').get(input.requestId) as { id: string } | undefined;
  if (existingRun) {
    const version = context.db.prepare('SELECT id FROM translation_versions WHERE ai_run_id = ?').get(existingRun.id) as { id: string };
    return version.id;
  }
  let versionId = '';
  context.db.transaction(() => {
    const runId = insertAiRun(context, user, row, input);
    versionId = insertVersion(context, user.id, row.project_id, workspaceId, input, input.kind, runId, 'workspace');
    setCurrentState(context, workspaceId, input.segmentId, versionId,
      input.kind === 'ai_post_edit' ? 'ai_edited' : 'translated');
    recordActivity(context, { eventType: input.kind === 'ai_post_edit' ? 'translation.ai_post_edit_generated' : 'translation.generated',
      actorUserId: user.id, projectId: row.project_id, workspaceId, segmentId: input.segmentId,
      translationVersionId: versionId, requestId: input.requestId });
  }).immediate();
  return versionId;
}

function ensurePendingRun(context: AppContext, user: AuthUser, workspaceId: string, runId: string): void {
  const row = context.db.prepare(`SELECT 1 FROM ai_runs
    WHERE id = ? AND workspace_id = ? AND actor_user_id = ? AND status = 'pending'`)
    .get(runId, workspaceId, user.id);
  if (!row) throw new AppError(409, 'AI_RUN_NOT_PENDING', 'AI 任务不存在或已完成。');
}

export function finalizeAiTranslation(context: AppContext, user: AuthUser, workspaceId: string,
  input: ExecutedTranslationInput, runId: string, tokenUsage: unknown, latencyMs: number): string {
  ensureWorkspaceOwner(context, user, workspaceId);
  const row = workspace(context, workspaceId);
  ensureSegmentProject(context, input.segmentId, row.project_id);
  ensureVersionAccessible(context, input.baseVersionId, workspaceId, row.project_id);
  const existing = context.db.prepare('SELECT id FROM translation_versions WHERE ai_run_id = ?')
    .get(runId) as { id: string } | undefined;
  if (existing) return existing.id;
  ensurePendingRun(context, user, workspaceId, runId);
  let versionId = '';
  context.db.transaction(() => {
    context.db.prepare(`UPDATE ai_runs SET status = 'succeeded', output_text = ?, token_usage_json = ?,
      latency_ms = ?, completed_at = ? WHERE id = ?`)
      .run(input.content, jsonText(tokenUsage), latencyMs, nowIso(), runId);
    versionId = insertVersion(context, user.id, row.project_id, workspaceId, input, input.kind, runId, 'workspace');
    setCurrentState(context, workspaceId, input.segmentId, versionId,
      input.kind === 'ai_post_edit' ? 'ai_edited' : 'translated');
    recordActivity(context, { eventType: input.kind === 'ai_post_edit' ? 'translation.ai_post_edit_generated' : 'translation.generated',
      actorUserId: user.id, projectId: row.project_id, workspaceId, segmentId: input.segmentId,
      translationVersionId: versionId, promptVersionId: input.promptVersionId || null, metadata: { aiRunId: runId } });
  }).immediate();
  return versionId;
}
export function addReferenceTranslation(context: AppContext, user: AuthUser, projectId: string, input: VersionInput): string {
  ensureProjectManage(context, user, projectId);
  ensureSegmentProject(context, input.segmentId, projectId);
  const id = insertVersion(context, user.id, projectId, null, input, 'manual_reference', null, 'project');
  recordActivity(context, { eventType: 'translation.reference_added', actorUserId: user.id,
    projectId, segmentId: input.segmentId, translationVersionId: id });
  return id;
}

export function selectCurrentVersion(context: AppContext, user: AuthUser, workspaceId: string,
  segmentId: string, versionId: string, requestId?: string): void {
  ensureWorkspaceOwner(context, user, workspaceId);
  const row = workspace(context, workspaceId);
  ensureVersionAccessible(context, versionId, workspaceId, row.project_id);
  setCurrentState(context, workspaceId, segmentId, versionId, 'translated');
  recordActivity(context, { eventType: 'translation.current_selected', actorUserId: user.id,
    projectId: row.project_id, workspaceId, segmentId, translationVersionId: versionId, requestId });
}

function currentStates(context: AppContext, workspaceId: string, segmentIds?: string[]) {
  const rows = context.db.prepare(`SELECT segment_id AS segmentId,
      current_translation_version_id AS versionId FROM workspace_segment_states
    WHERE workspace_id = ? AND current_translation_version_id IS NOT NULL`).all(workspaceId) as
    Array<{ segmentId: string; versionId: string }>;
  return segmentIds?.length ? rows.filter((row) => segmentIds.includes(row.segmentId)) : rows;
}

export function confirmWorkspaceTranslations(context: AppContext, user: AuthUser,
  workspaceId: string, segmentIds?: string[]): number {
  ensureWorkspaceOwner(context, user, workspaceId);
  const row = workspace(context, workspaceId);
  const states = currentStates(context, workspaceId, segmentIds);
  const update = context.db.prepare(`UPDATE workspace_segment_states SET status = 'confirmed', updated_at = ?
    WHERE workspace_id = ? AND segment_id = ?`);
  context.db.transaction(() => states.forEach((state) => update.run(nowIso(), workspaceId, state.segmentId))).immediate();
  recordActivity(context, { eventType: 'translation.batch_confirmed', actorUserId: user.id,
    projectId: row.project_id, workspaceId, metadata: { count: states.length } });
  return states.length;
}

export function submitWorkspaceTranslations(context: AppContext, user: AuthUser,
  workspaceId: string, segmentIds?: string[]): number {
  ensureWorkspaceOwner(context, user, workspaceId);
  const row = workspace(context, workspaceId);
  const states = currentStates(context, workspaceId, segmentIds);
  const insert = context.db.prepare(`INSERT OR IGNORE INTO translation_submissions
    (id, project_id, workspace_id, segment_id, translation_version_id, submitted_by, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  context.db.transaction(() => states.forEach((state) => insert.run(newId(), row.project_id, workspaceId,
    state.segmentId, state.versionId, user.id, nowIso()))).immediate();
  recordActivity(context, { eventType: 'translation.batch_submitted', actorUserId: user.id,
    projectId: row.project_id, workspaceId, metadata: { count: states.length } });
  return states.length;
}

export function saveAiDecision(context: AppContext, user: AuthUser, workspaceId: string,
  aiVersionId: string, changeId: string, decision: 'accepted' | 'rejected', requestId?: string): void {
  ensureWorkspaceOwner(context, user, workspaceId);
  const row = workspace(context, workspaceId);
  ensureVersionAccessible(context, aiVersionId, workspaceId, row.project_id);
  context.db.prepare(`INSERT INTO ai_change_decisions
    (id, ai_edit_version_id, workspace_id, change_id, decision, decided_by, decided_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ai_edit_version_id, change_id, decided_by)
    DO UPDATE SET decision = excluded.decision, decided_at = excluded.decided_at`)
    .run(newId(), aiVersionId, workspaceId, changeId, decision, user.id, nowIso());
  recordActivity(context, { eventType: `translation.ai_change_${decision}`, actorUserId: user.id,
    projectId: row.project_id, workspaceId, translationVersionId: aiVersionId,
    requestId, metadata: { changeId } });
}

export function workspaceTranslations(context: AppContext, user: AuthUser, workspaceId: string): unknown[] {
  ensureWorkspaceView(context, user, workspaceId);
  const row = workspace(context, workspaceId);
  return context.db.prepare(`SELECT tv.*, wss.current_translation_version_id = tv.id AS isCurrent
    FROM translation_versions tv LEFT JOIN workspace_segment_states wss
      ON wss.workspace_id = ? AND wss.segment_id = tv.segment_id
    WHERE tv.project_id = ? AND (tv.workspace_id = ? OR tv.scope_type = 'project')
    ORDER BY tv.segment_id, tv.created_at`).all(workspaceId, row.project_id, workspaceId);
}
