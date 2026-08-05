/**
 * 职责: 将系统模板的文档、Prompt、译文与语言资源克隆到教师新项目
 * 依赖内部: ../context.ts, ../errors.ts, ../shared.ts
 * 依赖外部: 无
 * 暴露: cloneTemplateContent
 */

import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { newId, nowIso } from '../shared.js';

interface IdRow { id: string }
interface DocumentRow extends IdRow { title: string; document_order: number; metadata_json: string }
interface SegmentRow extends IdRow {
  document_id: string; segment_key: string; segment_order: number;
  source_text: string; source_hash: string; metadata_json: string;
}
interface LineageRow extends IdRow { name: string }
interface PromptRow extends IdRow {
  lineage_id: string; parent_version_id: string | null; version_number: number;
  title: string; note: string; content: string; content_hash: string; source_type: string;
}
interface TranslationRow extends IdRow {
  segment_id: string; parent_version_id: string | null; base_translation_version_id: string | null;
  prompt_version_id: string | null; version_kind: string; content: string; content_hash: string;
}
interface TermBaseRow extends IdRow { name: string }
interface TermRow extends IdRow {
  term_base_id: string; source_term: string; target_term: string; note: string; status: string;
}
interface MemoryRow extends IdRow {
  source_text: string; target_text: string; source_translation_version_id: string | null; status: string;
}

function ensureSystemTemplate(context: AppContext, templateId: string): void {
  const row = context.db.prepare(`SELECT id FROM projects
    WHERE id = ? AND project_kind = 'system_template' AND deleted_at IS NULL`).get(templateId);
  if (!row) throw new AppError(404, 'TEMPLATE_NOT_FOUND', '系统模板不存在。');
}

