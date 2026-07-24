/**
 * 职责: 解析并验证 AI 返回的请求身份、原文片段与法律句法 JSON
 * 依赖内部: tokenizer.js
 * 依赖外部: 无
 * 暴露: parseAnalysisJson | validateAndAttachSource
 */

import { textFromTokenRange, tokenIndex } from './tokenizer.js';

const CLAUSE_ROLES = new Set(['condition', 'co_condition', 'main', 'proviso', 'exception', 'extent']);
const SPAN_ROLES = new Set(['modifier', 'limit', 'exception']);
const MARKER_ROLES = new Set([
  'condition', 'main', 'proviso', 'exception', 'extent',
  'modifier', 'modal', 'coordination', 'negation', 'limit',
]);

export function parseAnalysisJson(content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(clean);
  } catch (error) {
    throw new Error(`AI 返回的内容不是合法 JSON：${error.message}`);
  }
}

export function validateAndAttachSource(raw, source, tokens, identity) {
  const analysis = structuredClone(raw);
  requireValue(analysis.schema_version === '1.1', 'schema_version 必须为 1.1');
  validateIdentity(analysis, identity);
  requireValue(typeof analysis.summary_zh === 'string', '缺少 summary_zh');
  validateCollections(analysis);
  validateIdsAndRanges(analysis, source, tokens);
  validateReferences(analysis);
  validateTranslation(analysis);
  analysis.source = { language: 'en', text: source, tokens };
  return analysis;
}

function validateIdentity(analysis, identity) {
  requireValue(Boolean(identity), '缺少本次请求身份');
  requireValue(
    analysis.request_id === identity.requestId,
    '请求身份不匹配：request_id 不是本次请求',
  );
  requireValue(
    analysis.source_fingerprint === identity.sourceFingerprint,
    '请求身份不匹配：source_fingerprint 不是本次原文',
  );
}

function validateCollections(analysis) {
  requireArray(analysis.clauses, 'clauses');
  requireArray(analysis.spans, 'spans');
  requireArray(analysis.markers, 'markers');
  requireArray(analysis.relations, 'relations');
  requireValue(analysis.translation && typeof analysis.translation === 'object', '缺少 translation');
}

function validateIdsAndRanges(analysis, source, tokens) {
  const allItems = [...analysis.clauses, ...analysis.spans, ...analysis.markers];
  const ids = allItems.map((item) => item.id);
  requireValue(new Set(ids).size === ids.length, 'clauses、spans、markers 的 id 必须唯一');
  validateItemGroup(analysis.clauses, source, tokens, CLAUSE_ROLES, 'c');
  validateItemGroup(analysis.spans, source, tokens, SPAN_ROLES, 's');
  validateItemGroup(analysis.markers, source, tokens, MARKER_ROLES, 'm');
}

function validateItemGroup(items, source, tokens, roles, prefix) {
  items.forEach((item) => {
    requireValue(typeof item.id === 'string' && item.id.startsWith(prefix), `${prefix} 类 id 格式错误`);
    requireValue(roles.has(item.role), `${item.id} 使用了不支持的 role：${item.role}`);
    validateRange(item, tokens);
    validateSurfaceText(item, source, tokens);
  });
}

function validateRange(item, tokens) {
  const start = tokenIndex(tokens, item.token_start);
  const end = tokenIndex(tokens, item.token_end);
  requireValue(start >= 0 && end >= 0, `${item.id} 引用了不存在的 token`);
  requireValue(start <= end, `${item.id} 的 token 范围顺序错误`);
}

function validateSurfaceText(item, source, tokens) {
  requireValue(typeof item.surface_text === 'string', `${item.id} 缺少 surface_text`);
  const expected = textFromTokenRange(source, tokens, item.token_start, item.token_end);
  requireValue(
    item.surface_text === expected,
    `${item.id} 的 surface_text 与 token 范围不一致`,
  );
}

function validateReferences(analysis) {
  const structuralIds = new Set([...analysis.clauses, ...analysis.spans].map((item) => item.id));
  analysis.spans.forEach((item) => validateOptionalReference(item.parent_id, structuralIds, item.id));
  analysis.clauses.forEach((item) => validateOptionalReference(item.parent_id, structuralIds, item.id));
  analysis.relations.forEach((item) => {
    requireValue(structuralIds.has(item.from_id), `关系引用不存在：${item.from_id}`);
    requireValue(structuralIds.has(item.to_id), `关系引用不存在：${item.to_id}`);
  });
}

function validateOptionalReference(value, ids, ownerId) {
  if (value === null || value === undefined || value === '') return;
  requireValue(ids.has(value), `${ownerId} 的 parent_id 不存在：${value}`);
}

function validateTranslation(analysis) {
  const translation = analysis.translation;
  requireValue(typeof translation.full_zh === 'string', '缺少 translation.full_zh');
  requireArray(translation.segments, 'translation.segments');
  const structuralIds = new Set([...analysis.clauses, ...analysis.spans].map((item) => item.id));
  translation.segments.forEach((segment) => validateTranslationSegment(segment, structuralIds));
}

function validateTranslationSegment(segment, structuralIds) {
  requireValue(typeof segment.id === 'string', '译文片段缺少 id');
  requireValue(typeof segment.text_zh === 'string', `${segment.id} 缺少 text_zh`);
  requireArray(segment.source_ids, `${segment.id}.source_ids`);
  segment.source_ids.forEach((id) => {
    requireValue(structuralIds.has(id), `${segment.id} 引用了不存在的结构：${id}`);
  });
}

function requireArray(value, label) {
  requireValue(Array.isArray(value), `${label} 必须是数组`);
}

function requireValue(condition, message) {
  if (!condition) throw new Error(`数据协议校验失败：${message}`);
}