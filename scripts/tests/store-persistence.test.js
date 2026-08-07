/**
 * 职责: 验证服务器模式刷新时恢复最后项目与句段选择
 * 依赖内部: ../state/store.js
 * 依赖外部: node:assert, node:test
 * 暴露: 工作空间持久化测试
 */

import assert from 'node:assert/strict';
import test from 'node:test';

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
