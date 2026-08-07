/**
 * 职责: 绑定 Translation AIducator 演示站点的全部用户交互
 * 依赖内部: state/store.js, services/auth-client.js, services/server-data.js, services/segmenter.js, services/layout-preferences.js, services/modal-focus.js, services/prompt-coach.js, services/post-edit-export.js, services/project-export.js, ui/render.js, ui/dialogs.js, ui/management.js, ui/project-management.js, ui/personal-api-keys.js, ui/model-management.js, ui/prompt-inspector.js, ui/prompt-management.js
 * 依赖外部: DOM API, Blob API
 * 暴露: 页面入口
 */

import { store } from './state/store.js'; import './services/translation-drafts-input.js';
import { initializeAuth } from './services/auth-client.js';
import {
  createServerProject, createServerPrompt, loadProjectResourceCatalog, loadServerProjects, publishServerPrompt, refreshServerProject, unpublishServerPrompt,
  runServerAiTranslation, saveServerAiDecision, saveServerPostEdit, selectServerPrompt, selectServerVersion,
  saveServerBrief, generateServerProjectResource, generateServerProjectResources, cancelServerProjectGeneration,
  serverErrorProject, submitServerPrompt,
} from './services/server-data.js';
import { buildImportedProject, segmentParagraphs } from './services/segmenter.js';
import { extractImportFile } from './services/document-import.js';
import { readProjectSetup, applyOfflineProjectSetup } from './services/project-setup.js';
import {
  initLayoutPreferences, resetLayoutPreferences, setPaneVisibility, togglePaneVisibility,
} from './services/layout-preferences.js';
import { initModalFocusGuard } from './services/modal-focus.js';
import { renderApp, escapeHtml, renderLiveDiff, renderAiHumanDiff, resizeTargetEditor } from './ui/render.js';
import { dialogs, showToast } from './ui/dialogs.js';
import { openManagementModal } from './ui/management.js';
import { openProjectManagementModal } from './ui/project-management.js';
import { openPersonalApiKeysModal } from './ui/personal-api-keys.js';
import { openModelManagementModal } from './ui/model-management.js';
import { openPromptInspectorModal } from './ui/prompt-inspector.js';
import { archivePrompt, openPromptVersionEditor, requestPromptArchive, restorePrompt } from './ui/prompt-management.js';
import { openPairImport, submitPairImport } from './ui/resource-import.js';
import { runPostEditTask } from './ui/post-edit-task.js';
import { cancelFullTranslation, confirmAllTranslations, generateAllPostEdits, generateAllTranslations, handleTranslationConfirmation, submitAllTranslations, submitCurrentTranslation } from './ui/translation-batch.js';
import { analyzePromptCoach, buildPromptCoachArtifact, buildPromptRuleAppendix } from './services/prompt-coach.js';
import { buildPostEditCorpusArtifact } from './services/post-edit-export.js';
import { buildProjectExportArtifact } from './services/project-export.js';

