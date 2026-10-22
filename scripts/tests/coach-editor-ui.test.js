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
import { analyzePromptCoach, buildPromptRuleAppendix } from '../services/prompt-coach.js';

test('规则加入草稿时完整携带真实改写示例', () => {
  const instruction = '先交代说话者。\nAI 原译：“你好，”她说道。\n人工改写：她说：“你好。”\n示例展示引语归属前置。';
  assert.ok(buildPromptRuleAppendix([{ instruction }]).includes(instruction));
});

globalThis.localStorage = { getItem: () => null, setItem() {} };
const modalRoot = { innerHTML: '' };
globalThis.document = { querySelector: () => modalRoot };
const { dialogs } = await import('../ui/dialogs.js');

test('独立教练编辑窗口提供保存和生成，运行窗口仍可运行', () => {
  const settings = { defaultPrompt: '默认规则', effectivePrompt: '我的规则', customPrompt: '我的规则',
    activeVersionId: 'v1', versions: [{ id: 'v1', version: 1, title: '引语分析', content: '我的规则' }] };
  dialogs.openPromptCoachSetup([{ id: 'p', name: '项目', direction: 'EN → ZH' }], settings, 'p', { editorOnly: true });
  assert.match(modalRoot.innerHTML, /data-action="save-coach-prompt"/);
  assert.match(modalRoot.innerHTML, /data-action="generate-coach-instruction"/);
  assert.doesNotMatch(modalRoot.innerHTML, /data-action="confirm-run-prompt-coach"/);
  assert.match(modalRoot.innerHTML, /我的规则/);
  assert.match(modalRoot.innerHTML, /v1 · 引语分析 · 当前使用/);
  assert.match(modalRoot.innerHTML, /data-action="activate-coach-prompt-version"/);
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

test('教练预览按独立人工版本学习，不依赖 T2 位置或当前显示版本', () => {
  const raw = { id: 'raw', serverVersionKind: 'ai_translation', aiText: '项目进行了规划。' };
  const human = { id: 'human', serverVersionKind: 'human_post_edit', serverParentVersionId: 'raw', aiText: raw.aiText, postEditText: '项目规划。' };
  for (const translations of [[human, raw], [raw, { id: 'reference', serverVersionKind: 'manual_reference' }, human]]) {
    const result = analyzePromptCoach({ segments: [{ id: 's', currentTranslationId: raw.id, translations }] });
    assert.equal(result.editedCount, 1);
    assert.equal(result.rules[0].evidence[0].aiText, raw.aiText);
    assert.equal(result.rules[0].evidence[0].postEditText, human.postEditText);
  }
});

test('教练运行失败保持错误窗口，不再直接关闭；成功显示结果窗口', async () => {
  const source = readFileSync(new URL('../ui/prompt-coach-actions.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function executeProjectCoach(');
  const end = source.indexOf('export function resetPromptCoachPrompt', start);
  let failure = true; let resultWindow = 0; let closed = 0; let errorText = '';
  const project = { id: 'p' };
  const context = vm.createContext({ activeCoach: {},
    confirmSelectedProjects: async () => {},
    runServerProjectPromptCoach: async () => { if (failure) throw new Error('模型证据无效'); return { rules: [] }; },
    refreshServerProject: async () => project,
    store: { replaceServerProject() {}, getProject: () => project, setPromptCoachResult() {} },
    dialogs: { updatePromptCoachProgress() {}, closeModal() { closed++; },
      modal(_title, body) { errorText = body; }, openResourceModal() { resultWindow++; } },
    showToast() {},
  });
  vm.runInContext(source.slice(start, end), context);
  const input = { projects: [project], ids: ['p'] }; const controller = { signal: { aborted: false } };
  await context.executeProjectCoach(input, 'r', controller);
  assert.equal(closed, 0);
  assert.match(errorText, /模型证据无效/);
  failure = false;
  await context.executeProjectCoach(input, 'r2', controller);
  assert.equal(resultWindow, 1);
});
