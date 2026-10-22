/**
 * 职责: 验证原译与编辑版本独立展示及双向关联
 * 依赖内部: ../services/translation-version-view.js
 * 依赖外部: node:test, node:assert
 * 暴露: 无
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { translationRootCount, translationSequenceNumber,
  visibleTranslationVersions, translationVersionLabel, linkedTranslationVersions } from '../services/translation-version-view.js';

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

test('当前人工版本和原始 AI 译文分别展示', () => {
  const visible = visibleTranslationVersions(serverSegment('human-a1'));
  assert.deepEqual(visible.map((item) => item.id), ['ai-a', 'human-a1', 'human-a2', 'ai-b', 'reference']);
});

test('切换当前版本不丢失任何人工编辑记录', () => {
  const visible = visibleTranslationVersions(serverSegment('ai-b'));
  assert.deepEqual(visible.map((item) => item.id), ['ai-a', 'human-a1', 'human-a2', 'ai-b', 'reference']);
});

test('原译与人工编辑之间可以双向查找且编辑沿用根序号', () => {
  const segment = serverSegment('human-a2');
  const [original, first, second] = segment.translations;
  assert.equal(translationVersionLabel(first, segment.translations), 'T1-H1');
  assert.equal(translationVersionLabel(second, segment.translations), 'T1-H2');
  assert.deepEqual(linkedTranslationVersions(segment, original).map(({ item }) => item.id), ['human-a1', 'human-a2']);
  assert.deepEqual(linkedTranslationVersions(segment, first).map(({ item }) => item.id), ['ai-a']);
});

test('人工编辑 AI 译后编辑时链接直接来源，根版本标签不变', () => {
  const segment = { translations: [
    { id: 'root', serverVersionKind: 'ai_translation' },
    { id: 'ai-edit', serverVersionKind: 'ai_post_edit', serverRootVersionId: 'root', serverParentVersionId: 'root' },
    { id: 'human', serverVersionKind: 'human_post_edit', serverRootVersionId: 'root', serverParentVersionId: 'ai-edit' },
  ] };
  assert.equal(translationVersionLabel(segment.translations[2], segment.translations), 'T1-H1');
  assert.deepEqual(linkedTranslationVersions(segment, segment.translations[1]).map(({ item }) => item.id), ['root', 'human']);
  assert.equal(linkedTranslationVersions(segment, segment.translations[2])[0].item.id, 'ai-edit');
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
