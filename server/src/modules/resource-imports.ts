/**
 * 职责: 将交错式原文/译文段落批量导入术语库、翻译记忆或参考译文
 * 依赖内部: ../auth/types.ts, ../context.ts, ../errors.ts, ../shared.ts, ./access.ts, ./activity.ts, ./translations.ts
 * 依赖外部: 无
 * 暴露: importProjectPairs | ResourceImportKind | ResourcePair
 */

import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { newId, nowIso } from '../shared.js';
import { ensureProjectManage } from './access.js';
import { recordActivity } from './activity.js';
import { addReferenceTranslation } from './translations.js';

export type ResourceImportKind = 'terms' | 'tm' | 'reference';
export interface ResourcePair { source: string; target: string }

function cleanPairs(pairs: ResourcePair[]): ResourcePair[] {
  const cleaned = pairs.map((pair) => ({
    source: String(pair.source || '').trim(), target: String(pair.target || '').trim(),
  })).filter((pair) => pair.source && pair.target);
  if (!cleaned.length) throw new AppError(400, 'RESOURCE_PAIRS_REQUIRED', '没有可导入的原文/译文对。');
  if (cleaned.length > 5000) throw new AppError(400, 'RESOURCE_PAIRS_LIMIT', '单次最多导入 5000 对。');
  return cleaned;
}

function termBaseId(context: AppContext, user: AuthUser, projectId: string): string {
  const existing = context.db.prepare(`SELECT id FROM term_bases
    WHERE project_id = ? ORDER BY created_at LIMIT 1`).get(projectId) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = newId();
  context.db.prepare(`INSERT INTO term_bases (id, project_id, name, created_by, created_at)
    VALUES (?, ?, '项目术语库', ?, ?)`).run(id, projectId, user.id, nowIso());
  return id;
}

function insertTerms(context: AppContext, user: AuthUser, projectId: string,
  pairs: ResourcePair[]): void {
  const baseId = termBaseId(context, user, projectId);
  const insert = context.db.prepare(`INSERT INTO terms (id, term_base_id, source_term,
    target_term, note, status, created_by, created_at) VALUES (?, ?, ?, ?, '', 'approved', ?, ?)`);
  pairs.forEach((pair) => insert.run(newId(), baseId, pair.source, pair.target, user.id, nowIso()));
}

function insertTm(context: AppContext, user: AuthUser, projectId: string,
  pairs: ResourcePair[]): void {
  const insert = context.db.prepare(`INSERT INTO translation_memory_entries (id, project_id,
    source_text, target_text, source_translation_version_id, status, created_by, created_at)
    VALUES (?, ?, ?, ?, NULL, 'approved', ?, ?)`);
  pairs.forEach((pair) => insert.run(newId(), projectId, pair.source, pair.target, user.id, nowIso()));
}

function projectSegments(context: AppContext, projectId: string) {
  return context.db.prepare(`SELECT s.id, s.source_text AS source FROM segments s
    JOIN documents d ON d.id = s.document_id WHERE d.project_id = ?
    ORDER BY d.document_order, s.segment_order`).all(projectId) as Array<{ id: string; source: string }>;
}

function insertReferences(context: AppContext, user: AuthUser, projectId: string,
  pairs: ResourcePair[]): void {
  const segments = projectSegments(context, projectId);
  if (pairs.length > segments.length) throw new AppError(400, 'REFERENCE_PAIR_COUNT', '参考译文对数超过项目句段数。');
  pairs.forEach((pair, index) => {
    const segment = segments[index]!;
    if (segment.source.trim() !== pair.source) {
      throw new AppError(400, 'REFERENCE_SOURCE_MISMATCH', `第 ${index + 1} 对原文与项目句段不一致。`);
    }
    addReferenceTranslation(context, user, projectId,
      { segmentId: segment.id, content: pair.target });
  });
}

export function importProjectPairs(context: AppContext, user: AuthUser, projectId: string,
  kind: ResourceImportKind, inputPairs: ResourcePair[]): number {
  ensureProjectManage(context, user, projectId);
  const pairs = cleanPairs(inputPairs);
  context.db.transaction(() => {
    if (kind === 'terms') insertTerms(context, user, projectId, pairs);
    else if (kind === 'tm') insertTm(context, user, projectId, pairs);
    else insertReferences(context, user, projectId, pairs);
    recordActivity(context, { eventType: `resource.${kind}_imported`, actorUserId: user.id,
      projectId, metadata: { pairCount: pairs.length, alignment: 'alternating_paragraphs' } });
  }).immediate();
  return pairs.length;
}
