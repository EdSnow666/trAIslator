/**
 * 职责: 绑定 Translation AIducator 演示站点的全部用户交互
 * 依赖内部: state/store.js, services/segmenter.js, services/layout-preferences.js, services/prompt-coach.js, services/post-edit-export.js, ui/render.js, ui/dialogs.js
 * 依赖外部: DOM API, Blob API
 * 暴露: 页面入口
 */

import { store } from './state/store.js?v=20260804-01';
import { buildImportedProject } from './services/segmenter.js';
import {
  initLayoutPreferences, resetLayoutPreferences, setPaneVisibility, togglePaneVisibility,
} from './services/layout-preferences.js?v=20260804-01';
import { renderApp, escapeHtml, renderLiveDiff, renderAiHumanDiff, resizeTargetEditor } from './ui/render.js?v=20260804-01';
import { dialogs, showToast } from './ui/dialogs.js?v=20260804-01';
import { analyzePromptCoach, buildPromptCoachArtifact, buildPromptRuleAppendix } from './services/prompt-coach.js?v=20260804-01';
import { buildPostEditCorpusArtifact } from './services/post-edit-export.js?v=20260804-01';

const actionHandlers = {
  'select-segment': selectSegment,
  'activate-prompt': activatePrompt,
  'save-segment': saveSegment,
  'open-versions': openVersions,
  'new-prompt-from-editor': promptFromEditor,
  'retranslate-with-prompt': retranslateWithPrompt,
  'save-prompt-version': savePromptVersion,
  'close-modal': dialogs.closeModal,
  'close-drawer': dialogs.closeDrawer,
  'toggle-drawer-diffs': dialogs.toggleDrawerDiffs,
  'set-current-version': setCurrentVersion,
  'discard-ai-post-edit': discardAiPostEdit,
  'create-import-project': createImportProject,
  'save-api-config': saveApiConfig,
  'download-json': downloadJson,
  'download-html': downloadHtml,
  'add-term': dialogs.openTermModal,
  'save-term': saveTerm,
  'apply-coach-rules': applyCoachRules,
  'download-coach-json': downloadPromptCoachJson,
  'download-post-edit-json': downloadPostEditJson,
  'ai-post-edit-current': runAiPostEdit,
  'toggle-ai-post-edit': toggleAiPostEdit,
  'open-ai-change': openAiChange,
  'decide-ai-post-edit': decideAiPostEdit,
  'edit-ai-post-edit': beginAiPostEdit,
  'toggle-pane': togglePane,
  'show-pane': showPane,
  'hide-pane': hidePane,
  'open-right-tab': openRightTab,
  'open-prompt-lineage': dialogs.openPromptLineageModal,
  'reset-layout': resetLayout,
};

function bindStaticEvents() {
  document.addEventListener('click', handleActionClick);
  document.addEventListener('click', handleMenuClick);
  document.addEventListener('keydown', handleShortcut);
  document.addEventListener('keydown', handleActionKeydown);
  document.addEventListener('input', handleEditorInput);
  document.addEventListener('focusin', handleEditorFocus);
  document.addEventListener('focusout', handleEditorBlur);
  document.querySelector('#project-select').addEventListener('change', changeProject);
  document.querySelector('#role-select').addEventListener('change', changeRole);
  document.querySelector('#api-button').addEventListener('click', dialogs.openApiModal);
  document.querySelector('#export-button').addEventListener('click', dialogs.openExportModal);
  document.querySelector('#brief-button').addEventListener('click', dialogs.openBriefModal);
  document.querySelector('#import-button').addEventListener('click', dialogs.openImportModal);
  document.querySelector('#new-prompt-button').addEventListener('click', openPromptFromActive);
  document.querySelector('#reset-button').addEventListener('click', resetDemo);
  document.querySelector('#generate-current-button').addEventListener('click', generateCurrent);
  document.querySelector('#generate-all-button').addEventListener('click', generateAll);
  document.querySelector('#compare-button').addEventListener('click', compareCurrent);
  document.querySelector('#all-versions-button').addEventListener('click', toggleAllVersions);
  document.querySelector('.right-tabs').addEventListener('click', changeRightTab);
  document.querySelector('.segment-filter').addEventListener('click', changeFilter);
  document.querySelector('#modal-root').addEventListener('change', handleModalChange);
}

