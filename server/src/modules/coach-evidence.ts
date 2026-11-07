/**
 * 职责: 将模型修改句模糊定位到真实人工记录，并用原始 Diff 对齐机器文本
 * 依赖内部: ./translation-diffs.ts
 * 依赖外部: 无
 * 暴露: matchCoachEvidence | locateChangedSentence | projectCoachEvidence
 */
import { buildDiff, type DiffPart } from './translation-diffs.js';

interface Evidence { aiText: string; postEditText: string; diff: unknown[] }
interface Span { start: number; end: number; score: number }

export const COACH_EVIDENCE_INSTRUCTION = 'For each rule also return changedSentences: an array of one or two corresponding human-edited sentences copied from postEditText. Return the actual changed sentences, not the whole paragraph or an explanation. The backend locates these sentences in the cited records; no offsets or extra evidence objects are needed.';

function normalized(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
}

function similarity(left: string, right: string): number {
  if (!left.length || !right.length) return 0;
  let prior = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) next[j] = Math.min(next[j - 1]! + 1,
      prior[j]! + 1, prior[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1));
    prior = next;
  }
  return 1 - prior[right.length]! / Math.max(left.length, right.length);
}

export function locateChangedSentence(text: string, query: string): Span | null {
  query = query.trim();
  if (query.length < 4 || query.length > 1500 || text.length > 50000) return null;
  const exact = text.indexOf(query);
  // 重复引句不强行绑定到第一次出现的位置。
  if (exact >= 0 && text.indexOf(query, exact + 1) < 0) return { start: exact, end: exact + query.length, score: 1 };
  const needle = normalized(query);
  if (needle.length < 4) return null;
  // 忽略引号、逗号、省略号后仍是连续原句时，保留真实字符位置。
  let folded = ''; const starts: number[] = []; const ends: number[] = [];
  let offset = 0;
  for (const char of text) {
    const value = normalized(char);
    for (let i = 0; i < value.length; i++) { starts.push(offset); ends.push(offset + char.length); }
    folded += value; offset += char.length;
  }
  const normalizedIndex = folded.indexOf(needle);
  if (normalizedIndex >= 0 && folded.indexOf(needle, normalizedIndex + 1) < 0) {
    return { start: starts[normalizedIndex]!, end: ends[normalizedIndex + needle.length - 1]!, score: 1 };
  }
  const candidates: Span[] = [];
  for (const pattern of [/[^。！？!?；;\n]+[。！？!?；;\n]*/gu,
    /[^。！？!?；;，,\n]+[。！？!?；;，,\n]*/gu]) {
    const units = [...text.matchAll(pattern)];
    for (let i = 0; i < units.length; i++) {
      for (let width = 1; width <= 3 && i + width <= units.length; width++) {
        const start = units[i]!.index!;
        const last = units[i + width - 1]!;
        const end = last.index! + last[0].length;
        const candidate = normalized(text.slice(start, end));
        if (candidate.length < needle.length * 0.55 || candidate.length > needle.length * 1.8) continue;
        if (!candidates.some((c) => c.start === start && c.end === end)) candidates.push({ start, end, score: similarity(needle, candidate) });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 0.65) return null;
  const rival = candidates.find((item) => item.end <= best.start || item.start >= best.end);
  if (rival && best.score - rival.score < 0.08) return null;
  return best;
}

function machineSlice(parts: DiffPart[], span: Span): string {
  let cursor = 0; let before = '';
  for (let i = 0; i < parts.length;) {
    const part = parts[i]!;
    if (part.type === 'same') {
      const start = Math.max(0, span.start - cursor);
      const end = Math.min(part.value.length, span.end - cursor);
      if (end > start) before += part.value.slice(start, end);
      cursor += part.value.length; i++; continue;
    }
    // 将连续增删视为一个编辑块，防止替换末端的删除丢失。
    let removed = ''; let added = '';
    while (i < parts.length && parts[i]!.type !== 'same') {
      const edit = parts[i++]!;
      if (edit.type === 'removed') removed += edit.value;
      else added += edit.value;
    }
    if (added.length ? cursor < span.end && cursor + added.length > span.start
      : cursor >= span.start && cursor < span.end) before += removed;
    cursor += added.length;
  }
  return before;
}

function legacySentences(instruction: string): string[] {
  return [...instruction.matchAll(/人工改写\s*[:：]\s*([\s\S]*?)(?=\s*(?:说明\s*[:：]|AI\s*原译\s*[:：]|该例|该示例)|$)/gu)]
    .map((item) => item[1]!.trim());
}

export function matchCoachEvidence(item: Evidence, sentences: unknown, instruction = ''): object {
  const queries = Array.isArray(sentences) ? sentences.filter((s): s is string => typeof s === 'string').slice(0, 6)
    : legacySentences(instruction).slice(0, 6);
  const parts = item.diff as DiffPart[];
  if (parts.some((p) => !p || !['same', 'added', 'removed'].includes(p.type) || typeof p.value !== 'string')) return {};
  const reconstructed = parts.filter((p) => p.type !== 'removed').map((p) => p.value).join('');
  if (reconstructed !== item.postEditText) return { evidenceMatch: 'unmatched' };
  const matches = queries.flatMap((query) => {
    const span = locateChangedSentence(item.postEditText, query);
    if (!span) return [];
    const aiText = machineSlice(parts, span);
    const postEditText = item.postEditText.slice(span.start, span.end);
    const diff = buildDiff(aiText, postEditText, 'zh');
    if (!diff.some((p) => p.type !== 'same')) return [];
    return [{ query, ...span, aiText, postEditText, diff }];
  }).filter((m, index, all) => all.findIndex((other) => other.start === m.start && other.end === m.end) === index);
  return { evidenceMatch: matches.length ? 'matched' : 'unmatched', matchedSentences: matches };
}

// 旧历史只做读取时投影，数据库中的原始响应、完整 Diff 和历史 JSON 不回写。
export function projectCoachEvidence(result: any): any {
  if (!Array.isArray(result?.rules)) return result;
  return { ...result, rules: result.rules.map((rule: any) => ({ ...rule,
    evidence: Array.isArray(rule.evidence) ? rule.evidence.map((item: any) => ({ ...item,
      ...(item.evidenceMatch ? {} : matchCoachEvidence(item, undefined, rule.instruction || '')) })) : [] })) };
}
