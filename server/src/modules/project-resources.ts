/**
 * 职责: 管理可版本化冷启动任务书，并初始化项目任务书与全文 Prompt
 * 依赖内部: ../auth/types.ts, ../context.ts, ../errors.ts, ../shared.ts, ./access.ts, ./activity.ts, ./ai-execution.ts, ./prompt-structures.ts, ./prompts.ts
 * 依赖外部: 无
 * 暴露: listProjectResourceCatalog | currentProjectBrief | saveProjectBrief | generateProjectBrief | generateProjectPrompt | initializeProjectResources
 */

import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { jsonText, newId, nowIso } from '../shared.js';
import { ensureProjectManage, ensureProjectView } from './access.js';
import { recordActivity } from './activity.js';
import { executeProjectTextGeneration } from './ai-execution.js';
import { BRIEF_SYSTEM, PROMPT_GENERATION_SYSTEM, briefPayload,
  promptGenerationPayload } from './prompt-structures.js';
import { createPromptVersion, listVisiblePrompts } from './prompts.js';
import { serverModelCapability } from './server-models.js';

export type SetupMode = 'manual' | 'auto' | 'inherit';
export interface BriefContent { genre: string; skopos: string; audience: string; register: string; strategy: string }
export interface ResourceSetup {
  briefMode?: SetupMode;
  briefContent?: Partial<BriefContent>;
  briefVersionId?: string;
  promptMode?: SetupMode;
  promptContent?: string;
  promptVersionId?: string;
  modelConfigId?: string;
}

interface BriefRow { id: string; project_id: string; content_json: string; source_type: string; sample_manifest_json: string; created_at: string }
const EMPTY_BRIEF: BriefContent = { genre: '', skopos: '', audience: '', register: '', strategy: '' };

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function normalizeBrief(input?: Partial<BriefContent>): BriefContent {
  const result = { ...EMPTY_BRIEF, ...(input || {}) };
  Object.keys(result).forEach((key) => { result[key as keyof BriefContent] = String(result[key as keyof BriefContent] || '').trim(); });
  return result;
}

function currentBriefRow(context: AppContext, projectId: string): BriefRow | undefined {
  return context.db.prepare(`SELECT pbv.* FROM project_brief_states pbs
    JOIN project_brief_versions pbv ON pbv.id = pbs.current_version_id
    WHERE pbs.project_id = ?`).get(projectId) as BriefRow | undefined;
}

export function currentProjectBrief(context: AppContext, user: AuthUser, projectId: string) {
  ensureProjectView(context, user, projectId);
  const row = currentBriefRow(context, projectId);
  const manifest = row ? parseJson(row.sample_manifest_json, {}) as { pendingGeneration?: boolean } : {};
  return row ? { id: row.id, content: parseJson(row.content_json, EMPTY_BRIEF),
    sourceType: row.source_type, pendingGeneration: Boolean(manifest.pendingGeneration),
    createdAt: row.created_at } : null;
}

function inheritedBrief(context: AppContext, user: AuthUser, versionId: string) {
  const row = context.db.prepare(`SELECT project_id, content_json FROM project_brief_versions
    WHERE id = ?`).get(versionId) as { project_id: string; content_json: string } | undefined;
  if (!row) throw new AppError(404, 'BRIEF_VERSION_NOT_FOUND', '所选冷启动任务书不存在。');
  ensureProjectView(context, user, row.project_id);
  return { content: normalizeBrief(parseJson(row.content_json, EMPTY_BRIEF)), projectId: row.project_id };
}