function handleActionKeydown(event) {
  if (event.ctrlKey || event.metaKey) return;
  const change = event.target.closest('.ai-change-token');
  if (change && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    return change.click();
  }
  const proposal = event.target.closest('.ai-post-edit-text');
  if (!proposal || event.key !== 'Enter') return;
  event.preventDefault();
  proposal.click();
}

function handleActionClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger || isBackdropInteriorClick(trigger, event)) return;
  const handler = actionHandlers[trigger.dataset.action];
  if (!handler) return;
  handler(trigger, event);
  closeTopMenus();
}

function handleMenuClick(event) {
  closeAiChangeMenus(event.target.closest('.ai-change-wrap'));
  const summary = event.target.closest('.menu-dropdown > summary');
  if (summary) return closeTopMenus(summary.parentElement);
  if (event.target.closest('.menu-item')) return closeTopMenus();
  if (!event.target.closest('.menu-dropdown')) closeTopMenus();
}

function closeAiChangeMenus(exception = null) {
  document.querySelectorAll('.ai-change-wrap.is-open').forEach((item) => {
    if (item !== exception) item.classList.remove('is-open');
  });
}

function closeTopMenus(exception = null) {
  document.querySelectorAll('.menu-dropdown[open]').forEach((menu) => {
    if (menu !== exception) menu.removeAttribute('open');
  });
}

function toggleAiPostEdit() {
  const visible = !store.getState().aiPostEditVisible;
  store.setAiPostEditVisible(visible);
  showToast(visible ? '已显示 AI 译后编辑提案。' : '已隐藏 AI 译后编辑提案，决策仍会保留。');
}

function runAiPostEdit(trigger) {
  const segment = store.getSegment(trigger.dataset.segmentId);
  const translation = store.getCurrentTranslation(segment);
  if (!translation || translation.origin === 'manual') return showToast('人工参考译文不进入 AI 译后编辑流程。');
  const proposal = store.generateAiPostEdit(segment.id, trigger.dataset.promptId);
  if (!proposal) return showToast('模拟 AI 未发现可演示的结构修订。');
  showToast('AI 译后编辑提案已写入译文框，可逐项接受或拒绝。');
}

function openAiChange(trigger, event) {
  event.stopPropagation();
  const wrapper = trigger.closest('.ai-change-wrap');
  closeAiChangeMenus(wrapper);
  wrapper?.classList.toggle('is-open');
}

function decideAiPostEdit(trigger) {
  store.decideAiPostEdit(trigger.dataset.segmentId, trigger.dataset.changeId, trigger.dataset.decision);
}

function beginAiPostEdit(trigger) {
  const result = store.beginAiPostEditDraft(trigger.dataset.segmentId);
  if (result === null) return;
  showToast('已进入临时编辑；点击别处返回 AI Diff，草稿会保留。');
  requestAnimationFrame(() => focusSegmentEditor(trigger.dataset.segmentId));
}

function applyAiPostEditResult(segmentId, acceptAll, message) {
  const result = store.applyAiPostEdit(segmentId, acceptAll);
  if (result === null) return;
  showToast(message);
  requestAnimationFrame(() => focusSegmentEditor(segmentId));
}
function togglePane(trigger) {
  togglePaneVisibility(trigger.dataset.paneTarget);
}

function showPane(trigger) {
  setPaneVisibility(trigger.dataset.paneTarget, true);
}

function hidePane(trigger) {
  setPaneVisibility(trigger.dataset.paneTarget, false);
}

function openRightTab(trigger) {
  if (trigger.dataset.translationId) store.selectTranslationDetails(trigger.dataset.segmentId, trigger.dataset.translationId);
  else if (trigger.dataset.segmentId) store.selectSegment(trigger.dataset.segmentId);
  store.setRightTab(trigger.dataset.tab);
  setPaneVisibility('right', true);
}

