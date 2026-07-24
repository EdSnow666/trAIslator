/**
 * 职责: 绑定 Translation AIducator 演示站点的全部用户交互
 * 依赖内部: state/store.js, services/segmenter.js, services/layout-preferences.js, ui/render.js, ui/dialogs.js
 * 依赖外部: DOM API, Blob API
 * 暴露: 页面入口
 */

import { store } from './state/store.js';
import { buildImportedProject } from './services/segmenter.js';
import { initLayoutPreferences } from './services/layout-preferences.js';
import { renderApp, escapeHtml, renderLiveDiff } from './ui/render.js';
import { dialogs, showToast } from './ui/dialogs.js';

const actionHandlers = {
  'select-segment': selectSegment,
  'activate-prompt': activatePrompt,
  'save-segment': saveSegment,
  'open-versions': openVersions,
  'new-prompt-from-editor': promptFromEditor,
  'save-prompt-version': savePromptVersion,
  'close-modal': dialogs.closeModal,
  'close-drawer': dialogs.closeDrawer,
  'toggle-drawer-diffs': dialogs.toggleDrawerDiffs,
  'set-current-version': setCurrentVersion,
  'create-import-project': createImportProject,
  'save-api-config': saveApiConfig,
  'download-json': downloadJson,
  'download-html': downloadHtml,
  'add-term': dialogs.openTermModal,
  'save-term': saveTerm,
  'mentor-demo': dialogs.openMentorDemo,
};

function bindStaticEvents() {
  document.addEventListener('click', handleActionClick);
  document.addEventListener('keydown', handleShortcut);
  document.addEventListener('input', handleEditorInput);
  document.addEventListener('focusin', handleEditorFocus);
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
  document.querySelector('.right-tabs').addEventListener('click', changeRightTab);
  document.querySelector('.segment-filter').addEventListener('click', changeFilter);
  document.querySelector('#modal-root').addEventListener('change', handleModalChange);
}

function handleActionClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger || isBackdropInteriorClick(trigger, event)) return;
  const handler = actionHandlers[trigger.dataset.action];
  if (handler) handler(trigger, event);
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

function openPromptFromActive() {
  dialogs.openPromptModal(store.getPrompt(store.getProject().activePromptId).content);
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

function setCurrentVersion(trigger) {
  const segment = store.getSegment(trigger.dataset.segmentId);
  if (!segment) return;
  store.setCurrentTranslation(segment.id, trigger.dataset.translationId);
  dialogs.closeDrawer();
  showToast('已切换当前显示版本，其他版本仍保留。');
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
  if (!editor || !store.getState().diffMode) return;
  const segmentId = editor.dataset.segmentEditor;
  const selector = '[data-inline-diff="' + segmentId + '"]';
  const diff = document.querySelector(selector);
  if (diff) diff.innerHTML = renderLiveDiff(segmentId, editor.value);
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
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
  const segment = store.getSegment();
  const editor = document.querySelector(`[data-segment-editor="${segment?.id}"]`);
  if (!editor) return;
  event.preventDefault();
  store.savePostEdit(segment.id, editor.value);
  showToast('已保存当前句段。');
}

store.subscribe(renderApp);
bindStaticEvents();
initLayoutPreferences();
renderApp();