const actionHandlers = {
  'select-segment': selectSegment,
  'activate-prompt': activatePrompt,
  'edit-prompt-version': openPromptVersionEditor,
  'request-delete-prompt': requestPromptArchive,
  'delete-prompt': archivePrompt,
  'restore-prompt': restorePrompt,
  'submit-prompt': submitPrompt,
  'publish-prompt': publishPrompt,
  'unpublish-prompt': unpublishPrompt,
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
  'save-project-brief': saveProjectBrief,
  'generate-project-resource': dialogs.openGenerationLanguageModal,
  'confirm-generate-project-resource': generateProjectResource,
  'cancel-project-generation': cancelProjectGeneration,
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
  'open-resource-modal': dialogs.openResourceModal,
  'open-prompt-lineage': dialogs.openPromptLineageModal,
  'switch-prompt-lineage': dialogs.switchPromptLineage,
  'toggle-archived-prompts': dialogs.toggleArchivedPrompts,
  'open-pair-import': openPairImport,
  'submit-pair-import': submitPairImport,
  'open-post-edit-task': dialogs.openPostEditTask,
  'run-post-edit-task': runPostEditTask,
  'cancel-full-translation': cancelFullTranslation,
  'open-project-brief': dialogs.openBriefModal,
  'edit-project-brief': dialogs.openBriefEditModal,
  'open-management': openManagementModal,
  'open-project-management': openProjectManagementModal,
  'open-personal-api-keys': openPersonalApiKeysModal,
  'open-prompt-inspector': openPromptInspectorModal,
  'reset-layout': resetLayout, 'switch-left-prompt-kind': (trigger) => { trigger.closest('#prompt-kind-switch').dataset.kind = trigger.dataset.promptKind; renderApp(); }, 'open-new-prompt-version': dialogs.openNewPromptVersion, 'bulk-generate-current': generateCurrent, 'bulk-generate-all': generateAllTranslations, 'bulk-post-edit-all': generateAllPostEdits, 'bulk-confirm-all': confirmAllTranslations, 'bulk-submit-all': submitAllTranslations, 'submit-current-translation': submitCurrentTranslation,
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
  document.querySelector('#api-button').addEventListener('click', openModelManagementModal);
  document.querySelector('#export-button').addEventListener('click', dialogs.openExportModal);
  document.querySelector('#brief-button').addEventListener('click', dialogs.openBriefModal);
  document.querySelector('#import-button').addEventListener('click', dialogs.openImportModal);
  document.querySelector('#new-prompt-button').addEventListener('click', openPromptFromActive);
  document.querySelector('#reset-button').addEventListener('click', resetDemo);
  document.querySelector('#generate-current-button').addEventListener('click', generateCurrent);
  document.querySelector('#generate-all-button').addEventListener('click', generateAllTranslations);
  document.querySelector('#compare-button').addEventListener('click', compareCurrent);
  document.querySelector('#all-versions-button').addEventListener('click', toggleAllVersions);
  document.querySelector('.right-tabs').addEventListener('click', changeRightTab);
  document.querySelector('.segment-filter').addEventListener('click', changeFilter);
  document.querySelector('#modal-root').addEventListener('change', handleModalChange);
  window.addEventListener('server-projects-changed', reloadServerProjects);
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

async function runAiPostEdit(trigger) {
  const segment = store.getSegment(trigger.dataset.segmentId || store.getSegment()?.id);
  const translation = store.getCurrentTranslation(segment);
  if (!translation || translation.origin === 'manual') return showToast('人工参考译文不进入 AI 译后编辑流程。');
  if (!store.getState().serverMode) {
    const proposal = store.generateAiPostEdit(segment.id, trigger.dataset.promptId);
    return showToast(proposal ? 'AI 译后编辑提案已写入译文框，可逐项接受或拒绝。' : '模拟 AI 未发现可演示的结构修订。');
  }
  try {
    const project = store.getProject();
    await runServerAiTranslation(project, segment, 'ai_post_edit',
      trigger.dataset.promptId || project.activePromptId, translation.id);
    await refreshCurrentServerProject();
    showToast('AI 译后编辑已完成，可在译文框逐项检查。');
  } catch (error) { showToast(`AI 译后编辑失败：${error.message}`); }
}

function openAiChange(trigger, event) {
  event.stopPropagation();
  const wrapper = trigger.closest('.ai-change-wrap');
  closeAiChangeMenus(wrapper);
  wrapper?.classList.toggle('is-open');
}

async function decideAiPostEdit(trigger) {
  const project = store.getProject();
  const translation = store.getCurrentTranslation(store.getSegment(trigger.dataset.segmentId));
  store.decideAiPostEdit(trigger.dataset.segmentId, trigger.dataset.changeId, trigger.dataset.decision);
  if (!store.getState().serverMode || translation?.serverVersionKind !== 'ai_post_edit') return;
  try {
    await saveServerAiDecision(project, translation.id, trigger.dataset.changeId, trigger.dataset.decision);
  } catch (error) {
    showToast(`AI 修改决策保存失败：${error.message}`);
  }
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
function isBackdropInteriorClick(trigger) {
  return trigger.classList.contains('modal-backdrop')
    || trigger.classList.contains('drawer-backdrop');
}

function selectSegment(trigger) {
  store.selectSegment(trigger.dataset.segmentId);
}

async function activatePrompt(trigger) {
  const project = store.getProject();
  if (!store.getState().serverMode) {
    store.setActivePrompt(trigger.dataset.promptId);
    if (trigger.closest('.modal')) dialogs.openPromptLineageModal({ kind: store.getPrompt(trigger.dataset.promptId)?.promptKind });
    return showToast('已切换项目 Prompt；旧译文版本保持不变。');
  }
  if (!project.workspaceId && !project.canManage) return showToast('此项目没有可编辑的个人工作空间。');
  try {
    const prompt = store.getPrompt(trigger.dataset.promptId);
    await selectServerPrompt(project, trigger.dataset.promptId, prompt?.promptKind || 'translation');
    await refreshCurrentServerProject();
    if (trigger.closest('.modal')) dialogs.openPromptLineageModal({ kind: prompt?.promptKind });
    showToast('已切换个人工作空间的当前 Prompt。');
  } catch (error) {
    showToast(`Prompt 切换失败：${error.message}`);
  }
}

async function submitPrompt(trigger) {
  trigger.disabled = true;
  try {
    await submitServerPrompt(trigger.dataset.promptId);
    await refreshCurrentServerProject();
    dialogs.openPromptLineageModal();
    showToast('Prompt 候选已提交给教师。');
  } catch (error) {
    showToast(`Prompt 提交失败：${error.message}`);
  } finally {
    trigger.disabled = false;
  }
}

async function publishPrompt(trigger) {
  const project = store.getProject();
  trigger.disabled = true;
  try {
    await publishServerPrompt(project.id, trigger.dataset.promptId);
    await refreshCurrentServerProject();
    dialogs.openPromptLineageModal();
    showToast('已发布为项目 overarching Prompt。');
  } catch (error) {
    showToast(`Prompt 发布失败：${error.message}`);
  } finally {
    trigger.disabled = false;
  }
}

async function unpublishPrompt(trigger) {
  const project = store.getProject();
  trigger.disabled = true;
  try {
    await unpublishServerPrompt(project.id, trigger.dataset.promptId);
    await refreshCurrentServerProject();
    dialogs.openPromptLineageModal();
    showToast('已取消项目 Prompt 发布。');
  } catch (error) { showToast(`取消发布失败：${error.message}`); }
  finally { trigger.disabled = false; }
}
async function saveSegment(trigger) {
  const segment = store.getSegment(trigger.dataset.segmentId);
  const translation = store.getCurrentTranslation(segment);
  const editor = document.querySelector(`[data-segment-editor="${segment?.id}"]`);
  if (!segment || !translation || !editor) return;
  if (!store.getState().serverMode) {
    store.savePostEdit(segment.id, editor.value);
    return showToast('译后编辑已保存为当前译文快照。');
  }
  trigger.disabled = true;
  try {
    await saveServerPostEdit(store.getProject(), segment, translation, editor.value);
    await refreshCurrentServerProject();
    showToast('译后编辑已保存到服务器，旧版本仍然保留。');
  } catch (error) {
    showToast(`保存失败：${error.message}`);
  } finally {
    trigger.disabled = false;
  }
}

function openVersions(trigger) {
  store.selectSegment(trigger.dataset.segmentId);
  dialogs.openVersionDrawer(trigger.dataset.segmentId);
}

function promptEditingBlocked() {
  const project = store.getProject();
  return store.getState().serverMode && !project.editable && !project.canManage;
}

function promptFromEditor() {
  if (promptEditingBlocked()) return showToast('系统模板为只读；请先克隆为教学项目。');
  const content = document.querySelector('#prompt-editor')?.value || '';
  dialogs.openPromptModal(content);
}

async function createAndActivateServerPrompt(input, submitToTeacher = false) {
  const project = store.getProject();
  const promptId = await createServerPrompt(project, {
    ...input,
    basePrompt: input.basePrompt,
  });
  if (submitToTeacher) await submitServerPrompt(promptId);
  if (project.workspaceId || project.canManage) {
    await selectServerPrompt(project, promptId, input.promptKind || 'translation');
  }
  await refreshCurrentServerProject();
  return promptId;
}

async function prepareServerPromptForRetranslation(project, existing, content) {
  if (!project.workspaceId) throw new Error('当前项目没有可运行重译的个人工作空间。');
  if (existing) {
    await selectServerPrompt(project, existing.id);
    return refreshCurrentServerProject();
  }
  return createAndActivateServerPrompt({
    title: '当前译文重译优化',
    note: '从当前译文详情修改并重译',
    content,
  });
}

function localPromptRetranslation(content, existing, segmentId) {
  if (existing) store.setActivePrompt(existing.id);
  else store.savePromptVersion({ title: '当前译文重译优化', note: '从当前译文详情修改并重译', content });
  store.generateMock([segmentId]);
  showToast(existing ? '已用此 Prompt 新增模拟译文版本。' : '已保存新 Prompt，并新增模拟译文版本。');
}

async function retranslateWithPrompt(trigger) {
  const content = document.querySelector('#prompt-editor')?.value.trim();
  if (!content) return showToast('Prompt 内容不能为空。');
  const project = store.getProject();
  const existing = project.prompts.find((prompt) => prompt.content.trim() === content);
  const segmentId = trigger.dataset.segmentId || store.getSegment()?.id;
  if (!segmentId) return;
  if (!store.getState().serverMode) return localPromptRetranslation(content, existing, segmentId);
  try {
    await prepareServerPromptForRetranslation(project, existing, content);
    const currentProject = store.getProject();
    const segment = store.getSegment(segmentId);
    await runServerAiTranslation(currentProject, segment, 'ai_translation', currentProject.activePromptId);
    await refreshCurrentServerProject();
    showToast('已保存 Prompt 并生成新的 AI 译文版本。');
  } catch (error) { showToast(`重译失败：${error.message}`); }
}

function openPromptFromActive() {
  const project = store.getProject();
  if (promptEditingBlocked()) return showToast('系统模板为只读；请先克隆为教学项目。');
  const prompt = store.getPrompt(project.activePromptId);
  dialogs.openPromptModal(prompt?.content || '');
}

function applyCoachRules() {
  if (promptEditingBlocked()) return showToast('系统模板为只读；请先克隆为教学项目。');
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

function promptFormInput() {
  const basePrompt = dialogs.promptBaseSelection();
  return {
    title: document.querySelector('#prompt-title').value.trim() || '课堂共创优化',
    note: document.querySelector('#prompt-note').value.trim(),
    content: document.querySelector('#prompt-content').value.trim(),
    promptKind: document.querySelector('#prompt-kind')?.value || 'translation',
    basePromptId: basePrompt?.id || null,
    basePrompt,
  };
}
async function savePromptVersion(trigger) {
  if (promptEditingBlocked()) return showToast('系统模板为只读；请先克隆为教学项目。');
  const input = promptFormInput();
  if (!input.content) return showToast('Prompt 内容不能为空。');
  if (!store.getState().serverMode) {
    const prompt = store.savePromptVersion({ ...input, parentPromptId: input.basePromptId });
    dialogs.openPromptLineageModal({ kind: input.promptKind });
    return showToast(`Prompt v${prompt.version} 已发布，可选择句段重新生成。`);
  }
  trigger.disabled = true;
  try {
    const submit = Boolean(document.querySelector('#prompt-submit-teacher')?.checked);
    await createAndActivateServerPrompt(input, submit);
    dialogs.openPromptLineageModal({ kind: input.promptKind });
    showToast(submit ? 'Prompt 候选已保存并提交给教师。' : 'Prompt 候选已保存，仅自己可见。');
  } catch (error) {
    showToast(`Prompt 保存失败：${error.message}`);
    trigger.disabled = false;
  }
}

async function generateCurrent() {
  const project = store.getProject();
  const segment = store.getSegment();
  if (!segment) return;
  if (!store.getState().serverMode) {
    store.generateMock([segment.id]);
    return showToast('已新增模拟译文版本，旧译文未被覆盖。');
  }
  try {
    await runServerAiTranslation(project, segment, 'ai_translation', project.activePromptId);
    await refreshCurrentServerProject();
    showToast('AI 译文已生成，旧版本仍然保留。');
  } catch (error) { showToast(`AI 翻译失败：${error.message}`); }
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

async function refreshResourceCatalog() {
  if (!store.getState().serverMode) return;
  try { dialogs.setProjectResourceCatalog(await loadProjectResourceCatalog()); }
  catch (error) { showToast(`继承资源目录刷新失败：${error.message}`); }
}

async function reloadServerProjects() {
  if (!store.getState().serverMode) return;
  try { store.setServerProjects(await loadServerProjects()); await refreshResourceCatalog(); }
  catch (error) { showToast(`项目列表刷新失败：${error.message}`); }
}
async function refreshCurrentServerProject() {
  const project = store.getProject();
  const snapshot = await refreshServerProject(project);
  store.replaceServerProject(snapshot);
}

async function setCurrentVersion(trigger) {
  const segment = store.getSegment(trigger.dataset.segmentId);
  const translation = segment?.translations.find((item) => item.id === trigger.dataset.translationId);
  if (!segment || !translation) return;
  try {
    if (store.getState().serverMode && translation.serverVersionKind) {
      await selectServerVersion(store.getProject(), segment.id, translation.id);
    }
    store.setCurrentTranslation(segment.id, translation.id);
    dialogs.closeDrawer();
    showToast('已切换当前显示版本，其他版本仍保留。');
  } catch (error) {
    showToast(`切换失败：${error.message}`);
  }
}

async function discardAiPostEdit(trigger) {
  const project = store.getProject();
  const segment = store.getSegment(trigger.dataset.segmentId);
  const translation = segment?.translations.find((item) => item.id === trigger.dataset.translationId);
  if (store.getState().serverMode && translation?.serverVersionKind === 'ai_post_edit') {
    try {
      await selectServerVersion(project, segment.id, translation.serverBaseVersionId);
      await refreshCurrentServerProject();
      dialogs.closeDrawer();
      return showToast('已恢复 AI 原译；服务器仍保留 AI 译后编辑版本。');
    } catch (error) {
      return showToast(`恢复失败：${error.message}`);
    }
  }
  const discarded = store.discardAiPostEdit(segment?.id, translation?.id);
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
  const resourceFields = ['import-brief-mode', 'import-prompt-mode', 'import-brief-version',
    'import-prompt-version', 'prompt-use-base', 'prompt-base-version'];
  if (resourceFields.includes(event.target.id)) {
    dialogs.updateProjectSetupVisibility();
    dialogs.copySelectedResource(event.target);
    return;
  }
  if (event.target.id !== 'import-file' || !event.target.files[0]) return;
  importSelectedFile(event.target.files[0]);
}
async function importSelectedFile(file) {
  setImportBusy(true);
  setImportStatus(`正在读取 ${file.name}……`);
  try {
    const result = await extractImportFile(file);
    document.querySelector('#import-text').value = result.text;
    applyImportFilename(result.filename);
    const count = segmentParagraphs(result.text).length;
    setImportStatus(`已读取 ${result.filename}，将导入 ${count} 个段落。`);
  } catch (error) {
    setImportStatus(error.message, true);
    showToast(`文件读取失败：${error.message}`);
  } finally {
    setImportBusy(false);
  }
}

function setImportBusy(busy) {
  const button = document.querySelector('[data-action="create-import-project"]');
  if (button) button.disabled = busy;
}

function setImportStatus(message, error = false) {
  const status = document.querySelector('#import-file-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('danger-text', error);
}

function applyImportFilename(filename) {
  const field = document.querySelector('#import-name');
  if (!field || !['', '新建本地翻译项目'].includes(field.value.trim())) return;
  field.value = filename.replace(/\.[^.]+$/, '');
}

function serverProjectPayload(name, direction, text, setup) {
  const enZh = direction === 'EN → ZH';
  return { name, direction, sourceLanguage: enZh ? 'en' : 'zh-CN',
    targetLanguage: enZh ? 'zh-CN' : 'en', sourceText: text,
    documentTitle: name, kind: 'class_project', setup: { ...setup, deferGeneration: true } };
}

async function createImportProject() {
  const text = document.querySelector('#import-text').value.trim();
  if (!text) return showToast('请粘贴原文或选择 TXT、DOCX、PDF 文件。');
  const name = document.querySelector('#import-name').value.trim() || '新建本地翻译项目';
  const direction = document.querySelector('#import-direction').value;
  const setup = readProjectSetup();
  let outcome = `本地项目已创建，共 ${segmentParagraphs(text).length} 个段落。`;
  setImportBusy(true);
  try {
    if (store.getState().serverMode) {
      const result = await createServerProject(serverProjectPayload(name, direction, text, setup));
      try { await generateServerProjectResources(result.id, setup, dialogs.updateGenerationStatus); }
      catch (error) { outcome = `项目已创建；自动生成未完成：${error.message}`; }
      store.setServerProjects(await loadServerProjects());
      await refreshResourceCatalog();
      store.selectProject(result.id);
    } else {
      const project = buildImportedProject(name, direction, text);
      applyOfflineProjectSetup(project, setup, store.getState().projects);
      store.addImportedProject(project);
    }
    dialogs.closeModal();
    showToast(outcome);
  } catch (error) { showToast(`项目创建失败：${error.message}`); }
  finally { setImportBusy(false); }
}

async function generateProjectResource(trigger) {
  const project = store.getProject();
  if (!store.getState().serverMode) return showToast('请在服务器模式下使用自动生成功能。');
  if (!project.canManage) return showToast('只有项目管理员或教师可以自动生成项目资源。');
  const isBrief = trigger.dataset.resource === 'brief';
  const language = document.querySelector('#generation-language')?.value || 'zh-CN';
  try {
    await generateServerProjectResource(project.id, trigger.dataset.resource, language, dialogs.updateGenerationStatus);
    await refreshCurrentServerProject();
    dialogs.closeModal();
    showToast(isBrief ? '任务书已生成。' : '全文 Prompt 已生成。');
  } catch (error) { showToast(`${isBrief ? '任务书' : 'Prompt'}生成失败：${error.message}`); }
}

async function cancelProjectGeneration() {
  dialogs.updateGenerationStatus({ active: false, label: '正在取消生成……' });
  try {
    const cancelled = await cancelServerProjectGeneration();
    if (!cancelled) showToast('当前没有可取消的生成任务。');
  } catch (error) { showToast(`取消失败：${error.message}`); }
}
async function saveProjectBrief() {
  const content = {};
  document.querySelectorAll('[data-brief-key]').forEach((field) => { content[field.dataset.briefKey] = field.value.trim(); });
  try {
    if (store.getState().serverMode) {
      await saveServerBrief(store.getProject().id, content);
      await refreshCurrentServerProject();
    } else store.saveBrief(content);
    dialogs.closeModal();
    showToast('任务书新版本已保存。');
  } catch (error) { showToast(`任务书保存失败：${error.message}`); }
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
  const artifact = buildProjectExportArtifact(project);
  downloadBlob(`${project.name}.json`, JSON.stringify(artifact, null, 2), 'application/json');
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
  if (event.key === 'Enter') return handleTranslationConfirmation(event) || acceptCurrentAiPostEdit(event);
  if (event.key.toLowerCase() !== 's') return;
  const segment = store.getSegment();
  const trigger = document.querySelector(`[data-action="save-segment"][data-segment-id="${segment?.id}"]`);
  if (!trigger) return;
  event.preventDefault();
  saveSegment(trigger);
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
const auth = await initializeAuth();
let serverLoadError = '';
if (auth.mode === 'server') {
  const role = auth.user.roles.some((item) => ['admin', 'teacher'].includes(item)) ? 'teacher' : 'student';
  store.setRole(role);
  try {
    store.setServerProjects(await loadServerProjects());
    await refreshResourceCatalog();
  } catch (error) {
    serverLoadError = error.message;
    store.setServerProjects([serverErrorProject(error.message)]);
  }
}
store.subscribe(renderApp);
bindStaticEvents();
initModalFocusGuard();
initLayoutPreferences();
renderApp();
if (serverLoadError) showToast(`服务器项目加载失败：${serverLoadError}`);