function resetLayout() {
  resetLayoutPreferences();
}
function isBackdropInteriorClick(trigger, event) {
  const isBackdrop = trigger.classList.contains('modal-backdrop')
    || trigger.classList.contains('drawer-backdrop');
  return isBackdrop && event.target !== trigger;
}

function selectSegment(trigger) {
  store.selectSegment(trigger.dataset.segmentId);
}

function activatePrompt(trigger) {
  store.setActivePrompt(trigger.dataset.promptId);
  if (trigger.closest('.modal')) dialogs.closeModal();
  showToast('已切换项目 Prompt；旧译文版本保持不变。');
}

function saveSegment(trigger) {
  const segmentId = trigger.dataset.segmentId;
  const editor = document.querySelector(`[data-segment-editor="${segmentId}"]`);
  store.savePostEdit(segmentId, editor.value);
  showToast('译后编辑已保存为当前译文快照。');
}

function openVersions(trigger) {
  store.selectSegment(trigger.dataset.segmentId);
  dialogs.openVersionDrawer(trigger.dataset.segmentId);
}

function promptFromEditor() {
  const content = document.querySelector('#prompt-editor')?.value || '';
  dialogs.openPromptModal(content);
}

function retranslateWithPrompt(trigger) {
  const content = document.querySelector('#prompt-editor')?.value.trim();
  if (!content) return showToast('Prompt 内容不能为空。');
  const project = store.getProject();
  const existing = project.prompts.find((prompt) => prompt.content.trim() === content);
  if (existing) store.setActivePrompt(existing.id);
  else store.savePromptVersion({ title: '当前译文重译优化', note: '从当前译文详情修改并重译', content });
  const segmentId = trigger.dataset.segmentId || store.getSegment()?.id;
  if (!segmentId) return;
  store.generateMock([segmentId]);
  showToast(existing ? '已用此 Prompt 新增模拟译文版本。' : '已保存新 Prompt，并新增模拟译文版本。');
}

function openPromptFromActive() {
  dialogs.openPromptModal(store.getPrompt(store.getProject().activePromptId).content);
}

function applyCoachRules() {
  const analysis = analyzePromptCoach(store.getProject());
  const selected = new Set([...document.querySelectorAll('[data-coach-rule]:checked')]
    .map((item) => item.dataset.coachRule));
  const rules = analysis.rules.filter((rule) => selected.has(rule.id));
  if (!rules.length) return showToast('请至少选择一条结构规则。');
  const active = store.getPrompt(store.getProject().activePromptId);
  const content = `${active.content.trim()}\n\n${buildPromptRuleAppendix(rules)}`;
  const note = `AI Prompt 教练：基于 ${analysis.totalCount} 条 T2 的句子结构分析`;
  dialogs.openPromptModal(content, { title: 'T2 句法结构优化', note });
}

function savePromptVersion() {
  const content = document.querySelector('#prompt-content').value.trim();
  if (!content) return showToast('Prompt 内容不能为空。');
  const prompt = store.savePromptVersion({
    title: document.querySelector('#prompt-title').value.trim(),
    note: document.querySelector('#prompt-note').value.trim(),
    content,
  });
  dialogs.closeModal();
  showToast(`Prompt v${prompt.version} 已发布，可选择句段重新生成。`);
}

function generateCurrent() {
  const segment = store.getSegment();
  if (!segment) return;
  store.generateMock([segment.id]);
  showToast('已新增模拟译文版本，旧译文未被覆盖。');
}

function generateAll() {
  const ids = store.getProject().segments.map((segment) => segment.id);
  store.generateMock(ids);
  showToast(`已新增 ${ids.length} 个模拟译文版本。`);
}

function compareCurrent() {
  const enabled = !store.getState().diffMode;
  store.setDiffMode(enabled);
  showToast(enabled ? '已开启全文实时 Diff。' : '已关闭全文实时 Diff。');
}

function toggleAllVersions() {
  const enabled = !store.getState().allVersionsMode;
  store.setAllVersionsMode(enabled);
  showToast(enabled ? '已展开全部译文版本。' : '已恢复仅显示当前译文。');
}

