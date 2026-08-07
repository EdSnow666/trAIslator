/**
 * 职责: 将规范化数据库记录组装为现有 CAT 前端可直接消费的服务器项目快照
 * 依赖内部: ../auth/types.ts, ../context.ts, ../errors.ts, ./access.ts, ./project-resources.ts, ./prompts.ts, ./translation-diffs.ts
 * 依赖外部: 无
 * 暴露: buildProjectSnapshot
 */

import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { ensureProjectView, ensureWorkspaceView } from './access.js';
import { currentProjectBrief } from './project-resources.js';
import { listVisiblePrompts } from './prompts.js';
import { latestVersionDiff } from './translation-diffs.js';

interface ProjectRow {
  id: string; name: string; direction: string; source_language: string;
  target_language: string; description: string; creation_source: string;
}
interface SegmentRow {
  id: string; source_text: string; metadata_json: string;
}
interface VersionRow {
  id: string; segment_id: string; parent_version_id: string | null;
  base_translation_version_id: string | null; root_translation_version_id: string | null;
  comparison_version_id: string | null; prompt_version_id: string | null;
  version_kind: string; content: string; created_at: string; display_name: string | null;
  model: string | null; context_manifest_json: string | null; sequence: number;
  submitted_at: string | null; submitted_by_name: string | null;
}
interface PromptRow {
  id: string; lineage_id: string; parent_version_id: string | null; version_number: number; title: string; note: string; content: string;
  source_type: string; created_at: string; ownerUserId?: string | null;
  submissionStatus?: string | null; publishedAt?: string | null; archivedAt?: string | null;
  promptKind?: 'translation' | 'post_edit';
  parentTitle?: string | null; parentProjectName?: string | null;
  display_name?: string | null; display_roles?: string | null;
}
interface StateRow { segment_id: string; current_translation_version_id: string | null; status: string }

