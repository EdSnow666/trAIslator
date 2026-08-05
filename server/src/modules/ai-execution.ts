/**
 * 职责: 使用统一服务器模型执行翻译、AI 译后编辑及项目任务书/Prompt 生成
 * 依赖内部: ../auth/types.ts, ../context.ts, ../errors.ts, ../shared.ts, ./access.ts, ./activity.ts, ./prompt-structures.ts, ./prompts.ts, ./server-models.ts, ./translations.ts
 * 依赖外部: Fetch API
 * 暴露: executeAiTranslation | executeProjectTextGeneration | testServerModelConnection | AiExecutionInput | ProjectTextGenerationInput
 */

import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { jsonText, newId, nowIso, sha256 } from '../shared.js';
import { ensureProjectManage, ensureWorkspaceOwner } from './access.js';
import { recordActivity } from './activity.js';
import { projectMessages, translationMessages } from './prompt-structures.js';
import { listVisiblePrompts } from './prompts.js';
import { resolveServerModel, type ResolvedServerModel } from './server-models.js';
import { finalizeAiTranslation } from './translations.js';

export interface AiExecutionInput {
  segmentId: string;
  promptVersionId?: string;
  baseVersionId?: string;
  kind: 'ai_translation' | 'ai_post_edit';
  requestId: string;
  modelConfigId?: string;
}

export interface ProjectTextGenerationInput {
  operationType: 'prompt_generate' | 'style_identify';
  requestId: string;
  systemInstruction: string;
  payload: unknown;
  modelConfigId?: string;
}

interface WorkspaceRow { id: string; project_id: string; active_prompt_version_id: string | null }
interface ExecutionContext {
  projectId: string; sourceLanguage: string; targetLanguage: string; source: string;
  promptVersionId: string; overarchingPrompt: string | null; customPrompt: string | null;
  baseTranslation: string | null;
  terms: unknown[]; translationMemory: unknown[];
}
interface ProviderResult { content: string; usage: unknown; attempts: number; latencyMs: number }

class ProviderError extends Error {
  constructor(public code: string, message: string, public retryable = true) { super(message); }
}

function workspaceRow(context: AppContext, workspaceId: string): WorkspaceRow {
  const row = context.db.prepare(`SELECT id, project_id, active_prompt_version_id
    FROM project_workspaces WHERE id = ? AND deleted_at IS NULL`).get(workspaceId) as WorkspaceRow | undefined;
  if (!row) throw new AppError(404, 'WORKSPACE_NOT_FOUND', '工作空间不存在。');
  return row;
}

function promptIdForRun(context: AppContext, user: AuthUser, row: WorkspaceRow, requested?: string): string {
  const fallback = requested || row.active_prompt_version_id;
  if (!fallback) throw new AppError(400, 'PROMPT_REQUIRED', '请先选择用于翻译的 Prompt。');
  const visible = listVisiblePrompts(context, user, row.project_id) as Array<{ id: string }>;
  if (!visible.some((item) => item.id === fallback)) throw new AppError(403, 'PROMPT_FORBIDDEN', '当前 Prompt 不可用。');
  return fallback;
}

function baseTranslation(context: AppContext, row: WorkspaceRow, versionId?: string): string | null {
  if (!versionId) return null;
  const version = context.db.prepare(`SELECT content FROM translation_versions
    WHERE id = ? AND project_id = ? AND (workspace_id = ? OR scope_type = 'project')`)
    .get(versionId, row.project_id, row.id) as { content: string } | undefined;
  if (!version) throw new AppError(400, 'BASE_TRANSLATION_FORBIDDEN', '基础译文版本不可用。');
  return version.content;
}

function resources(context: AppContext, projectId: string): { terms: unknown[]; translationMemory: unknown[] } {
  const terms = context.db.prepare(`SELECT t.source_term AS source, t.target_term AS target, t.note
    FROM terms t JOIN term_bases tb ON tb.id = t.term_base_id
    WHERE tb.project_id = ? AND t.status = 'approved' ORDER BY t.created_at`).all(projectId);
  const translationMemory = context.db.prepare(`SELECT source_text AS source, target_text AS target
    FROM translation_memory_entries WHERE project_id = ? AND status = 'approved'
    ORDER BY created_at DESC LIMIT 20`).all(projectId);
  return { terms, translationMemory };
}

