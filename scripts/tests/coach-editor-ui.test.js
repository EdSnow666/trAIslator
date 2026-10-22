/**
 * 职责: 验证教练编辑入口可独立保存，规则加入正确类型草稿
 * 依赖内部: ../ui/dialogs.js, ../app.js
 * 依赖外部: node:assert, node:test, node:fs, node:vm
 * 暴露: 教练编辑与目标选择交互回归测试
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

globalThis.localStorage = { getItem: () => null, setItem() {} };
const modalRoot = { innerHTML: '' };
globalThis.document = { querySelector: () => modalRoot };
const { dialogs } = await import('../ui/dialogs.js');

test('独立教练编辑窗口提供保存和生成，运行窗口仍可运行', () => {
  const settings = { defaultPrompt: '默认规则', effectivePrompt: '我的规则', customPrompt: '我的规则' };
  dialogs.openPromptCoachSetup([{ id: 'p', name: '项目', direction: 'EN → ZH' }], settings, 'p', { editorOnly: true });
  assert.match(modalRoot.innerHTML, /data-action="save-coach-prompt"/);
  assert.match(modalRoot.innerHTML, /data-action="generate-coach-instruction"/);
  assert.doesNotMatch(modalRoot.innerHTML, /data-action="confirm-run-prompt-coach"/);
  assert.match(modalRoot.innerHTML, /我的规则/);
  dialogs.openPromptCoachSetup([], settings, 'p');
  assert.match(modalRoot.innerHTML, /data-action="confirm-run-prompt-coach"/);
});

test('加入规则先选目标，译后编辑草稿使用译后编辑基础内容', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const start = app.indexOf('let pendingCoachRules = null;');
  const end = app.indexOf('function promptFormInput()', start);
  assert.ok(start >= 0 && end > start);
  let draft = null; let chooser = '';
  const project = { id: 'p', activePromptId: 't', activePostEditPromptId: 'pe',
    promptCoachResult: { rules: [{ id: 'r' }], summary: { traceCount: 1 } } };
  const context = vm.createContext({
    promptEditingBlocked: () => false,
    store: { getProject: () => project, getPrompt: (id) => ({ content: id === 'pe' ? '编辑基础' : '翻译基础' }) },
    document: { querySelectorAll: () => [{ dataset: { coachRule: 'r' } }] },
    buildPromptRuleAppendix: () => '规则内容', showToast: () => {},
    dialogs: { modal: (_title, _body, footer) => { chooser = footer; },
      openPromptModal: (content, options) => { draft = { content, ...options }; } },
  });
  vm.runInContext(`${app.slice(start, end)}\napplyCoachRules();`, context);
  assert.match(chooser, /data-prompt-kind="post_edit"/);
  assert.equal(draft, null);
  vm.runInContext("confirmCoachRuleTarget({dataset:{promptKind:'post_edit'}})", context);
  assert.equal(draft.promptKind, 'post_edit');
  assert.equal(draft.content, '编辑基础\n\n规则内容');
  vm.runInContext("applyCoachRules(); confirmCoachRuleTarget({dataset:{promptKind:'translation'}})", context);
  assert.equal(draft.promptKind, 'translation');
  assert.equal(draft.content, '翻译基础\n\n规则内容');
  project.aiPostEditAllowed = false;
  vm.runInContext('applyCoachRules();', context);
  assert.doesNotMatch(chooser, /data-prompt-kind="post_edit"/);
});
