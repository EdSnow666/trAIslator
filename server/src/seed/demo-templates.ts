/**
 * 职责: 导入四个系统模板，并为既有模板回填可继承的版本化任务书
 * 依赖内部: ../config.ts, ../context.ts, ../modules/activity.ts, ../shared.ts
 * 依赖外部: node:path, node:url
 * 暴露: seedDemoTemplates
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appConfig } from '../config.js';
import type { AppContext } from '../context.js';
import { recordActivity } from '../modules/activity.js';
import { jsonText, nowIso, sha256 } from '../shared.js';

interface DemoPrompt { id: string; version: number; title: string; note: string; content: string }
interface DemoTranslation {
  id: string; promptId: string | null; aiText: string; postEditText?: string;
  origin?: string; aiPostEdit?: { resultText?: string; proposedText?: string };
}
interface DemoSegment { id: string; source: string; currentTranslationId: string; translations: DemoTranslation[] }
interface DemoProject {
  id: string; name: string; direction: string; sourceLang: string; targetLang: string;
  brief: unknown; activePromptId: string; prompts: DemoPrompt[]; segments: DemoSegment[];
  terms: Array<{ source: string; target: string; note?: string }>;
  tm: Array<{ source: string; target: string }>;
}

function projectExists(context: AppContext, projectId: string): boolean {
  return Boolean(context.db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId));
}

function ensureTemplateBrief(context: AppContext, project: DemoProject): void {
  const existing = context.db.prepare('SELECT 1 FROM project_brief_states WHERE project_id = ?')
    .get(project.id);
  if (existing) return;
  const id = `${project.id}:brief:seed`;
  context.db.prepare(`INSERT OR IGNORE INTO project_brief_versions
    (id, project_id, source_type, content_json, sample_manifest_json, created_at)
    VALUES (?, ?, 'human', ?, '{}', ?)`).run(id, project.id, jsonText(project.brief || {}), nowIso());
  context.db.prepare(`INSERT OR IGNORE INTO project_brief_states (project_id, current_version_id)
    VALUES (?, ?)`).run(project.id, id);
}

function insertProject(context: AppContext, project: DemoProject): void {
  const time = nowIso();
  context.db.prepare(`INSERT INTO projects (id, project_kind, name, direction, source_language,
    target_language, description, status, origin_instance_id, created_at, updated_at, published_at)
    VALUES (?, 'system_template', ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?)`)
    .run(project.id, project.name, project.direction, project.sourceLang, project.targetLang,
      jsonText(project.brief), context.instanceId, time, time, time);
}

function insertPrompts(context: AppContext, project: DemoProject): Map<string, string> {
  const lineageId = `${project.id}:prompt-lineage`;
  context.db.prepare(`INSERT INTO prompt_lineages (id, project_id, name, created_at)
    VALUES (?, ?, ?, ?)`).run(lineageId, project.id, '系统模板 Prompt 谱系', nowIso());
  const ids = new Map<string, string>();
  project.prompts.forEach((prompt, index) => {
    const id = `${project.id}:prompt:${prompt.id}`;
    ids.set(prompt.id, id);
    context.db.prepare(`INSERT INTO prompt_versions (id, lineage_id, parent_version_id, version_number,
      title, note, content, content_hash, source_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'imported', ?)`)
      .run(id, lineageId, index ? `${project.id}:prompt:${project.prompts[index - 1]!.id}` : null,
        prompt.version, prompt.title, prompt.note || '', prompt.content, sha256(prompt.content), nowIso());
  });
  const activeId = ids.get(project.activePromptId);
  if (activeId) context.db.prepare(`INSERT INTO project_prompt_publications
    (id, project_id, prompt_version_id, published_by, published_at) VALUES (?, ?, ?, NULL, ?)`)
    .run(`${project.id}:publication`, project.id, activeId, nowIso());
  return ids;
}

function insertTranslation(context: AppContext, project: DemoProject, segmentId: string,
  translation: DemoTranslation, promptIds: Map<string, string>): void {
  const baseId = `${project.id}:translation:${translation.id}`;
  const kind = translation.origin === 'manual' ? 'manual_reference' : 'ai_translation';
  context.db.prepare(`INSERT INTO translation_versions (id, project_id, segment_id, prompt_version_id,
    version_kind, scope_type, content, content_hash, origin_instance_id, created_at)
    VALUES (?, ?, ?, ?, ?, 'project', ?, ?, ?, ?)`)
    .run(baseId, project.id, segmentId, kind === 'manual_reference' ? null : promptIds.get(translation.promptId || '') || null,
      kind, translation.aiText, sha256(translation.aiText), context.instanceId, nowIso());
  insertDerivedVersions(context, project.id, segmentId, baseId, translation, promptIds);
}

function insertDerivedVersions(context: AppContext, projectId: string, segmentId: string,
  baseId: string, translation: DemoTranslation, promptIds: Map<string, string>): void {
  const aiText = translation.aiPostEdit?.resultText || translation.aiPostEdit?.proposedText;
  const postEdit = translation.postEditText?.trim();
  let parentId = baseId;
  if (aiText) {
    parentId = `${baseId}:ai-edit`;
    insertDerivedVersion(context, parentId, projectId, segmentId, baseId, translation, promptIds,
      'ai_post_edit', aiText);
  }
  if (postEdit && postEdit !== aiText) insertDerivedVersion(context, `${baseId}:human-edit`, projectId,
    segmentId, parentId, translation, promptIds, 'human_post_edit', postEdit);
}

function insertDerivedVersion(context: AppContext, id: string, projectId: string, segmentId: string,
  parentId: string, translation: DemoTranslation, promptIds: Map<string, string>, kind: string, content: string): void {
  context.db.prepare(`INSERT INTO translation_versions (id, project_id, segment_id, parent_version_id,
    base_translation_version_id, prompt_version_id, version_kind, scope_type, content, content_hash,
    origin_instance_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'project', ?, ?, ?, ?)`)
    .run(id, projectId, segmentId, parentId, parentId, promptIds.get(translation.promptId || '') || null,
      kind, content, sha256(content), context.instanceId, nowIso());
}

function insertSegments(context: AppContext, project: DemoProject, promptIds: Map<string, string>): void {
  const documentId = `${project.id}:document`;
  context.db.prepare(`INSERT INTO documents (id, project_id, title, document_order, created_at)
    VALUES (?, ?, ?, 1, ?)`).run(documentId, project.id, project.name, nowIso());
  project.segments.forEach((segment, index) => {
    const id = `${project.id}:segment:${segment.id}`;
    context.db.prepare(`INSERT INTO segments (id, document_id, segment_key, segment_order,
      source_text, source_hash, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, documentId, segment.id, index + 1, segment.source, sha256(segment.source),
        jsonText({ legacyCurrentTranslationId: segment.currentTranslationId }), nowIso());
    segment.translations.forEach((translation) => insertTranslation(context, project, id, translation, promptIds));
  });
}

function insertResources(context: AppContext, project: DemoProject): void {
  const termBaseId = `${project.id}:terms`;
  context.db.prepare(`INSERT INTO term_bases (id, project_id, name, created_at)
    VALUES (?, ?, '系统模板术语库', ?)`).run(termBaseId, project.id, nowIso());
  project.terms.forEach((term, index) => context.db.prepare(`INSERT INTO terms
    (id, term_base_id, source_term, target_term, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(`${termBaseId}:${index + 1}`, termBaseId, term.source, term.target, term.note || '', nowIso()));
  project.tm.forEach((item, index) => context.db.prepare(`INSERT INTO translation_memory_entries
    (id, project_id, source_text, target_text, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(`${project.id}:tm:${index + 1}`, project.id, item.source, item.target, nowIso()));
}

async function loadDemoProjects(): Promise<DemoProject[]> {
  const sourcePath = resolve(appConfig.rootDir, 'scripts/data/demo-projects.js');
  const module = await import(pathToFileURL(sourcePath).href) as {
    createDemoProjects: () => DemoProject[];
  };
  return module.createDemoProjects();
}

export async function seedDemoTemplates(context: AppContext): Promise<{ inserted: number; skipped: number }> {
  const projects = await loadDemoProjects();
  let inserted = 0;
  let skipped = 0;
  projects.forEach((project) => {
    if (projectExists(context, project.id)) {
      context.db.transaction(() => ensureTemplateBrief(context, project)).immediate();
      skipped += 1;
      return;
    }
    context.db.transaction(() => {
      insertProject(context, project);
      ensureTemplateBrief(context, project);
      const promptIds = insertPrompts(context, project);
      insertSegments(context, project, promptIds);
      insertResources(context, project);
      recordActivity(context, { eventType: 'system_template.seeded', actorKind: 'system', projectId: project.id });
    }).immediate();
    inserted += 1;
  });
  return { inserted, skipped };
}