function buildExecutionContext(context: AppContext, user: AuthUser, row: WorkspaceRow,
  input: AiExecutionInput): ExecutionContext {
  const promptVersionId = promptIdForRun(context, user, row, input.promptVersionId);
  const record = context.db.prepare(`SELECT p.source_language AS sourceLanguage,
      p.target_language AS targetLanguage, s.source_text AS source, pv.content AS selectedPrompt
    FROM segments s JOIN documents d ON d.id = s.document_id JOIN projects p ON p.id = d.project_id
    JOIN prompt_versions pv ON pv.id = ? WHERE s.id = ? AND p.id = ?`)
    .get(promptVersionId, input.segmentId, row.project_id) as
      { sourceLanguage: string; targetLanguage: string; source: string; selectedPrompt: string } | undefined;
  if (!record) throw new AppError(400, 'SEGMENT_PROJECT_MISMATCH', '句段或 Prompt 不属于当前项目。');
  const published = context.db.prepare(`SELECT ppp.prompt_version_id AS id, pv.content
    FROM project_prompt_publications ppp JOIN prompt_versions pv ON pv.id = ppp.prompt_version_id
    WHERE ppp.project_id = ? AND ppp.retired_at IS NULL ORDER BY ppp.published_at DESC LIMIT 1`)
    .get(row.project_id) as { id: string; content: string } | undefined;
  return { sourceLanguage: record.sourceLanguage, targetLanguage: record.targetLanguage,
    source: record.source, projectId: row.project_id, promptVersionId,
    overarchingPrompt: published?.content || null,
    customPrompt: published?.id === promptVersionId ? null : record.selectedPrompt,
    baseTranslation: baseTranslation(context, row, input.baseVersionId), ...resources(context, row.project_id) };
}

function requestBody(model: ResolvedServerModel, input: AiExecutionInput, data: ExecutionContext): unknown {
  const payload = { sourceLanguage: data.sourceLanguage, targetLanguage: data.targetLanguage,
    source: data.source, currentTranslation: data.baseTranslation,
    overarchingPrompt: data.overarchingPrompt, customPrompt: data.customPrompt,
    terminology: data.terms, translationMemory: data.translationMemory };
  return { model: model.model, temperature: 0.2, messages: translationMessages(input.kind, payload) };
}

function endpoint(baseUrl: string): string {
  return baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
}

