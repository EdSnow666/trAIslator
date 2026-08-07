/**
 * 职责: 创建不可变译文、稳定 Diff 基线、当前指针及原子确认/提交与 AI 决策事件
 * 依赖内部: ../auth/types.ts, ../context.ts, ../errors.ts, ../shared.ts, ./access.ts, ./activity.ts, ./translation-diffs.ts
 * 依赖外部: 无
 * 暴露: saveHumanPostEdit | recordGeneratedTranslation | finalizeAiTranslation | addReferenceTranslation | selectCurrentVersion | transitionWorkspaceTranslations | saveAiDecision | workspaceTranslations
 */

import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { jsonText, newId, nowIso, sha256 } from '../shared.js';
import { ensureProjectManage, ensureWorkspaceOwner, ensureWorkspaceView } from './access.js';
import { recordActivity } from './activity.js';
import { createVersionDiffArtifacts, latestVersionDiff } from './translation-diffs.js';

interface WorkspaceRow { id: string; project_id: string; owner_user_id: string }
interface VersionInput {
  segmentId: string;
  content: string;
  parentVersionId?: string;
  baseVersionId?: string;
  promptVersionId?: string;
  expectedVersionId?: string;
}

export interface TranslationEditInput extends VersionInput { requestId: string }
export interface TranslationTransitionInput {
  action: 'confirm' | 'submit'; segmentIds?: string[]; edits?: TranslationEditInput[]; requestId: string;
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

function ensureVersionAccessible(context: AppContext, versionId: string | undefined,
  workspaceId: string, projectId: string, segmentId?: string): void {
  if (!versionId) return;
  const row = context.db.prepare(`SELECT 1 FROM translation_versions
    WHERE id = ? AND project_id = ? AND (? IS NULL OR segment_id = ?)
      AND (workspace_id = ? OR scope_type = 'project')`)
    .get(versionId, projectId, segmentId || null, segmentId || null, workspaceId);
  if (!row) throw new AppError(400, 'VERSION_FORBIDDEN', '基础译文版本不可用。');
}

function existingActivityVersion(context: AppContext, userId: string, eventType: string, requestId: string): string | null {
  const row = context.db.prepare(`SELECT translation_version_id AS id FROM activity_events
    WHERE actor_user_id = ? AND event_type = ? AND request_id = ?`)
    .get(userId, eventType, requestId) as { id: string } | undefined;
  return row?.id || null;
}

function nearestMachineVersion(context: AppContext, versionId?: string): string | null {
  let currentId = versionId || null;
  while (currentId) {
    const row = context.db.prepare(`SELECT id, parent_version_id AS parentId, version_kind AS kind
      FROM translation_versions WHERE id = ?`).get(currentId) as
      { id: string; parentId: string | null; kind: string } | undefined;
    if (!row) return null;
    if (['ai_translation', 'ai_post_edit'].includes(row.kind)) return row.id;
    currentId = row.parentId;
  }
  return null;
}

function traceLinks(context: AppContext, input: VersionInput, kind: string, id: string) {
  const anchorId = input.parentVersionId || input.baseVersionId;
  const anchor = anchorId ? context.db.prepare(`SELECT id, root_translation_version_id AS rootId
    FROM translation_versions WHERE id = ?`).get(anchorId) as
    { id: string; rootId: string | null } | undefined : undefined;
  const rootId = anchor?.rootId || anchor?.id || id;
  if (kind === 'ai_post_edit') return { rootId, comparisonId: anchor?.id || null };
  if (kind === 'human_post_edit') return { rootId,
    comparisonId: nearestMachineVersion(context, anchor?.id) };
  return { rootId: id, comparisonId: null };
}

function insertVersion(context: AppContext, userId: string | null, projectId: string, workspaceId: string | null,
  input: VersionInput, kind: string, aiRunId: string | null, scope: 'project' | 'workspace'): string {
  const id = newId();
  const links = traceLinks(context, input, kind, id);
  const parentId = ['ai_post_edit', 'human_post_edit'].includes(kind)
    ? input.parentVersionId || input.baseVersionId || null : input.parentVersionId || null;
  context.db.prepare(`INSERT INTO translation_versions (id, project_id, workspace_id, segment_id,
    parent_version_id, base_translation_version_id, root_translation_version_id, comparison_version_id,
    prompt_version_id, ai_run_id, version_kind, scope_type, content, content_hash, created_by,
    origin_instance_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, projectId, workspaceId, input.segmentId, parentId,
      kind === 'ai_translation' || kind === 'manual_reference' ? null : links.rootId,
      links.rootId, links.comparisonId, input.promptVersionId || null, aiRunId, kind, scope,
      input.content, sha256(input.content), userId, context.instanceId, nowIso());
  createVersionDiffArtifacts(context, id);
  return id;
}

function setCurrentState(context: AppContext, workspaceId: string, segmentId: string, versionId: string, status: string): void {
  context.db.prepare(`INSERT INTO workspace_segment_states
    (workspace_id, segment_id, current_translation_version_id, status, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, segment_id) DO UPDATE SET current_translation_version_id = excluded.current_translation_version_id,
      status = excluded.status, updated_at = excluded.updated_at`)
    .run(workspaceId, segmentId, versionId, status, nowIso());
}

function ensureExpectedCurrent(context: AppContext, workspaceId: string, input: VersionInput): void {
  if (!input.expectedVersionId) return;
  const row = context.db.prepare(`SELECT current_translation_version_id AS id
    FROM workspace_segment_states WHERE workspace_id = ? AND segment_id = ?`)
    .get(workspaceId, input.segmentId) as { id: string | null } | undefined;
  if (row?.id !== input.expectedVersionId) {
    throw new AppError(409, 'TRANSLATION_VERSION_CONFLICT', '当前译文已在其他窗口发生变化，请刷新后重试。');
  }
}

function createHumanPostEdit(context: AppContext, user: AuthUser, workspaceId: string,
  input: TranslationEditInput): string {
  const currentWorkspace = workspace(context, workspaceId);
  ensureSegmentProject(context, input.segmentId, currentWorkspace.project_id);
  ensureVersionAccessible(context, input.parentVersionId, workspaceId, currentWorkspace.project_id, input.segmentId);
  ensureVersionAccessible(context, input.baseVersionId, workspaceId, currentWorkspace.project_id, input.segmentId);
  const existing = existingActivityVersion(context, user.id, 'translation.human_post_edit_saved', input.requestId)
    || existingActivityVersion(context, user.id, 'translation.human_post_edit_no_change', input.requestId);
  if (existing) return existing;
  ensureExpectedCurrent(context, workspaceId, input);
  const parent = context.db.prepare('SELECT content_hash AS hash FROM translation_versions WHERE id = ?')
    .get(input.parentVersionId) as { hash: string } | undefined;
  if (parent?.hash === sha256(input.content)) {
    recordActivity(context, { eventType: 'translation.human_post_edit_no_change', actorUserId: user.id,
      projectId: currentWorkspace.project_id, workspaceId, segmentId: input.segmentId,
      translationVersionId: input.parentVersionId || null, requestId: input.requestId });
    return input.parentVersionId!;
  }
  const versionId = insertVersion(context, user.id, currentWorkspace.project_id, workspaceId,
    input, 'human_post_edit', null, 'workspace');
  setCurrentState(context, workspaceId, input.segmentId, versionId, 'human_edited');
  recordActivity(context, { eventType: 'translation.human_post_edit_saved', actorUserId: user.id,
    projectId: currentWorkspace.project_id, workspaceId, segmentId: input.segmentId,
    translationVersionId: versionId, requestId: input.requestId });
  return versionId;
}

export function saveHumanPostEdit(context: AppContext, user: AuthUser, workspaceId: string,
  input: TranslationEditInput): string {
  ensureWorkspaceOwner(context, user, workspaceId);
  return context.db.transaction(() => createHumanPostEdit(context, user, workspaceId, input)).immediate();
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
  ensureVersionAccessible(context, input.baseVersionId, workspaceId, row.project_id, input.segmentId);
  ensureVersionAccessible(context, input.parentVersionId, workspaceId, row.project_id, input.segmentId);
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
  ensureVersionAccessible(context, input.baseVersionId, workspaceId, row.project_id, input.segmentId);
  ensureVersionAccessible(context, input.parentVersionId, workspaceId, row.project_id, input.segmentId);
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
  ensureVersionAccessible(context, versionId, workspaceId, row.project_id, segmentId);
  setCurrentState(context, workspaceId, segmentId, versionId, 'translated');
  recordWorkflow(context, user, row.project_id, workspaceId,
    { segmentId, versionId }, 'current_selected', requestId || newId());
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

function priorWorkflowCount(context: AppContext, userId: string, input: TranslationTransitionInput): number {
  return (context.db.prepare(`SELECT COUNT(*) AS count FROM translation_workflow_events
    WHERE actor_user_id = ? AND event_type = ? AND request_id = ?`)
    .get(userId, input.action === 'confirm' ? 'confirmed' : 'submitted', input.requestId) as { count: number }).count;
}

function recordWorkflow(context: AppContext, user: AuthUser, projectId: string, workspaceId: string,
  state: { segmentId: string; versionId: string }, eventType: string, requestId: string): void {
  context.db.prepare(`INSERT OR IGNORE INTO translation_workflow_events
    (id, project_id, workspace_id, segment_id, translation_version_id, event_type,
      actor_user_id, request_id, metadata_json, origin_instance_id, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`)
    .run(newId(), projectId, workspaceId, state.segmentId, state.versionId, eventType,
      user.id, requestId, context.instanceId, nowIso());
}

function confirmStates(context: AppContext, user: AuthUser, projectId: string, workspaceId: string,
  states: Array<{ segmentId: string; versionId: string }>, requestId: string): void {
  const update = context.db.prepare(`UPDATE workspace_segment_states SET status = 'confirmed', updated_at = ?
    WHERE workspace_id = ? AND segment_id = ?`);
  states.forEach((state) => {
    update.run(nowIso(), workspaceId, state.segmentId);
    recordWorkflow(context, user, projectId, workspaceId, state, 'confirmed', requestId);
  });
}

function submitStates(context: AppContext, user: AuthUser, projectId: string, workspaceId: string,
  states: Array<{ segmentId: string; versionId: string }>, requestId: string): void {
  const insert = context.db.prepare(`INSERT OR IGNORE INTO translation_submissions
    (id, project_id, workspace_id, segment_id, translation_version_id, submitted_by, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  states.forEach((state) => {
    insert.run(newId(), projectId, workspaceId, state.segmentId, state.versionId, user.id, nowIso());
    recordWorkflow(context, user, projectId, workspaceId, state, 'submitted', requestId);
  });
}

function saveTransitionEdits(context: AppContext, user: AuthUser, workspaceId: string,
  input: TranslationTransitionInput): void {
  const allowed = input.segmentIds ? new Set(input.segmentIds) : null;
  for (const edit of input.edits || []) {
    if (allowed && !allowed.has(edit.segmentId)) throw new AppError(400, 'EDIT_SEGMENT_MISMATCH',
      '编辑内容不属于本次确认或提交范围。');
    createHumanPostEdit(context, user, workspaceId, edit);
  }
}

export function transitionWorkspaceTranslations(context: AppContext, user: AuthUser,
  workspaceId: string, input: TranslationTransitionInput): number {
  ensureWorkspaceOwner(context, user, workspaceId);
  const row = workspace(context, workspaceId);
  const prior = priorWorkflowCount(context, user.id, input);
  if (prior) return prior;
  return context.db.transaction(() => {
    saveTransitionEdits(context, user, workspaceId, input);
    const states = currentStates(context, workspaceId, input.segmentIds);
    if (input.action === 'confirm') confirmStates(context, user, row.project_id, workspaceId, states, input.requestId);
    else submitStates(context, user, row.project_id, workspaceId, states, input.requestId);
    recordActivity(context, { eventType: `translation.batch_${input.action === 'confirm' ? 'confirmed' : 'submitted'}`,
      actorUserId: user.id, projectId: row.project_id, workspaceId, requestId: input.requestId,
      metadata: { count: states.length, versions: states } });
    return states.length;
  }).immediate();
}

export function saveAiDecision(context: AppContext, user: AuthUser, workspaceId: string,
  aiVersionId: string, changeId: string, decision: 'accepted' | 'rejected', requestId?: string): void {
  ensureWorkspaceOwner(context, user, workspaceId);
  const row = workspace(context, workspaceId);
  ensureVersionAccessible(context, aiVersionId, workspaceId, row.project_id);
  const decisionRequest = requestId || newId();
  const existing = context.db.prepare(`SELECT 1 FROM ai_change_decision_events
    WHERE decided_by = ? AND request_id = ?`).get(user.id, decisionRequest);
  if (existing) return;
  const artifact = latestVersionDiff(context, aiVersionId, 'ai_to_ai_edit') as { id?: string } | null;
  context.db.transaction(() => {
    context.db.prepare(`INSERT INTO ai_change_decision_events
      (id, ai_edit_version_id, diff_artifact_id, workspace_id, change_id, decision,
        decided_by, request_id, origin_instance_id, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId(), aiVersionId, artifact?.id || null, workspaceId, changeId, decision,
        user.id, decisionRequest, context.instanceId, nowIso());
    context.db.prepare(`INSERT INTO ai_change_decisions
      (id, ai_edit_version_id, workspace_id, change_id, decision, decided_by, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ai_edit_version_id, change_id, decided_by)
      DO UPDATE SET decision = excluded.decision, decided_at = excluded.decided_at`)
      .run(newId(), aiVersionId, workspaceId, changeId, decision, user.id, nowIso());
    recordActivity(context, { eventType: `translation.ai_change_${decision}`, actorUserId: user.id,
      projectId: row.project_id, workspaceId, translationVersionId: aiVersionId,
      requestId: decisionRequest, metadata: { changeId, diffArtifactId: artifact?.id || null } });
  }).immediate();
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
