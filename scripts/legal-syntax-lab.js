/**
 * 职责: 绑定法律句法实验室的输入、AI、着色、讲解和拖拽交互
 * 依赖内部: data.js, prompt.js, tokenizer.js, ai-service.js, render.js, practice.js, history-store.js, history-ui.js, consistency.js, docx-export.js
 * 依赖外部: DOM API, localStorage, IndexedDB
 * 暴露: 页面入口
 */

import { EXAMPLE_OPTIONS, getPreparedExample } from './legal-syntax/data.js';
import { DEFAULT_USER_PROMPT, SCHEMA_PREVIEW } from './legal-syntax/prompt.js';
import { tokenizeSource } from './legal-syntax/tokenizer.js';
import { analyseWithAI, loadApiPreferences, saveApiPreferences } from './legal-syntax/ai-service.js';
import { applyColorState, renderAnalysis, renderInputOverlay, selectStructure } from './legal-syntax/render.js';
import { countHistoryRecords, listHistoryRecords, saveHistoryRecord } from './legal-syntax/history-store.js';
import {
  renderHistoryList,
  selectedHistoryIds,
  setAllHistorySelected,
  updateHistoryCount,
  updateHistorySelection,
} from './legal-syntax/history-ui.js';
import { downloadHistoryDocx } from './legal-syntax/docx-export.js';
import { assessAnalysisConsistency } from './legal-syntax/consistency.js';
import {
  loadPractice,
  resetNesting,
  setupPractice,
  showSequenceAnswer,
  shuffleSequence,
} from './legal-syntax/practice.js';

const PROMPT_STORAGE_KEY = 'legal-syntax-lab-prompt-v1';
const state = {
  selectedExampleId: EXAMPLE_OPTIONS[0].id,
  analysis: null,
  colors: { keywords: true, structure: true },
  userPrompt: loadPrompt(),
  apiConfig: { ...loadApiPreferences(), apiKey: '' },
  historyRecords: [],
  toastTimer: null,
};

function init() {
  setupPractice();
  bindEvents();
  hydrateDialogs();
  loadExampleSource(state.selectedExampleId);
  applyColorState(state.colors, false);
  refreshHistoryCount();
}

function bindEvents() {
  bindClick('#toggle-keywords', () => toggleColor('keywords'));
  bindClick('#toggle-structure', () => toggleColor('structure'));
  bindClick('#load-analysis-button', loadSeedAnalysis);
  bindClick('#analyse-button', handleAiAnalysis);
  bindClick('#clear-button', clearSource);
  bindClick('#prompt-button', openPromptDialog);
  bindClick('#api-button', openApiDialog);
  bindClick('#history-button', openHistoryDialog);
  bindClick('#export-history-button', exportSelectedHistory);
  bindClick('#save-prompt-button', savePrompt);
  bindClick('#reset-prompt-button', resetPrompt);
  bindClick('#save-api-button', saveApiConfig);
  bindClick('#shuffle-sequence', shuffleSequence);
  bindClick('#show-sequence-answer', showSequenceAnswer);
  bindClick('#reset-nesting', resetNesting);
  document.querySelector('#example-select').addEventListener('change', handleExampleChange);
  document.querySelector('#source-input').addEventListener('input', handleSourceInput);
  document.querySelector('#source-input').addEventListener('scroll', syncEditorScroll);
  document.querySelector('.mode-switch').addEventListener('click', changeMode);
  document.querySelector('#analysis-workspace').addEventListener('click', handleStructureClick);
  document.querySelector('#history-select-all').addEventListener('change', handleSelectAll);
  document.querySelector('#history-list').addEventListener('change', updateHistorySelection);
  document.querySelector('#history-list').addEventListener('click', openHistoryRecord);
}

function bindClick(selector, handler) {
  document.querySelector(selector).addEventListener('click', handler);
}

function hydrateDialogs() {
  document.querySelector('#prompt-editor').value = state.userPrompt;
  document.querySelector('#schema-preview').textContent = JSON.stringify(SCHEMA_PREVIEW, null, 2);
  document.querySelector('#api-endpoint').value = state.apiConfig.endpoint || '';
  document.querySelector('#api-model').value = state.apiConfig.model || '';
}