function copyDocuments(context: AppContext, sourceId: string, projectId: string): Map<string, string> {
  const rows = context.db.prepare(`SELECT id, title, document_order, metadata_json
    FROM documents WHERE project_id = ? ORDER BY document_order`).all(sourceId) as DocumentRow[];
  const ids = new Map<string, string>();
  const statement = context.db.prepare(`INSERT INTO documents
    (id, project_id, title, document_order, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
  rows.forEach((row) => {
    const id = newId();
    ids.set(row.id, id);
    statement.run(id, projectId, row.title, row.document_order, row.metadata_json, nowIso());
  });
  return ids;
}

function copySegments(context: AppContext, documentIds: Map<string, string>): Map<string, string> {
  const ids = new Map<string, string>();
  const select = context.db.prepare(`SELECT id, document_id, segment_key, segment_order,
    source_text, source_hash, metadata_json FROM segments WHERE document_id = ? ORDER BY segment_order`);
  const insert = context.db.prepare(`INSERT INTO segments (id, document_id, segment_key, segment_order,
    source_text, source_hash, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  documentIds.forEach((documentId, sourceDocumentId) => {
    (select.all(sourceDocumentId) as SegmentRow[]).forEach((row) => {
      const id = newId();
      ids.set(row.id, id);
      insert.run(id, documentId, row.segment_key, row.segment_order, row.source_text,
        row.source_hash, row.metadata_json, nowIso());
    });
  });
  return ids;
}

function copyPromptVersions(context: AppContext, lineage: LineageRow, newLineageId: string,
  userId: string, ids: Map<string, string>): void {
  const rows = context.db.prepare(`SELECT id, lineage_id, parent_version_id, version_number,
    title, note, content, content_hash, source_type FROM prompt_versions
    WHERE lineage_id = ? ORDER BY version_number`).all(lineage.id) as PromptRow[];
  const insert = context.db.prepare(`INSERT INTO prompt_versions (id, lineage_id, parent_version_id,
    created_by, version_number, title, note, content, content_hash, source_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  rows.forEach((row) => {
    const id = newId();
    ids.set(row.id, id);
    insert.run(id, newLineageId, row.parent_version_id ? ids.get(row.parent_version_id) || null : null,
      userId, row.version_number, row.title, row.note, row.content, row.content_hash, row.source_type, nowIso());
  });
}

function copyPrompts(context: AppContext, sourceId: string, projectId: string, userId: string): Map<string, string> {
  const lineages = context.db.prepare(`SELECT id, name FROM prompt_lineages
    WHERE project_id = ? ORDER BY created_at`).all(sourceId) as LineageRow[];
  const ids = new Map<string, string>();
  const insert = context.db.prepare(`INSERT INTO prompt_lineages
    (id, project_id, owner_user_id, name, created_at) VALUES (?, ?, NULL, ?, ?)`);
  lineages.forEach((lineage) => {
    const lineageId = newId();
    insert.run(lineageId, projectId, lineage.name, nowIso());
    copyPromptVersions(context, lineage, lineageId, userId, ids);
  });
  copyActivePrompt(context, sourceId, projectId, userId, ids);
  return ids;
}

function copyActivePrompt(context: AppContext, sourceId: string, projectId: string,
  userId: string, promptIds: Map<string, string>): void {
  const row = context.db.prepare(`SELECT prompt_version_id FROM project_prompt_publications
    WHERE project_id = ? AND retired_at IS NULL ORDER BY published_at DESC LIMIT 1`)
    .get(sourceId) as { prompt_version_id: string } | undefined;
  const promptId = row ? promptIds.get(row.prompt_version_id) : undefined;
  if (!promptId) return;
  context.db.prepare(`INSERT INTO project_prompt_publications
    (id, project_id, prompt_version_id, published_by, published_at)
    VALUES (?, ?, ?, ?, ?)`).run(newId(), projectId, promptId, userId, nowIso());
}

function translationReady(row: TranslationRow, ids: Map<string, string>): boolean {
  const parentReady = !row.parent_version_id || ids.has(row.parent_version_id);
  const baseReady = !row.base_translation_version_id || ids.has(row.base_translation_version_id);
  return parentReady && baseReady;
}

function insertTranslation(context: AppContext, row: TranslationRow, projectId: string, userId: string,
  segmentIds: Map<string, string>, promptIds: Map<string, string>, ids: Map<string, string>): void {
  const id = newId();
  ids.set(row.id, id);
  context.db.prepare(`INSERT INTO translation_versions (id, project_id, segment_id,
    parent_version_id, base_translation_version_id, prompt_version_id, version_kind, scope_type,
    content, content_hash, created_by, origin_instance_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'project', ?, ?, ?, ?, ?)`)
    .run(id, projectId, segmentIds.get(row.segment_id), row.parent_version_id ? ids.get(row.parent_version_id) : null,
      row.base_translation_version_id ? ids.get(row.base_translation_version_id) : null,
      row.prompt_version_id ? promptIds.get(row.prompt_version_id) || null : null,
      row.version_kind, row.content, row.content_hash, userId, context.instanceId, nowIso());
}

function copyTranslations(context: AppContext, sourceId: string, projectId: string, userId: string,
  segmentIds: Map<string, string>, promptIds: Map<string, string>): Map<string, string> {
  let pending = context.db.prepare(`SELECT id, segment_id, parent_version_id, base_translation_version_id,
    prompt_version_id, version_kind, content, content_hash FROM translation_versions
    WHERE project_id = ? AND scope_type = 'project' ORDER BY created_at, rowid`).all(sourceId) as TranslationRow[];
  const ids = new Map<string, string>();
  while (pending.length) {
    const ready = pending.filter((row) => translationReady(row, ids));
    if (!ready.length) throw new AppError(500, 'TEMPLATE_VERSION_GRAPH_INVALID', '模板译文版本关系不完整。');
    ready.forEach((row) => insertTranslation(context, row, projectId, userId, segmentIds, promptIds, ids));
    const readyIds = new Set(ready.map((row) => row.id));
    pending = pending.filter((row) => !readyIds.has(row.id));
  }
  return ids;
}

function copyTerms(context: AppContext, sourceId: string, projectId: string, userId: string): void {
  const bases = context.db.prepare('SELECT id, name FROM term_bases WHERE project_id = ?').all(sourceId) as TermBaseRow[];
  const select = context.db.prepare(`SELECT id, term_base_id, source_term, target_term, note, status
    FROM terms WHERE term_base_id = ? ORDER BY created_at`);
  const insert = context.db.prepare(`INSERT INTO terms (id, term_base_id, source_term, target_term,
    note, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  bases.forEach((base) => {
    const id = newId();
    context.db.prepare(`INSERT INTO term_bases (id, project_id, name, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)`).run(id, projectId, base.name, userId, nowIso());
    (select.all(base.id) as TermRow[]).forEach((term) => insert.run(newId(), id, term.source_term,
      term.target_term, term.note, term.status, userId, nowIso()));
  });
}

function copyMemory(context: AppContext, sourceId: string, projectId: string, userId: string,
  translationIds: Map<string, string>): void {
  const rows = context.db.prepare(`SELECT id, source_text, target_text, source_translation_version_id, status
    FROM translation_memory_entries WHERE project_id = ? ORDER BY created_at`).all(sourceId) as MemoryRow[];
  const insert = context.db.prepare(`INSERT INTO translation_memory_entries (id, project_id, source_text,
    target_text, source_translation_version_id, status, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  rows.forEach((row) => insert.run(newId(), projectId, row.source_text, row.target_text,
    row.source_translation_version_id ? translationIds.get(row.source_translation_version_id) || null : null,
    row.status, userId, nowIso()));
}

export function cloneTemplateContent(context: AppContext, templateId: string,
  projectId: string, userId: string): void {
  ensureSystemTemplate(context, templateId);
  const documentIds = copyDocuments(context, templateId, projectId);
  const segmentIds = copySegments(context, documentIds);
  const promptIds = copyPrompts(context, templateId, projectId, userId);
  const translationIds = copyTranslations(context, templateId, projectId, userId, segmentIds, promptIds);
  copyTerms(context, templateId, projectId, userId);
  copyMemory(context, templateId, projectId, userId, translationIds);
}
