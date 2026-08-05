/**
 * 职责: 为管理员还原各 AI 功能实际发送给模型的完整 Prompt 消息
 * 依赖内部: ../context.ts, ./prompt-structures.ts
 * 依赖外部: 无
 * 暴露: inspectPromptStructures
 */

import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { BRIEF_SYSTEM, PROMPT_GENERATION_SYSTEM, briefPayload, projectMessages,
  promptGenerationPayload, translationMessages } from './prompt-structures.js';

interface InspectInput { projectId: string; workspaceId?: string; segmentId?: string }
interface ProjectRow { id: string; name: string; sourceLanguage: string; targetLanguage: string }
interface PromptRow { id: string; title: string; content: string }

function projectRow(context: AppContext, projectId: string): ProjectRow {
  const row = context.db.prepare(`SELECT id, name, source_language AS sourceLanguage,
    target_language AS targetLanguage FROM projects WHERE id = ? AND deleted_at IS NULL`)
    .get(projectId) as ProjectRow | undefined;
  if (!row) throw new AppError(404, 'PROJECT_NOT_FOUND', '项目不存在。');
  return row;
}

function sourceRows(context: AppContext, projectId: string): Array<{ id: string; source: string }> {
  return context.db.prepare(`SELECT s.id, s.source_text AS source FROM segments s
    JOIN documents d ON d.id = s.document_id WHERE d.project_id = ?
    ORDER BY d.document_order, s.segment_order LIMIT 10`).all(projectId) as Array<{ id: string; source: string }>;
}

function publishedPrompt(context: AppContext, projectId: string): PromptRow | null {
  return context.db.prepare(`SELECT pv.id, pv.title, pv.content FROM project_prompt_publications ppp
    JOIN prompt_versions pv ON pv.id = ppp.prompt_version_id
    WHERE ppp.project_id = ? AND ppp.retired_at IS NULL ORDER BY ppp.published_at DESC LIMIT 1`)
    .get(projectId) as PromptRow | undefined || null;
}

function activePrompt(context: AppContext, projectId: string, workspaceId?: string): PromptRow | null {
  if (!workspaceId) return null;
  return context.db.prepare(`SELECT pv.id, pv.title, pv.content FROM project_workspaces pw
    JOIN prompt_versions pv ON pv.id = pw.active_prompt_version_id
    WHERE pw.id = ? AND pw.project_id = ? AND pw.deleted_at IS NULL`).get(workspaceId, projectId) as PromptRow | undefined || null;
}

function currentTranslation(context: AppContext, workspaceId: string | undefined,
  segmentId: string): string | null {
  if (!workspaceId) return null;
  const row = context.db.prepare(`SELECT tv.content FROM workspace_segment_states wss
    JOIN translation_versions tv ON tv.id = wss.current_translation_version_id
    WHERE wss.workspace_id = ? AND wss.segment_id = ?`).get(workspaceId, segmentId) as
    { content: string } | undefined;
  return row?.content || null;
}

function resources(context: AppContext, projectId: string) {
  const terminology = context.db.prepare(`SELECT t.source_term AS source, t.target_term AS target, t.note
    FROM terms t JOIN term_bases tb ON tb.id = t.term_base_id
    WHERE tb.project_id = ? AND t.status = 'approved' ORDER BY t.created_at`).all(projectId);
  const translationMemory = context.db.prepare(`SELECT source_text AS source, target_text AS target
    FROM translation_memory_entries WHERE project_id = ? AND status = 'approved'
    ORDER BY created_at DESC LIMIT 20`).all(projectId);
  return { terminology, translationMemory };
}

function brief(context: AppContext, projectId: string): unknown {
  const row = context.db.prepare(`SELECT pbv.content_json AS content FROM project_brief_states pbs
    JOIN project_brief_versions pbv ON pbv.id = pbs.current_version_id WHERE pbs.project_id = ?`)
    .get(projectId) as { content: string } | undefined;
  return row ? JSON.parse(row.content) : { genre: '', skopos: '', audience: '', register: '', strategy: '' };
}

function translationPayload(context: AppContext, project: ProjectRow, input: InspectInput,
  segment: { id: string; source: string }, published: PromptRow | null, active: PromptRow | null) {
  return { sourceLanguage: project.sourceLanguage, targetLanguage: project.targetLanguage,
    source: segment.source, currentTranslation: currentTranslation(context, input.workspaceId, segment.id),
    overarchingPrompt: published?.content || null,
    customPrompt: active && active.id !== published?.id ? active.content : null,
    ...resources(context, project.id) };
}

export function inspectPromptStructures(context: AppContext, input: InspectInput): unknown {
  const project = projectRow(context, input.projectId);
  const samples = sourceRows(context, project.id);
  const segment = samples.find((item) => item.id === input.segmentId) || samples[0];
  if (!segment) throw new AppError(404, 'PROJECT_SOURCE_EMPTY', '项目没有可检查的原文句段。');
  const published = publishedPrompt(context, project.id);
  const active = activePrompt(context, project.id, input.workspaceId);
  const payload = translationPayload(context, project, input, segment, published, active);
  const sampleText = samples.map((item) => item.source);
  return { project, promptLayers: { overarching: published, custom: active?.id === published?.id ? null : active },
    operations: [
      { id: 'translation', label: '翻译', messages: translationMessages('ai_translation', payload) },
      { id: 'ai_post_edit', label: 'AI 译后编辑', messages: translationMessages('ai_post_edit', payload) },
      { id: 'brief', label: '生成冷启动任务书', messages: projectMessages(BRIEF_SYSTEM, briefPayload(sampleText)) },
      { id: 'prompt_generate', label: '生成全文 Prompt', messages: projectMessages(PROMPT_GENERATION_SYSTEM,
        promptGenerationPayload(brief(context, project.id), sampleText)) },
    ] };
}