export function saveProjectBrief(context: AppContext, user: AuthUser, projectId: string,
  content: Partial<BriefContent>, sourceType: 'human' | 'ai_generated' | 'inherited' = 'human',
  sourceVersionId?: string, aiRunId?: string, pendingGeneration = false): string {
  ensureProjectManage(context, user, projectId);
  const previous = currentBriefRow(context, projectId);
  const id = newId();
  const inherited = sourceVersionId ? inheritedBrief(context, user, sourceVersionId) : null;
  const normalized = normalizeBrief(inherited ? { ...inherited.content, ...content } : content);
  const sample = { sourceVersionId: sourceVersionId || null, aiRunId: aiRunId || null, pendingGeneration };
  context.db.transaction(() => {
    context.db.prepare(`INSERT INTO project_brief_versions (id, project_id, parent_version_id,
      source_project_id, created_by, source_type, content_json, sample_manifest_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, projectId, previous?.id || null, inherited?.projectId || null,
        user.id, sourceType, jsonText(normalized), jsonText(sample), nowIso());
    context.db.prepare(`INSERT INTO project_brief_states (project_id, current_version_id) VALUES (?, ?)
      ON CONFLICT(project_id) DO UPDATE SET current_version_id = excluded.current_version_id`).run(projectId, id);
    recordActivity(context, { eventType: 'project.brief_saved', actorUserId: user.id, projectId,
      metadata: { briefVersionId: id, sourceType, aiRunId: aiRunId || null } });
  }).immediate();
  return id;
}

function sourceSample(context: AppContext, projectId: string): string[] {
  const rows = context.db.prepare(`SELECT s.source_text AS text FROM segments s
    JOIN documents d ON d.id = s.document_id WHERE d.project_id = ?
    ORDER BY d.document_order, s.segment_order LIMIT 10`).all(projectId) as Array<{ text: string }>;
  return rows.map((row) => row.text);
}

function generatedBrief(content: string): BriefContent {
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return normalizeBrief(JSON.parse(cleaned) as Partial<BriefContent>); }
  catch { throw new AppError(502, 'BRIEF_OUTPUT_INVALID', '模型未返回有效的冷启动任务书 JSON。'); }
}

export async function generateProjectBrief(context: AppContext, user: AuthUser, projectId: string,
  modelConfigId?: string): Promise<string> {
  const payload = briefPayload(sourceSample(context, projectId));
  const generated = await executeProjectTextGeneration(context, user, projectId, {
    operationType: 'style_identify', requestId: `brief-${newId()}`, ...(modelConfigId ? { modelConfigId } : {}),
    systemInstruction: BRIEF_SYSTEM, payload,
  });
  return saveProjectBrief(context, user, projectId, generatedBrief(generated.content),
    'ai_generated', undefined, generated.runId);
}

function sourcePrompt(context: AppContext, user: AuthUser, versionId: string): string {
  const row = context.db.prepare(`SELECT pl.project_id, pv.content FROM prompt_versions pv
    JOIN prompt_lineages pl ON pl.id = pv.lineage_id WHERE pv.id = ?`).get(versionId) as
    { project_id: string; content: string } | undefined;
  if (!row) throw new AppError(404, 'PROMPT_VERSION_NOT_FOUND', '所选 Prompt 不存在。');
  const visible = listVisiblePrompts(context, user, row.project_id) as Array<{ id: string }>;
  if (!visible.some((item) => item.id === versionId)) {
    throw new AppError(403, 'PROMPT_VERSION_FORBIDDEN', '无权继承此 Prompt。');
  }
  return row.content;
}

export async function generateProjectPrompt(context: AppContext, user: AuthUser, projectId: string,
  modelConfigId?: string): Promise<string> {
  const brief = currentBriefRow(context, projectId);
  const payload = promptGenerationPayload(brief ? parseJson(brief.content_json, EMPTY_BRIEF) : EMPTY_BRIEF,
    sourceSample(context, projectId));
  const generated = await executeProjectTextGeneration(context, user, projectId, {
    operationType: 'prompt_generate', requestId: `prompt-${newId()}`, ...(modelConfigId ? { modelConfigId } : {}),
    systemInstruction: PROMPT_GENERATION_SYSTEM, payload,
  });
  return createPromptVersion(context, user, projectId, { title: 'AI 生成全文 Prompt',
    note: '依据冷启动任务书与原文前 10 段自动生成。', content: generated.content,
    sourceType: 'ai_generated', aiRunId: generated.runId });
}

function canGenerateNow(context: AppContext, modelConfigId?: string): boolean {
  return Boolean(modelConfigId) || serverModelCapability(context);
}

function pendingPrompt(context: AppContext, user: AuthUser, projectId: string): void {
  createPromptVersion(context, user, projectId, { title: '待生成全文 Prompt',
    note: '[pending-generation] 配置服务器模型后可从 Prompt 菜单生成。', content: '' });
}

async function initializeBrief(context: AppContext, user: AuthUser, projectId: string,
  setup: ResourceSetup): Promise<boolean> {
  if (setup.briefMode === 'auto') {
    if (!canGenerateNow(context, setup.modelConfigId)) {
      saveProjectBrief(context, user, projectId, {}, 'human', undefined, undefined, true);
      return false;
    }
    try { await generateProjectBrief(context, user, projectId, setup.modelConfigId); return true; }
    catch { saveProjectBrief(context, user, projectId, {}, 'human', undefined, undefined, true); return false; }
  }
  if (setup.briefMode === 'inherit' && setup.briefVersionId) {
    saveProjectBrief(context, user, projectId, setup.briefContent || {}, 'inherited', setup.briefVersionId); return true;
  }
  saveProjectBrief(context, user, projectId, setup.briefContent || {}, 'human');
  return true;
}

async function initializePrompt(context: AppContext, user: AuthUser, projectId: string,
  setup: ResourceSetup, generationReady: boolean): Promise<void> {
  const existing = context.db.prepare(`SELECT 1 FROM prompt_lineages WHERE project_id = ? LIMIT 1`).get(projectId);
  if (!setup.promptMode && existing) return;
  if (setup.promptMode === 'auto') {
    if (!generationReady || !canGenerateNow(context, setup.modelConfigId)) return pendingPrompt(context, user, projectId);
    try { await generateProjectPrompt(context, user, projectId, setup.modelConfigId); }
    catch { pendingPrompt(context, user, projectId); }
    return;
  }
  const inherited = setup.promptMode === 'inherit' && setup.promptVersionId
    ? sourcePrompt(context, user, setup.promptVersionId) : '';
  const promptContent = setup.promptContent?.trim() || inherited;
  createPromptVersion(context, user, projectId, { title: setup.promptMode === 'inherit'
    ? '继承全文 Prompt' : '项目初始 Prompt', note: setup.promptMode === 'inherit'
      ? '从既有项目 Prompt 复制并编辑。' : '项目创建时手动设置。', content: promptContent,
    ...(setup.promptMode === 'inherit' && setup.promptVersionId
      ? { parentVersionId: setup.promptVersionId } : {}) });
}

export async function initializeProjectResources(context: AppContext, user: AuthUser,
  projectId: string, setup: ResourceSetup): Promise<void> {
  const generationReady = await initializeBrief(context, user, projectId, setup);
  await initializePrompt(context, user, projectId, setup, generationReady);
}

export function listProjectResourceCatalog(context: AppContext, user: AuthUser): unknown[] {
  const admin = user.roles.includes('admin') ? 1 : 0;
  const privileged = user.roles.some((role) => role === 'admin' || role === 'teacher') ? 1 : 0;
  return context.db.prepare(`SELECT p.id AS projectId, p.name, p.direction,
      pbv.id AS briefVersionId, pbv.content_json AS briefContent,
      (SELECT pv.id FROM prompt_versions pv JOIN prompt_lineages pl ON pl.id = pv.lineage_id
        LEFT JOIN project_prompt_publications ppp ON ppp.prompt_version_id = pv.id AND ppp.retired_at IS NULL
        WHERE pl.project_id = p.id AND (pl.owner_user_id = ? OR ppp.id IS NOT NULL OR
          (p.project_kind = 'system_template' AND ? = 1))
        ORDER BY pv.created_at DESC LIMIT 1) AS promptVersionId,
      (SELECT pv.content FROM prompt_versions pv JOIN prompt_lineages pl ON pl.id = pv.lineage_id
        LEFT JOIN project_prompt_publications ppp ON ppp.prompt_version_id = pv.id AND ppp.retired_at IS NULL
        WHERE pl.project_id = p.id AND (pl.owner_user_id = ? OR ppp.id IS NOT NULL OR
          (p.project_kind = 'system_template' AND ? = 1))
        ORDER BY pv.created_at DESC LIMIT 1) AS promptContent
    FROM projects p LEFT JOIN project_managers pm ON pm.project_id = p.id AND pm.user_id = ?
    LEFT JOIN project_assignments pa ON pa.project_id = p.id AND pa.status = 'active'
    LEFT JOIN class_memberships cm ON cm.class_id = pa.class_id AND cm.user_id = ? AND cm.status = 'active'
    LEFT JOIN experiment_stages es ON es.id = pa.experiment_stage_id
    LEFT JOIN experiment_participants ep ON ep.experiment_id = es.experiment_id AND ep.user_id = ? AND ep.status = 'active'
    LEFT JOIN project_brief_states pbs ON pbs.project_id = p.id
    LEFT JOIN project_brief_versions pbv ON pbv.id = pbs.current_version_id
    WHERE p.deleted_at IS NULL AND ((p.project_kind = 'system_template' AND ? = 1) OR
      (p.project_kind <> 'system_template' AND (? = 1 OR pm.user_id IS NOT NULL
        OR cm.user_id IS NOT NULL OR ep.user_id IS NOT NULL)))
    GROUP BY p.id ORDER BY p.project_kind DESC, p.updated_at DESC`)
    .all(user.id, privileged, user.id, privileged, user.id, user.id, user.id, privileged, admin);
}