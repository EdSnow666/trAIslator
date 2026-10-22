/**
 * 职责: 验证服务器模式刷新时恢复最后项目与句段选择
 * 依赖内部: ../state/store.js
 * 依赖外部: node:assert, node:fs, node:test
 * 暴露: 工作空间持久化与全局隐藏样式回归测试
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getPendingTranslationDraft, getTranslationDraft, saveTranslationDraft } from '../services/translation-drafts.js';

const values = new Map([['translation-aiducator-workspace-v1',
  JSON.stringify({ currentProjectId: 'server-p2', currentSegmentId: 's2' })]]);
globalThis.localStorage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

const { store } = await import('../state/store.js');

function project(id, segmentId) {
  return { id, name: id, prompts: [], segments: [{ id: segmentId, status: 'translated',
    currentTranslationId: null, translations: [] }] };
}

test('服务器项目列表恢复最后工作的项目与句段', () => {
  store.setServerProjects([project('server-p1', 's1'), project('server-p2', 's2')]);
  assert.equal(store.getProject().id, 'server-p2');
  assert.equal(store.getSegment().id, 's2');
  store.selectProject('server-p1');
  const saved = JSON.parse(values.get('translation-aiducator-workspace-v1'));
  assert.equal(saved.currentProjectId, 'server-p1');
});

test('hidden 属性不会被按钮的 flex 或 grid 样式覆盖', () => {
  const css = readFileSync(new URL('../../styles/base.css', import.meta.url), 'utf8');
  assert.match(css, /\[hidden\]\s*{\s*display:\s*none\s*!important;/);
});

test('切回 AI 原译不会被已保存人工版本的旧缓存覆盖，未保存草稿仍保留', () => {
  const original = { id: 'raw', aiText: 'Original AI' };
  const edited = { id: 'human', serverVersionKind: 'human_post_edit', serverParentVersionId: 'raw', postEditText: 'Saved human' };
  const segment = { id: 'draft-segment', translations: [original, edited] };
  const project = { id: 'draft-project' };
  saveTranslationDraft(project.id, segment.id, original.id, 'Saved human');
  assert.equal(getPendingTranslationDraft(project, segment, original), null);
  assert.equal(getTranslationDraft(project.id, segment.id, original.id), 'Saved human');
  saveTranslationDraft(project.id, segment.id, original.id, 'Unsaved human');
  assert.equal(getPendingTranslationDraft(project, segment, original), 'Unsaved human');
});

test('AI 编辑临时草稿不会串入其他当前译文版本', () => {
  const segment = { id: 'ai-draft', currentTranslationId: 'edit', translations: [
    { id: 'raw', aiText: 'Original' },
    { id: 'edit', aiText: 'Original', aiPostEdit: { status: 'applied', resultText: 'AI edited' } },
  ] };
  store.setServerProjects([{ id: 'ai-draft-project', prompts: [], segments: [segment] }]);
  store.beginAiPostEditDraft(segment.id);
  assert.equal(store.getAiPostEditDraft(segment.id).text, 'AI edited');
  store.setCurrentTranslation(segment.id, 'raw');
  assert.equal(store.getAiPostEditDraft(segment.id), null);
});

test('新建项目的 Prompt 继承选项同时显示项目、版本和名称', () => {
  const source = readFileSync(new URL('../ui/dialogs.js', import.meta.url), 'utf8');
  assert.match(source, /project\.name[\s\S]*promptLabel\(prompt\)[\s\S]*prompt\.title/);
});