function setCurrentVersion(trigger) {
  const segment = store.getSegment(trigger.dataset.segmentId);
  if (!segment) return;
  store.setCurrentTranslation(segment.id, trigger.dataset.translationId);
  dialogs.closeDrawer();
  showToast('已切换当前显示版本，其他版本仍保留。');
}

function discardAiPostEdit(trigger) {
  const discarded = store.discardAiPostEdit(trigger.dataset.segmentId, trigger.dataset.translationId);
  if (!discarded) return;
  dialogs.closeDrawer();
  showToast('已恢复原始译文，AI 译后编辑版本已抛弃。');
}
function changeProject(event) {
  store.selectProject(event.target.value);
}

function changeRole(event) {
  store.setRole(event.target.value);
  showToast(event.target.value === 'teacher' ? '已切换为教师演示身份。' : '已切换为学生演示身份。');
}

function changeRightTab(event) {
  const tab = event.target.closest('[data-tab]');
  if (tab) store.setRightTab(tab.dataset.tab);
}

function changeFilter(event) {
  const filter = event.target.closest('[data-filter]');
  if (!filter) return;
  document.querySelectorAll('.filter-chip').forEach((chip) => chip.classList.remove('is-active'));
  filter.classList.add('is-active');
  renderApp();
}

function resetDemo() {
  if (!window.confirm('确定重置全部本地修改并恢复预存演示吗？')) return;
  store.reset();
  showToast('预存英中、中英演示已恢复。');
}

function handleEditorInput(event) {
  const editor = event.target.closest('[data-segment-editor]');
  if (!editor) return;
  resizeTargetEditor(editor);
  if (editor.dataset.aiPostEditDraft) store.updateAiPostEditDraft(editor.dataset.segmentEditor, editor.value);
  if (!store.getState().diffMode) return;
  updateLiveDiffs(editor.dataset.segmentEditor, editor.value);
}

function updateLiveDiffs(segmentId, editedText) {
  const standardDiff = document.querySelector('[data-inline-diff="' + segmentId + '"]');
  if (standardDiff) standardDiff.innerHTML = renderLiveDiff(segmentId, editedText);
  const aiHumanDiff = document.querySelector('[data-ai-human-diff="' + segmentId + '"]');
  if (aiHumanDiff) aiHumanDiff.innerHTML = renderAiHumanDiff(segmentId, editedText);
}
function handleEditorBlur(event) {
  const editor = event.target.closest('[data-ai-post-edit-draft]');
  if (!editor) return;
  if (event.relatedTarget?.closest('.target-actions')) return;
  const segmentId = editor.dataset.segmentEditor;
  window.setTimeout(() => store.pauseAiPostEditDraft(segmentId), 0);
}
function handleEditorFocus(event) {
  const editor = event.target.closest('[data-segment-editor]');
  if (!editor || store.getState().currentSegmentId === editor.dataset.segmentEditor) return;
  const segmentId = editor.dataset.segmentEditor;
  store.selectSegment(segmentId);
  requestAnimationFrame(() => focusSegmentEditor(segmentId));
}

function focusSegmentEditor(segmentId) {
  const selector = '[data-segment-editor="' + segmentId + '"]';
  document.querySelector(selector)?.focus();
}

function handleModalChange(event) {
  if (event.target.id !== 'import-file' || !event.target.files[0]) return;
  const reader = new FileReader();
  reader.onload = () => { document.querySelector('#import-text').value = reader.result; };
  reader.readAsText(event.target.files[0], 'UTF-8');
}

function createImportProject() {
  const text = document.querySelector('#import-text').value.trim();
  if (!text) return showToast('请粘贴原文或选择 TXT 文件。');
  const project = buildImportedProject(
    document.querySelector('#import-name').value.trim(),
    document.querySelector('#import-direction').value,
    text,
  );
  store.addImportedProject(project);
  dialogs.closeModal();
  showToast(`已自动切分为 ${project.segments.length} 个句段。`);
}

