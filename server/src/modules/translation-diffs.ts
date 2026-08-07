/**
 * 职责: 生成并保存可复现的译文版本 Diff 产物
 * 依赖内部: ../context.ts, ../shared.ts
 * 依赖外部: Intl.Segmenter
 * 暴露: createVersionDiffArtifacts | backfillVersionDiffArtifacts | latestVersionDiff
 */

import type { AppContext } from '../context.js';
import { jsonText, newId, nowIso } from '../shared.js';

export interface DiffPart { type: 'same' | 'added' | 'removed'; value: string }
interface VersionRow {
  id: string; project_id: string; workspace_id: string | null; segment_id: string;
  parent_version_id: string | null; comparison_version_id: string | null;
  version_kind: string; content: string; content_hash: string; target_language: string;
}

function tokenize(text: string, language: string): string[] {
  if (!text) return [];
  try {
    const segmenter = new Intl.Segmenter(language, { granularity: 'word' });
    return [...segmenter.segment(text)].map((item) => item.segment);
  } catch { return [...text]; }
}

function buildMatrix(before: string[], after: string[]): number[][] {
  const matrix = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let left = 1; left <= before.length; left += 1) {
    for (let right = 1; right <= after.length; right += 1) {
      matrix[left]![right] = before[left - 1] === after[right - 1]
        ? matrix[left - 1]![right - 1]! + 1
        : Math.max(matrix[left - 1]![right]!, matrix[left]![right - 1]!);
    }
  }
  return matrix;
}

function mergeParts(parts: DiffPart[]): DiffPart[] {
  return parts.reduce<DiffPart[]>((result, part) => {
    const last = result.at(-1);
    if (last?.type === part.type) last.value += part.value;
    else result.push({ ...part });
    return result;
  }, []);
}

function traceDiff(before: string[], after: string[], matrix: number[][]): DiffPart[] {
  const parts: DiffPart[] = [];
  let left = before.length; let right = after.length;
  while (left > 0 || right > 0) {
    if (left > 0 && right > 0 && before[left - 1] === after[right - 1]) {
      parts.unshift({ type: 'same', value: before[left - 1]! }); left -= 1; right -= 1;
    } else if (right > 0 && (left === 0 || matrix[left]![right - 1]! >= matrix[left - 1]![right]!)) {
      parts.unshift({ type: 'added', value: after[right - 1]! }); right -= 1;
    } else { parts.unshift({ type: 'removed', value: before[left - 1]! }); left -= 1; }
  }
  return mergeParts(parts);
}

function buildDiff(before: string, after: string, language: string): DiffPart[] {
  const beforeTokens = tokenize(before, language);
  const afterTokens = tokenize(after, language);
  return traceDiff(beforeTokens, afterTokens, buildMatrix(beforeTokens, afterTokens));
}

function versionRow(context: AppContext, versionId: string): VersionRow {
  return context.db.prepare(`SELECT tv.*, p.target_language FROM translation_versions tv
    JOIN projects p ON p.id = tv.project_id WHERE tv.id = ?`).get(versionId) as VersionRow;
}

function artifactStats(parts: DiffPart[]): unknown {
  const count = (type: DiffPart['type']) => parts.filter((part) => part.type === type)
    .reduce((total, part) => total + part.value.length, 0);
  return { addedCharacters: count('added'), removedCharacters: count('removed'),
    changedBlocks: parts.filter((part) => part.type !== 'same').length };
}

function insertArtifact(context: AppContext, fromId: string, to: VersionRow, kind: string): void {
  const from = versionRow(context, fromId);
  const language = to.target_language.split('-')[0] || 'zh';
  const parts = buildDiff(from.content, to.content, language);
  context.db.prepare(`INSERT OR IGNORE INTO translation_diff_artifacts
    (id, project_id, workspace_id, segment_id, from_version_id, to_version_id, diff_kind,
      algorithm_name, algorithm_version, language, diff_json, stats_json, from_content_hash,
      to_content_hash, origin_instance_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(newId(), to.project_id, to.workspace_id, to.segment_id, fromId, to.id, kind,
      'intl-segmenter-lcs', '1.0.0', language, jsonText(parts), jsonText(artifactStats(parts)),
      from.content_hash, to.content_hash, context.instanceId, nowIso());
}

export function createVersionDiffArtifacts(context: AppContext, versionId: string): void {
  const version = versionRow(context, versionId);
  if (version.version_kind === 'ai_post_edit' && version.comparison_version_id) {
    insertArtifact(context, version.comparison_version_id, version, 'ai_to_ai_edit');
  }
  if (version.version_kind !== 'human_post_edit' || !version.comparison_version_id) return;
  insertArtifact(context, version.comparison_version_id, version, 'machine_to_human');
  if (version.parent_version_id && version.parent_version_id !== version.comparison_version_id) {
    insertArtifact(context, version.parent_version_id, version, 'parent_to_child');
  }
}

export function backfillVersionDiffArtifacts(context: AppContext): number {
  const rows = context.db.prepare(`SELECT tv.id FROM translation_versions tv
    WHERE tv.version_kind IN ('ai_post_edit', 'human_post_edit')
      AND NOT EXISTS (SELECT 1 FROM translation_diff_artifacts artifact
        WHERE artifact.to_version_id = tv.id) ORDER BY tv.created_at, tv.rowid`).all() as Array<{ id: string }>;
  context.db.transaction(() => rows.forEach((row) => createVersionDiffArtifacts(context, row.id))).immediate();
  return rows.length;
}

export function latestVersionDiff(context: AppContext, versionId: string, kind: string): unknown | null {
  const row = context.db.prepare(`SELECT id, from_version_id AS fromVersionId,
      algorithm_name AS algorithmName, algorithm_version AS algorithmVersion,
      language, diff_json AS diffJson, stats_json AS statsJson, created_at AS createdAt
    FROM translation_diff_artifacts WHERE to_version_id = ? AND diff_kind = ?
    ORDER BY created_at DESC LIMIT 1`).get(versionId, kind) as
    ({ diffJson: string; statsJson: string } & Record<string, string>) | undefined;
  if (!row) return null;
  return { ...row, parts: JSON.parse(row.diffJson), stats: JSON.parse(row.statsJson) };
}
