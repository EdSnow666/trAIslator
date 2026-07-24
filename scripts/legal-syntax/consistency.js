/**
 * 职责: 审计新旧历史分析的请求身份与特征词解释一致性
 * 依赖内部: tokenizer.js
 * 依赖外部: 无
 * 暴露: assessAnalysisConsistency
 */

import { textFromTokenRange } from './tokenizer.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'as', 'be', 'is', 'are',
  'was', 'were', 'by', 'in', 'on', 'at', 'for', 'from', 'with', 'that',
  'this', 'such',
]);

export function assessAnalysisConsistency(analysis) {
  const issues = markerCueIssues(analysis);
  if (issues.length) return { status: 'invalid', issues };
  if (isVerifiedAnalysis(analysis)) return { status: 'verified', issues: [] };
  return { status: 'legacy', issues: [] };
}

function markerCueIssues(analysis) {
  if (!analysis?.source?.tokens || !Array.isArray(analysis.markers)) return [];
  return analysis.markers.flatMap((marker) => markerIssues(analysis, marker));
}

function markerIssues(analysis, marker) {
  const surface = textFromTokenRange(
    analysis.source.text,
    analysis.source.tokens,
    marker.token_start,
    marker.token_end,
  );
  const [primaryCue] = quotedEnglishPhrases(marker.explanation_zh || '');
  if (!primaryCue || phrasesOverlap(surface, primaryCue)) return [];
  return [`${marker.id}: ${surface} ≠ ${primaryCue}`];
}

function quotedEnglishPhrases(text) {
  const pattern = /[“"「『]([^”"」』]*[A-Za-z][^”"」』]*)[”"」』]/g;
  return [...text.matchAll(pattern)].map((match) => match[1].trim());
}

function phrasesOverlap(surface, quoted) {
  const surfaceNormalized = normalizePhrase(surface);
  const quotedNormalized = normalizePhrase(quoted);
  if (!surfaceNormalized || !quotedNormalized) return true;
  if (surfaceNormalized.includes(quotedNormalized)) return true;
  if (quotedNormalized.includes(surfaceNormalized)) return true;
  const surfaceWords = significantWords(surface);
  const quotedWords = significantWords(quoted);
  return surfaceWords.some((word) => quotedWords.includes(word));
}

function normalizePhrase(value) {
  return String(value).toLowerCase().replace(/[^a-z]+/g, ' ').trim();
}

function significantWords(value) {
  const words = String(value).toLowerCase().match(/[a-z]+/g) || [];
  return words.filter((word) => !STOP_WORDS.has(word));
}

function isVerifiedAnalysis(analysis) {
  const items = [...(analysis.clauses || []), ...(analysis.spans || []), ...(analysis.markers || [])];
  return analysis.schema_version === '1.1'
    && typeof analysis.request_id === 'string'
    && typeof analysis.source_fingerprint === 'string'
    && items.every((item) => typeof item.surface_text === 'string');
}