function saveApiConfig() {
  store.saveApiConfig({
    baseUrl: document.querySelector('#api-base').value.trim(),
    model: document.querySelector('#api-model').value.trim(),
    apiKey: document.querySelector('#api-key').value.trim(),
  });
  dialogs.closeModal();
  showToast('接口配置已暂存；当前版本不会发送请求。');
}

function saveTerm() {
  const source = document.querySelector('#term-source').value.trim();
  const target = document.querySelector('#term-target').value.trim();
  if (!source || !target) return showToast('原词和译词不能为空。');
  store.getProject().terms.push({ source, target, note: document.querySelector('#term-note').value.trim() });
  store.setRightTab('terms');
  dialogs.closeModal();
  showToast('术语已加入当前项目。');
}

function downloadJson() {
  const project = store.getProject();
  downloadBlob(`${project.name}.json`, JSON.stringify(project, null, 2), 'application/json');
}

function downloadPromptCoachJson() {
  const project = store.getProject();
  const artifact = buildPromptCoachArtifact(project);
  const safeName = project.name.replace(/[<>:"/\\|?*]/g, '-');
  const filename = `${safeName}-Prompt-Coach-Structure.json`;
  downloadBlob(filename, JSON.stringify(artifact, null, 2), 'application/json');
}

function downloadPostEditJson() {
  const project = store.getProject();
  const artifact = buildPostEditCorpusArtifact(project);
  if (!artifact.records.length) return showToast('当前项目尚无已保存的 AI 译后编辑。');
  const safeName = project.name.replace(/[<>:"/\\|?*]/g, '-');
  const filename = `${safeName}-Post-Edit-Corpus.json`;
  downloadBlob(filename, JSON.stringify(artifact, null, 2), 'application/json');
}

function downloadHtml() {
  const project = store.getProject();
  const rows = project.segments.map((segment, index) => bilingualRow(segment, index)).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(project.name)}</title><style>body{font-family:Arial;max-width:1100px;margin:40px auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:12px;vertical-align:top}th{background:#eee}</style><h1>${escapeHtml(project.name)}</h1><p>${project.direction}</p><table><tr><th>#</th><th>Source</th><th>Target</th><th>Prompt</th></tr>${rows}</table>`;
  downloadBlob(`${project.name}-双语.html`, html, 'text/html');
}

function bilingualRow(segment, index) {
  const current = segment.translations.find((item) => item.id === segment.currentTranslationId);
  const prompt = current ? store.getPrompt(current.promptId) : null;
  return `<tr><td>${index + 1}</td><td>${escapeHtml(segment.source)}</td><td>${escapeHtml(current?.postEditText || current?.aiText || '')}</td><td>${prompt ? `v${prompt.version} ${escapeHtml(prompt.title)}` : ''}</td></tr>`;
}

function downloadBlob(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('导出文件已生成。');
}

function handleShortcut(event) {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key === 'Enter') return acceptCurrentAiPostEdit(event);
  if (event.key.toLowerCase() !== 's') return;
  const segment = store.getSegment();
  const editor = document.querySelector(`[data-segment-editor="${segment?.id}"]`);
  if (!editor) return;
  event.preventDefault();
  store.savePostEdit(segment.id, editor.value);
  showToast('已保存当前句段。');
}

function acceptCurrentAiPostEdit(event) {
  if (document.querySelector('.modal')) return;
  const segment = store.getSegment();
  const draft = segment ? store.getAiPostEditDraft(segment.id) : null;
  if (draft?.active) {
    event.preventDefault();
    store.savePostEdit(segment.id, draft.text);
    return showToast('AI 修改稿及人工调整已保存。');
  }
  if (!store.getState().aiPostEditVisible) return;
  const edit = store.getCurrentTranslation(segment)?.aiPostEdit;
  if (!segment || edit?.status !== 'pending') return;
  event.preventDefault();
  applyAiPostEditResult(segment.id, true, '已通过 Ctrl+Enter 接受 AI 修改。');
}

store.subscribe(renderApp);
bindStaticEvents();
initLayoutPreferences();
renderApp();