function parseJson(value: string | null, fallback: unknown): unknown {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function promptSnapshots(context: AppContext, user: AuthUser, projectId: string): PromptRow[] {
  const visible = listVisiblePrompts(context, user, projectId) as PromptRow[];
  const author = context.db.prepare(`SELECT u.display_name,
      GROUP_CONCAT(ur.role_code) AS display_roles
    FROM prompt_versions pv
    LEFT JOIN users u ON u.id = pv.created_by
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE pv.id = ? GROUP BY u.display_name`);
  return visible.map((prompt) => ({
    ...prompt,
    ...(author.get(prompt.id) as Pick<PromptRow, 'display_name' | 'display_roles'> | undefined),
  }));
}

function promptRole(prompt: PromptRow): string {
  if (!prompt.display_name) return '系统';
  const roles = prompt.display_roles?.split(',') || [];
  return roles.some((role) => ['admin', 'teacher'].includes(role)) ? '教师' : '学生';
}

function mapPrompt(prompt: PromptRow, user: AuthUser): unknown {
  const published = Boolean(prompt.publishedAt);
  const owned = prompt.ownerUserId === user.id;
  const archived = Boolean(prompt.archivedAt);
  return {
    id: prompt.id,
    lineageId: prompt.lineage_id,
    promptKind: prompt.promptKind || 'translation',
    parentPromptId: prompt.parent_version_id || null,
    parentTitle: prompt.parentTitle || null,
    parentProjectName: prompt.parentProjectName || null,
    version: prompt.version_number,
    displayLabel: `v${prompt.version_number}`,
    title: prompt.title,
    author: prompt.display_name || '系统模板',
    role: promptRole(prompt),
    status: published ? 'published' : (prompt.submissionStatus || 'private'),
    submissionStatus: prompt.submissionStatus || null,
    publishedAt: prompt.publishedAt || null,
    isPublished: published,
    isArchived: archived,
    archivedAt: prompt.archivedAt || null,
    isOwnedByCurrentUser: owned,
    canSubmit: owned && !published && !archived && !prompt.submissionStatus,
    createdAt: prompt.created_at,
    note: prompt.note,
    content: prompt.content,
    sourceType: prompt.source_type,
  };
}

function translationRows(context: AppContext, projectId: string, workspaceId?: string): VersionRow[] {
  return context.db.prepare(`SELECT tv.rowid AS sequence, tv.id, tv.segment_id, tv.parent_version_id,
      tv.base_translation_version_id, tv.root_translation_version_id, tv.comparison_version_id,
      tv.prompt_version_id, tv.version_kind, tv.content, tv.created_at,
      u.display_name, ar.model, ar.context_manifest_json,
      (SELECT ts.submitted_at FROM translation_submissions ts WHERE ts.translation_version_id = tv.id
        AND ts.status = 'submitted' ORDER BY ts.submitted_at DESC LIMIT 1) AS submitted_at,
      (SELECT su.display_name FROM translation_submissions ts JOIN users su ON su.id = ts.submitted_by
        WHERE ts.translation_version_id = tv.id AND ts.status = 'submitted'
        ORDER BY ts.submitted_at DESC LIMIT 1) AS submitted_by_name
    FROM translation_versions tv
    LEFT JOIN users u ON u.id = tv.created_by
    LEFT JOIN ai_runs ar ON ar.id = tv.ai_run_id
    WHERE tv.project_id = ? AND (tv.scope_type = 'project' OR tv.workspace_id = ?)
    ORDER BY tv.segment_id, tv.created_at, tv.rowid`)
    .all(projectId, workspaceId || null) as VersionRow[];
}

function stateRows(context: AppContext, workspaceId?: string): Map<string, StateRow> {
  if (!workspaceId) return new Map();
  const rows = context.db.prepare(`SELECT segment_id, current_translation_version_id, status
    FROM workspace_segment_states WHERE workspace_id = ?`).all(workspaceId) as StateRow[];
  return new Map(rows.map((row) => [row.segment_id, row]));
}

function descendantCurrent(rows: VersionRow[], baseId: string): string {
  let currentId = baseId;
  for (;;) {
    const children = rows.filter((row) => row.parent_version_id === currentId
      && row.version_kind !== 'manual_reference');
    if (!children.length) return currentId;
    currentId = children[children.length - 1]!.id;
  }
}

function defaultCurrent(rows: VersionRow[], metadata: string): string | null {
  const legacy = parseJson(metadata, {}) as { legacyCurrentTranslationId?: string };
  const base = legacy.legacyCurrentTranslationId
    ? rows.find((row) => row.id.endsWith(`:translation:${legacy.legacyCurrentTranslationId}`))
    : undefined;
  if (base) return descendantCurrent(rows, base.id);
  const candidates = rows.filter((row) => row.version_kind !== 'manual_reference');
  return (candidates[candidates.length - 1] || rows[rows.length - 1])?.id || null;
}

function promptInfo(prompts: PromptRow[], promptId: string | null) {
  const prompt = prompts.find((item) => item.id === promptId);
  return {
    promptId,
    promptSnapshot: prompt?.content || '',
    promptLabel: prompt ? `v${prompt.version_number}` : '',
    promptTitle: prompt?.title || '',
  };
}

function decisionRows(context: AppContext, workspaceId?: string): Map<string, Record<string, string>> {
  if (!workspaceId) return new Map();
  const rows = context.db.prepare(`SELECT ai_edit_version_id AS versionId, change_id AS changeId, decision
    FROM ai_change_decisions WHERE workspace_id = ? ORDER BY decided_at`).all(workspaceId) as
    { versionId: string; changeId: string; decision: string }[];
  const result = new Map<string, Record<string, string>>();
  rows.forEach((row) => {
    const decisions = result.get(row.versionId) || {};
    decisions[row.changeId] = row.decision;
    result.set(row.versionId, decisions);
  });
  return result;
}

function aiEdit(context: AppContext, row: VersionRow, baseText: string, prompts: PromptRow[],
  decisions: Map<string, Record<string, string>>) {
  const prompt = promptInfo(prompts, row.prompt_version_id);
  return {
    status: 'applied',
    baseText,
    proposedText: row.content,
    resultText: row.content,
    ...prompt,
    model: row.model || '系统导入',
    createdAt: row.created_at,
    appliedAt: row.created_at,
    decisions: decisions.get(row.id) || {},
    serverVersionId: row.id,
    diffArtifact: latestVersionDiff(context, row.id, 'ai_to_ai_edit'),
  };
}

function versionText(row: VersionRow, rowsById: Map<string, VersionRow>): string {
  const comparison = row.comparison_version_id ? rowsById.get(row.comparison_version_id) : undefined;
  const parent = row.parent_version_id ? rowsById.get(row.parent_version_id) : undefined;
  const base = row.base_translation_version_id ? rowsById.get(row.base_translation_version_id) : undefined;
  return comparison?.content || parent?.content || base?.content || row.content;
}

function mapVersion(context: AppContext, row: VersionRow, rowsById: Map<string, VersionRow>, prompts: PromptRow[],
  decisions: Map<string, Record<string, string>>): unknown {
  const baseline = versionText(row, rowsById);
  const parent = row.parent_version_id ? rowsById.get(row.parent_version_id) : undefined;
  const promptId = row.prompt_version_id || parent?.prompt_version_id || null;
  const prompt = promptInfo(prompts, promptId);
  const manual = row.version_kind === 'manual_reference';
  const mapped: Record<string, unknown> = {
    id: row.id,
    ...prompt,
    aiText: row.version_kind === 'human_post_edit' ? baseline : row.content,
    postEditText: row.version_kind === 'human_post_edit' ? row.content : '',
    author: row.display_name || (manual ? '用户手动翻译' : '系统导入'),
    model: row.model || (manual ? '人工翻译' : '系统导入'),
    createdAt: row.created_at,
    editedAt: row.version_kind === 'human_post_edit' ? row.created_at : '',
    contextSnapshot: row.context_manifest_json
      ? JSON.stringify(parseJson(row.context_manifest_json, {})) : '服务器版本记录',
    origin: manual ? 'manual' : 'server',
    serverVersionKind: row.version_kind,
    serverBaseVersionId: row.root_translation_version_id || row.base_translation_version_id || row.id,
    serverRootVersionId: row.root_translation_version_id || row.id,
    serverComparisonVersionId: row.comparison_version_id || null,
    serverParentVersionId: row.parent_version_id,
    submittedBy: row.submitted_by_name || '',
    submittedAt: row.submitted_at || '',
  };
  if (row.version_kind === 'ai_post_edit') mapped.aiPostEdit = aiEdit(context, row, baseline, prompts, decisions);
  if (row.version_kind === 'human_post_edit') {
    mapped.serverBaselineKind = rowsById.get(row.comparison_version_id || '')?.version_kind || 'ai_translation';
    mapped.diffArtifact = latestVersionDiff(context, row.id, 'machine_to_human');
  }
  return mapped;
}

function segmentStatus(kind: string | undefined): string {
  if (kind === 'human_post_edit') return 'edited';
  if (kind === 'ai_post_edit') return 'ai-edited';
  if (kind === 'manual_reference') return 'reviewed';
  return kind ? 'translated' : 'untranslated';
}

function mapSegment(context: AppContext, segment: SegmentRow, versions: VersionRow[], prompts: PromptRow[],
  decisions: Map<string, Record<string, string>>, currentState?: StateRow): unknown {
  const rowsById = new Map(versions.map((row) => [row.id, row]));
  const currentId = currentState?.current_translation_version_id
    || defaultCurrent(versions, segment.metadata_json);
  return {
    id: segment.id,
    source: segment.source_text,
    status: rowsById.get(currentId || '')?.submitted_at ? 'submitted'
      : currentState?.status === 'confirmed' ? 'reviewed'
        : segmentStatus(rowsById.get(currentId || '')?.version_kind),
    currentTranslationId: currentId,
    translations: versions.map((row) => mapVersion(context, row, rowsById, prompts, decisions)),
  };
}

function canManageProject(context: AppContext, user: AuthUser, projectId: string): boolean {
  if (user.roles.includes('admin')) return true;
  return Boolean(context.db.prepare(`SELECT 1 FROM project_managers
      WHERE project_id = ? AND user_id = ? UNION SELECT 1 FROM project_assignments pa
      JOIN class_memberships cm ON cm.class_id = pa.class_id
      WHERE pa.project_id = ? AND pa.status = 'active' AND cm.user_id = ?
        AND cm.membership_role = 'teacher' AND cm.status = 'active'`)
    .get(projectId, user.id, projectId, user.id));
}

function activePromptId(context: AppContext, projectId: string, prompts: PromptRow[],
  workspaceId: string | undefined, kind: 'translation' | 'post_edit'): string | null {
  const column = kind === 'post_edit' ? 'active_post_edit_prompt_version_id' : 'active_prompt_version_id';
  const workspace = workspaceId ? context.db.prepare(`SELECT ${column} AS id
    FROM project_workspaces WHERE id = ?`).get(workspaceId) as { id: string | null } | undefined : undefined;
  if (workspace?.id && prompts.some((prompt) => prompt.id === workspace.id
    && prompt.promptKind === kind && !prompt.archivedAt)) return workspace.id;
  const published = context.db.prepare(`SELECT prompt_version_id AS id FROM project_prompt_publications
    WHERE project_id = ? AND prompt_kind = ? AND retired_at IS NULL ORDER BY published_at DESC LIMIT 1`)
    .get(projectId, kind) as { id: string } | undefined;
  const available = prompts.filter((prompt) => prompt.promptKind === kind && !prompt.archivedAt);
  return published?.id || available[available.length - 1]?.id || null;
}

function projectResources(context: AppContext, projectId: string) {
  const terms = context.db.prepare(`SELECT t.source_term AS source, t.target_term AS target, t.note
    FROM terms t JOIN term_bases tb ON tb.id = t.term_base_id
    WHERE tb.project_id = ? AND t.status <> 'deprecated' ORDER BY t.created_at`).all(projectId);
  const tm = context.db.prepare(`SELECT source_text AS source, target_text AS target
    FROM translation_memory_entries WHERE project_id = ? AND status <> 'deprecated'
    ORDER BY created_at`).all(projectId);
  return { terms, tm };
}

function ensureWorkspaceProject(context: AppContext, workspaceId: string, projectId: string): void {
  const row = context.db.prepare(`SELECT 1 FROM project_workspaces
    WHERE id = ? AND project_id = ? AND deleted_at IS NULL`).get(workspaceId, projectId);
  if (!row) throw new AppError(400, 'WORKSPACE_PROJECT_MISMATCH', '工作空间不属于当前项目。');
}

export function buildProjectSnapshot(context: AppContext, user: AuthUser,
  projectId: string, workspaceId?: string): unknown {
  ensureProjectView(context, user, projectId);
  if (workspaceId) {
    ensureWorkspaceView(context, user, workspaceId);
    ensureWorkspaceProject(context, workspaceId, projectId);
  }
  const project = context.db.prepare(`SELECT id, name, direction, source_language,
    target_language, description, creation_source FROM projects WHERE id = ?`).get(projectId) as ProjectRow;
  const brief = currentProjectBrief(context, user, projectId);
  const prompts = promptSnapshots(context, user, projectId);
  const versions = translationRows(context, projectId, workspaceId);
  const states = stateRows(context, workspaceId);
  const decisions = decisionRows(context, workspaceId);
  const segments = context.db.prepare(`SELECT s.id, s.source_text, s.metadata_json FROM segments s
    JOIN documents d ON d.id = s.document_id WHERE d.project_id = ?
    ORDER BY d.document_order, s.segment_order`).all(projectId) as SegmentRow[];
  return {
    id: project.id,
    name: project.name,
    direction: project.direction,
    sourceLang: project.source_language,
    targetLang: project.target_language,
    brief: brief?.content || parseJson(project.description, { description: project.description }),
    briefVersionId: brief?.id || null,
    briefPendingGeneration: Boolean(brief?.pendingGeneration),
    creationSource: project.creation_source,
    activePromptId: activePromptId(context, projectId, prompts, workspaceId, 'translation'),
    activePostEditPromptId: activePromptId(context, projectId, prompts, workspaceId, 'post_edit'),
    prompts: prompts.map((prompt) => mapPrompt(prompt, user)),
    segments: segments.map((segment) => mapSegment(context, segment,
      versions.filter((row) => row.segment_id === segment.id), prompts, decisions, states.get(segment.id))),
    ...projectResources(context, projectId),
    serverMode: true,
    workspaceId: workspaceId || null,
    editable: Boolean(workspaceId),
    canManage: canManageProject(context, user, projectId),
  };
}