function handleExampleChange(event) {
  state.selectedExampleId = event.target.value;
  loadExampleSource(state.selectedExampleId);
}

function loadExampleSource(id) {
  const example = EXAMPLE_OPTIONS.find((item) => item.id === id) || EXAMPLE_OPTIONS[0];
  document.querySelector('#source-input').value = example.source;
  invalidateAnalysis('已切换种子原文。先自行判断结构，再载入示例分析核对。');
}

function loadSeedAnalysis() {
  const example = getPreparedExample(state.selectedExampleId);
  const currentText = getSourceText();
  if (currentText !== example.source) {
    showToast('当前原文已修改；请切回种子原文后再载入示例分析。');
    return;
  }
  showAnalysis(example.analysis, 'seed');
}

async function handleAiAnalysis() {
  const source = getSourceText();
  if (!source) return showToast('请先粘贴英文法律句子。');
  setBusy(true);
  setStatus('AI 正在生成结构化分析，请稍候……', 'loading');
  try {
    const tokens = tokenizeSource(source);
    const analysis = await analyseWithAI({
      source, tokens, userPrompt: state.userPrompt, config: state.apiConfig,
    });
    showAnalysis(analysis, 'live');
    await saveSuccessfulAnalysis(source, analysis);
  } catch (error) {
    setStatus(error.message, 'error');
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

function showAnalysis(analysis, sourceType) {
  state.analysis = analysis;
  document.querySelector('#analysis-workspace').hidden = false;
  renderAnalysis(analysis);
  loadPractice(analysis);
  const matches = renderInputOverlay(analysis, getSourceText());
  applyColorState(state.colors, matches);
  updateAnalysisBadge(sourceType);
  setStatus(`结构化分析已通过协议校验：${analysis.clauses.length} 个分句，${analysis.spans.length} 个修饰结构，${analysis.markers.length} 个特征语法词。`);
}

function updateAnalysisBadge(sourceType) {
  const badge = document.querySelector('#analysis-source-badge');
  const isLive = sourceType === 'live';
  const labels = { live: 'AI 实时分析', history: '历史记录', seed: '种子分析' };
  badge.textContent = labels[sourceType] || labels.seed;
  badge.classList.toggle('is-live', isLive);
}

async function saveSuccessfulAnalysis(source, analysis) {
  const record = await saveHistoryRecord({
    source,
    analysis,
    promptSnapshot: state.userPrompt,
    model: state.apiConfig.model,
  });
  updateHistoryCount(await countHistoryRecords());
  return record;
}

async function refreshHistoryCount() {
  try {
    updateHistoryCount(await countHistoryRecords());
  } catch (error) {
    console.warn('历史记录计数失败：', error);
  }
}

async function openHistoryDialog() {
  try {
    const records = await listHistoryRecords();
    state.historyRecords = records.map(withQualityAssessment);
    renderHistoryList(state.historyRecords);
    document.querySelector('#history-dialog').showModal();
  } catch (error) {
    showToast(`历史记录读取失败：${error.message}`);
  }
}

function withQualityAssessment(record) {
  return { ...record, quality: assessAnalysisConsistency(record.analysis) };
}

function handleSelectAll(event) {
  setAllHistorySelected(event.target.checked);
}

function openHistoryRecord(event) {
  const button = event.target.closest('[data-history-open]');
  if (!button) return;
  const record = state.historyRecords.find((item) => item.id === button.dataset.historyOpen);
  if (!record) return;
  document.querySelector('#source-input').value = record.source;
  showAnalysis(record.analysis, 'history');
  document.querySelector('#history-dialog').close();
  showToast('已载入历史分析，可继续查看和拖拽练习。');
}

function exportSelectedHistory() {
  const selected = new Set(selectedHistoryIds());
  const records = state.historyRecords.filter((record) => selected.has(record.id));
  if (!records.length) return showToast('请先选择要导出的记录。');
  const invalid = records.filter((record) => record.quality?.status === 'invalid');
  if (invalid.length) return showToast('所选记录含疑似错配分析，请重新分析后再导出。');
  downloadHistoryDocx(records);
  showToast(`已导出 ${records.length} 条记录到 Word。`);
}

function handleSourceInput() {
  const text = document.querySelector('#source-input').value;
  const matches = renderInputOverlay(state.analysis, text);
  applyColorState(state.colors, matches);
  if (!matches && state.analysis) {
    setStatus('原文已修改；工作台保留上一次结果，请重新分析后再核对着色。');
  }
}

function syncEditorScroll(event) {
  const highlight = document.querySelector('#source-highlight');
  highlight.scrollTop = event.target.scrollTop;
  highlight.scrollLeft = event.target.scrollLeft;
}

function toggleColor(key) {
  state.colors[key] = !state.colors[key];
  const matches = Boolean(state.analysis && state.analysis.source.text === getSourceText());
  applyColorState(state.colors, matches);
  showColorModeToast();
}

function showColorModeToast() {
  if (!state.colors.keywords && !state.colors.structure) {
    showToast('自测模式：所有颜色提示已关闭。');
    return;
  }
  showToast(`语法词${state.colors.keywords ? '开启' : '关闭'}，结构${state.colors.structure ? '开启' : '关闭'}。`);
}

function changeMode(event) {
  const button = event.target.closest('[data-mode]');
  if (!button) return;
  document.querySelectorAll('[data-mode]').forEach((item) => setModeButton(item, button));
  document.querySelectorAll('.mode-panel').forEach((panel) => {
    panel.hidden = panel.id !== `${button.dataset.mode}-mode`;
  });
}

function setModeButton(item, selectedButton) {
  const selected = item === selectedButton;
  item.classList.toggle('is-active', selected);
  item.setAttribute('aria-selected', String(selected));
}

function handleStructureClick(event) {
  const trigger = event.target.closest('[data-select-id]');
  if (!trigger || !state.analysis || !trigger.dataset.selectId) return;
  selectStructure(state.analysis, trigger.dataset.selectId);
}

function clearSource() {
  document.querySelector('#source-input').value = '';
  invalidateAnalysis('原文已清空。');
  document.querySelector('#source-input').focus();
}

function invalidateAnalysis(message) {
  state.analysis = null;
  document.querySelector('#analysis-workspace').hidden = true;
  document.querySelector('#source-highlight').textContent = getSourceText();
  applyColorState(state.colors, false);
  setStatus(message);
}

function openPromptDialog() {
  document.querySelector('#prompt-editor').value = state.userPrompt;
  document.querySelector('#prompt-dialog').showModal();
}

function savePrompt() {
  const content = document.querySelector('#prompt-editor').value.trim();
  if (!content) return showToast('Prompt 不能为空。');
  state.userPrompt = content;
  localStorage.setItem(PROMPT_STORAGE_KEY, content);
  document.querySelector('#prompt-dialog').close();
  showToast('Prompt 已保存；JSON 数据协议保持锁定。');
}

function resetPrompt() {
  document.querySelector('#prompt-editor').value = DEFAULT_USER_PROMPT;
  showToast('已恢复固定模板，点击保存后生效。');
}

function openApiDialog() {
  document.querySelector('#api-key').value = state.apiConfig.apiKey || '';
  document.querySelector('#api-dialog').showModal();
}

function saveApiConfig() {
  state.apiConfig = {
    endpoint: document.querySelector('#api-endpoint').value.trim(),
    model: document.querySelector('#api-model').value.trim(),
    apiKey: document.querySelector('#api-key').value.trim(),
  };
  saveApiPreferences(state.apiConfig);
  document.querySelector('#api-dialog').close();
  showToast('接口配置已保存；API Key 刷新页面后清除。');
}

function setBusy(busy) {
  const button = document.querySelector('#analyse-button');
  button.disabled = busy;
  button.textContent = busy ? '分析中…' : '用 AI 分析';
}

function setStatus(message, type = '') {
  const banner = document.querySelector('#status-banner');
  banner.textContent = message;
  banner.classList.toggle('is-error', type === 'error');
  banner.classList.toggle('is-loading', type === 'loading');
}

function getSourceText() {
  return document.querySelector('#source-input').value.trim();
}

function loadPrompt() {
  return localStorage.getItem(PROMPT_STORAGE_KEY) || DEFAULT_USER_PROMPT;
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

init();
