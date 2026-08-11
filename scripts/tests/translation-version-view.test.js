/**
 * 职责: 验证不可变译文记录在前端被折叠为逻辑译文版本
 * 依赖内部: ../services/translation-version-view.js
 * 依赖外部: node:test, node:assert
 * 暴露: 无
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { translationRootCount, translationSequenceNumber,
  visibleTranslationVersions } from '../services/translation-version-view.js';

function serverSegment(currentTranslationId) {
  return {
    currentTranslationId,
    translations: [
      { id: 'ai-a', serverVersionKind: 'machine_translation' },
      { id: 'human-a1', serverVersionKind: 'human_post_edit', serverComparisonVersionId: 'ai-a' },
      { id: 'human-a2', serverVersionKind: 'human_post_edit', serverComparisonVersionId: 'ai-a' },
      { id: 'ai-b', serverVersionKind: 'machine_translation' },
      { id: 'reference', serverVersionKind: 'manual_reference' },
    ],
  };
}

test('当前人工版本与其 AI 基线合并为一张逻辑卡片', () => {
  const visible = visibleTranslationVersions(serverSegment('human-a1'));
  assert.deepEqual(visible.map((item) => item.id), ['human-a1', 'ai-b', 'reference']);
});

test('未选中人工版本时保留同一 AI 基线上的最新编辑', () => {
  const visible = visibleTranslationVersions(serverSegment('ai-b'));
  assert.deepEqual(visible.map((item) => item.id), ['human-a2', 'ai-b', 'reference']);
});

test('本地内嵌译后编辑版本不被误删', () => {
  const local = { id: 'local', aiText: 'AI', postEditText: 'Human' };
  const visible = visibleTranslationVersions({ currentTranslationId: 'local', translations: [local] });
  assert.deepEqual(visible, [local]);
});

test('AI 和人工编辑沿用根译本序号', () => {
  const translations = [
    { id: 'ai-1', serverVersionKind: 'ai_translation' },
    { id: 'edit-1', serverVersionKind: 'human_post_edit', serverRootVersionId: 'ai-1' },
    { id: 'ai-2', serverVersionKind: 'ai_translation' },
    { id: 'ai-edit-2', serverVersionKind: 'ai_post_edit', serverRootVersionId: 'ai-2' },
  ];
  assert.equal(translationSequenceNumber(translations[1], translations), 1);
  assert.equal(translationSequenceNumber(translations[3], translations), 2);
  assert.equal(translationRootCount(translations), 2);
});

test('空译文句段不会计算版本序号', () => {
  assert.equal(translationSequenceNumber(undefined, []), 0);
});