async function callOnce(model: ResolvedServerModel, body: unknown): Promise<{ content: string; usage: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), model.requestTimeoutMs);
  try {
    const response = await fetch(endpoint(model.baseUrl), { method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${model.apiKey}` },
      body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      const detail = payload?.error?.message?.slice(0, 300);
      const message = `模型服务返回 HTTP ${response.status}${detail ? `：${detail}` : '。'}`;
      throw new ProviderError(`PROVIDER_HTTP_${response.status}`, message, response.status >= 500);
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new ProviderError('PROVIDER_EMPTY_OUTPUT', '模型服务没有返回译文。', false);
    return { content, usage: payload.usage || {} };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const code = error instanceof Error && error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR';
    throw new ProviderError(code, code === 'PROVIDER_TIMEOUT' ? '模型请求超时。' : '无法连接模型服务。');
  } finally { clearTimeout(timeout); }
}

async function callWithRetries(model: ResolvedServerModel, body: unknown): Promise<ProviderResult> {
  const started = Date.now();
  let attempts = 0;
  let lastError = new ProviderError('PROVIDER_UNKNOWN', '模型调用失败。');
  for (let attempt = 1; attempt <= model.maxRetries + 1; attempt += 1) {
    attempts = attempt;
    try {
      const result = await callOnce(model, body);
      return { ...result, attempts, latencyMs: Date.now() - started };
    } catch (error) {
      lastError = error as ProviderError;
      if (!lastError.retryable || attempt > model.maxRetries) break;
    }
  }
  throw Object.assign(lastError, { attempts, latencyMs: Date.now() - started });
}

function existingRun(context: AppContext, requestId: string): { id: string; status: string; versionId: string | null } | null {
  return context.db.prepare(`SELECT ar.id, ar.status, tv.id AS versionId FROM ai_runs ar
    LEFT JOIN translation_versions tv ON tv.ai_run_id = ar.id WHERE ar.request_id = ?`)
    .get(requestId) as { id: string; status: string; versionId: string | null } | undefined || null;
}

function createPendingRun(context: AppContext, user: AuthUser, row: WorkspaceRow,
  input: AiExecutionInput, data: ExecutionContext, model: ResolvedServerModel): string {
  const id = newId();
  const manifest = { source: data.source, baseTranslationId: input.baseVersionId || null,
    overarchingPrompt: data.overarchingPrompt, customPrompt: data.customPrompt,
    terms: data.terms, translationMemory: data.translationMemory };
  context.db.prepare(`INSERT INTO ai_runs (id, operation_type, actor_user_id, project_id, workspace_id,
    segment_id, prompt_version_id, provider, model, request_id, input_hash, context_manifest_json,
    status, started_at, model_config_id, attempt_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 1)`)
    .run(id, input.kind === 'ai_post_edit' ? 'ai_post_edit' : 'translation_generate', user.id,
      row.project_id, row.id, input.segmentId, data.promptVersionId, model.provider, model.model,
      input.requestId, sha256(JSON.stringify({ input, data })), jsonText(manifest), nowIso(), model.id);
  recordActivity(context, { eventType: 'ai.request_started', actorUserId: user.id, projectId: row.project_id,
    workspaceId: row.id, segmentId: input.segmentId, promptVersionId: data.promptVersionId,
    requestId: input.requestId, metadata: { aiRunId: id, operationType: input.kind } });
  return id;
}

function failRun(context: AppContext, user: AuthUser, row: WorkspaceRow, input: AiExecutionInput,
  runId: string, error: ProviderError & { attempts?: number; latencyMs?: number }): void {
  context.db.prepare(`UPDATE ai_runs SET status = 'failed', error_code = ?, attempt_count = ?,
    latency_ms = ?, completed_at = ? WHERE id = ?`)
    .run(error.code, error.attempts || 1, error.latencyMs || null, nowIso(), runId);
  recordActivity(context, { eventType: 'ai.request_failed', actorUserId: user.id, projectId: row.project_id,
    workspaceId: row.id, segmentId: input.segmentId, requestId: input.requestId,
    metadata: { aiRunId: runId, errorCode: error.code, attempts: error.attempts || 1 } });
}

function validateExecutionInput(input: AiExecutionInput): void {
  if (!['ai_translation', 'ai_post_edit'].includes(input.kind) || !input.segmentId?.trim()) {
    throw new AppError(400, 'AI_REQUEST_INVALID', 'AI 任务类型或句段无效。');
  }
  if (input.kind === 'ai_post_edit' && !input.baseVersionId) {
    throw new AppError(400, 'AI_POST_EDIT_BASE_REQUIRED', 'AI 译后编辑必须指定基础译文。');
  }
  if (!input.requestId?.trim()) throw new AppError(400, 'AI_REQUEST_ID_REQUIRED', 'AI 请求必须包含 requestId。');
}

function priorProjectGeneration(context: AppContext, requestId: string) {
  return context.db.prepare(`SELECT id, status, output_text AS output FROM ai_runs
    WHERE request_id = ?`).get(requestId) as
    { id: string; status: string; output: string | null } | undefined;
}

function createProjectRun(context: AppContext, user: AuthUser, projectId: string,
  input: ProjectTextGenerationInput, model: ResolvedServerModel): string {
  const id = newId();
  context.db.prepare(`INSERT INTO ai_runs (id, operation_type, actor_user_id, project_id,
    provider, model, request_id, input_hash, context_manifest_json, status, started_at,
    model_config_id, attempt_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 1)`)
    .run(id, input.operationType, user.id, projectId, model.provider, model.model,
      input.requestId, sha256(JSON.stringify(input.payload)), jsonText(input.payload), nowIso(), model.id);
  recordActivity(context, { eventType: 'ai.request_started', actorUserId: user.id, projectId,
    requestId: input.requestId, metadata: { aiRunId: id, operationType: input.operationType } });
  return id;
}

function projectRequestBody(model: ResolvedServerModel, input: ProjectTextGenerationInput): unknown {
  return { model: model.model, temperature: 0.2,
    messages: projectMessages(input.systemInstruction, input.payload) };
}

function finishProjectRun(context: AppContext, runId: string, result: ProviderResult): void {
  context.db.prepare(`UPDATE ai_runs SET output_text = ?, status = 'succeeded', token_usage_json = ?,
    latency_ms = ?, attempt_count = ?, completed_at = ? WHERE id = ?`)
    .run(result.content, jsonText(result.usage), result.latencyMs, result.attempts, nowIso(), runId);
}

function failProjectRun(context: AppContext, user: AuthUser, projectId: string,
  input: ProjectTextGenerationInput, runId: string, error: ProviderError &
  { attempts?: number; latencyMs?: number }): void {
  context.db.prepare(`UPDATE ai_runs SET status = 'failed', error_code = ?, attempt_count = ?,
    latency_ms = ?, completed_at = ? WHERE id = ?`)
    .run(error.code, error.attempts || 1, error.latencyMs || null, nowIso(), runId);
  recordActivity(context, { eventType: 'ai.request_failed', actorUserId: user.id, projectId,
    requestId: input.requestId, metadata: { aiRunId: runId, errorCode: error.code } });
}

export async function executeProjectTextGeneration(context: AppContext, user: AuthUser,
  projectId: string, input: ProjectTextGenerationInput): Promise<{ runId: string; content: string }> {
  ensureProjectManage(context, user, projectId);
  if (!input.requestId?.trim()) throw new AppError(400, 'AI_REQUEST_ID_REQUIRED', 'AI 请求必须包含 requestId。');
  const prior = priorProjectGeneration(context, input.requestId);
  if (prior?.status === 'succeeded' && prior.output) return { runId: prior.id, content: prior.output };
  if (prior) throw new AppError(409, 'AI_REQUEST_EXISTS', '该 AI 请求已存在，请使用新的 requestId 重试。');
  const model = resolveServerModel(context, input.modelConfigId);
  const runId = createProjectRun(context, user, projectId, input, model);
  try {
    const result = await callWithRetries(model, projectRequestBody(model, input));
    finishProjectRun(context, runId, result);
    return { runId, content: result.content };
  } catch (error) {
    failProjectRun(context, user, projectId, input, runId, error as ProviderError);
    throw new AppError(502, (error as ProviderError).code || 'AI_PROVIDER_ERROR', (error as Error).message);
  }
}

export async function executeAiTranslation(context: AppContext, user: AuthUser, workspaceId: string,
  input: AiExecutionInput): Promise<{ runId: string; translationVersionId: string; status: string }> {
  ensureWorkspaceOwner(context, user, workspaceId);
  validateExecutionInput(input);
  const prior = existingRun(context, input.requestId);
  if (prior?.status === 'succeeded' && prior.versionId) {
    return { runId: prior.id, translationVersionId: prior.versionId, status: prior.status };
  }
  if (prior) throw new AppError(409, 'AI_REQUEST_EXISTS', '该 AI 请求已存在，请使用新的 requestId 重试。');
  const row = workspaceRow(context, workspaceId);
  const data = buildExecutionContext(context, user, row, input);
  const model = resolveServerModel(context, input.modelConfigId);
  const runId = createPendingRun(context, user, row, input, data, model);
  try {
    const result = await callWithRetries(model, requestBody(model, input, data));
    context.db.prepare('UPDATE ai_runs SET attempt_count = ? WHERE id = ?').run(result.attempts, runId);
    const versionLinks = input.baseVersionId
      ? { parentVersionId: input.baseVersionId, baseVersionId: input.baseVersionId } : {};
    const versionId = finalizeAiTranslation(context, user, workspaceId, { segmentId: input.segmentId,
      content: result.content, ...versionLinks,
      promptVersionId: data.promptVersionId, kind: input.kind }, runId, result.usage, result.latencyMs);
    return { runId, translationVersionId: versionId, status: 'succeeded' };
  } catch (error) {
    failRun(context, user, row, input, runId, error as ProviderError);
    throw new AppError(502, (error as ProviderError).code || 'AI_PROVIDER_ERROR', (error as Error).message);
  }
}
export async function testServerModelConnection(context: AppContext, user: AuthUser,
  modelConfigId: string): Promise<unknown> {
  const model = resolveServerModel(context, modelConfigId);
  const body = { model: model.model, temperature: 0, messages: [
    { role: 'system', content: 'This is a connection test. Reply with OK.' },
    { role: 'user', content: 'OK' },
  ] };
  try {
    const result = await callWithRetries(model, body);
    recordActivity(context, { eventType: 'server_model.connection_test_succeeded',
      actorUserId: user.id, metadata: { modelConfigId, latencyMs: result.latencyMs, attempts: result.attempts } });
    return { ok: true, model: model.model, latencyMs: result.latencyMs, attempts: result.attempts };
  } catch (error) {
    const providerError = error as ProviderError & { attempts?: number; latencyMs?: number };
    recordActivity(context, { eventType: 'server_model.connection_test_failed', actorUserId: user.id,
      metadata: { modelConfigId, errorCode: providerError.code, attempts: providerError.attempts || 1 } });
    throw new AppError(502, providerError.code || 'AI_PROVIDER_ERROR', providerError.message);
  }
}