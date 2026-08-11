/**
 * 职责: 执行单次全文 JSON 翻译、全文 AI 译后编辑及确认/提交任务
 * 依赖内部: ../state/store.js, ../services/server-data.js, ./dialogs.js
 * 依赖外部: AbortController
 * 暴露: 全文生成、批量确认/提交、跨项目确认、取消与句段导航
 */

import { store } from '../state/store.js';
import { cancelServerAiTranslation, refreshServerProject,
  prepareServerPostEdit, runServerFullTranslation,
  updateServerTranslationStates } from '../services/server-data.js';
import { clearTranslationDraft, getTranslationDraft } from '../services/translation-drafts.js';
import { dialogs, showToast } from './dialogs.js';

let activeBatch = null;

function localGeneration(project) {
  const ids = project.segments.map((segment) => segment.id);
  store.generateMock(ids);
  showToast(`已新增 ${ids.length} 个模拟译文版本。`);
}

function operationConfig(project, kind) {
  if (kind === 'ai_post_edit') return { kind, promptId: project.activePostEditPromptId,
    title: '全文 AI 译后编辑', done: 'AI 译后编辑' };
  return { kind: 'ai_translation', promptId: project.activePromptId,
    title: '全文翻译', done: 'AI 译文' };
}

async function runServerFullBatch(project, config) {
  const controller = new AbortController();
  const requestId = `full-${config.kind}-${crypto.randomUUID()}`;
  activeBatch = { project, controller, requestId };
  dialogs.openTranslationProgress(project.segments.length, config.title);
  dialogs.updateTranslationProgress(0, project.segments.length,
    `正在进行${config.title}并校验段落 JSON`);
  const result = await runServerFullTranslation(project, config.promptId,
    { requestId, signal: controller.signal, kind: config.kind });
  dialogs.updateTranslationProgress(project.segments.length, project.segments.length,
    `已校验并写入 ${result.translationVersionIds.length} 个独立版本`);
  store.replaceServerProject(await refreshServerProject(project));
  showToast(`已通过一次全文请求生成 ${result.translationVersionIds.length} 个${config.done}版本。`);
}

async function runBatch(kind) {
  const project = store.getProject();
  if (!store.getState().serverMode) return localGeneration(project);
  const config = operationConfig(project, kind);
  try {
    await runServerFullBatch(project, config);
  } catch (error) {
    showToast(activeBatch?.controller.signal.aborted ? '全文任务已取消，未通过完整校验的结果不会写入。'
      : `${config.title}中断：${error.message}`);
  } finally { activeBatch = null; dialogs.closeModal(); }
}

export async function generateAllTranslations() { return runBatch('ai_translation'); }
export async function generateAllPostEdits() {
  if (store.getProject().aiPostEditAllowed === false) return showToast('当前班级仅允许人工编辑');
  return runBatch('ai_post_edit');
}

async function updateAllStates(action, label, options = {}) {
  const project = store.getProject();
  if (!store.getState().serverMode) return showToast('批量确认与提交仅在登录服务器后可用。');
  try {
    const pending = await collectPendingDrafts(project);
    const result = await updateServerTranslationStates(project, action, undefined, pending.edits);
    clearPendingDrafts(project, pending.drafts);
    store.replaceServerProject(await refreshServerProject(project));
    if (options.closeModal !== false) dialogs.closeModal();
    if (!options.silent) showToast(`已${label} ${result.count} 条当前译文。`);
    return result;
  } catch (error) {
    showToast(`${label}失败：${error.message}`);
    if (options.rethrow) throw error;
  }
}

async function collectPendingDrafts(project, segmentIds) {
  const selected = segmentIds?.length
    ? project.segments.filter((segment) => segmentIds.includes(segment.id)) : project.segments;
  const edits = []; const drafts = [];
  for (const segment of selected) {
    const translation = store.getCurrentTranslation(segment);
    if (!translation) continue;
    const draft = getTranslationDraft(project.id, segment.id, translation.id);
    const saved = translation.postEditText || translation.aiText || '';
    if (draft === null || draft === saved) continue;
    edits.push(await prepareServerPostEdit(project, segment, translation, draft));
    drafts.push({ segmentId: segment.id, translationId: translation.id });
  }
  return { edits, drafts };
}

function clearPendingDrafts(project, drafts) {
  drafts.forEach((draft) => clearTranslationDraft(project.id, draft.segmentId, draft.translationId));
}

export async function confirmAllTranslations(options) { return updateAllStates('confirm', '确认', options); }
export async function submitAllTranslations() { return updateAllStates('submit', '提交'); }

export async function confirmSelectedProjects(projects) {
  const prepared = [];
  for (const project of projects) {
    prepared.push({ project, pending: await collectPendingDrafts(project) });
  }
  const refreshed = [];
  for (const item of prepared) {
    await updateServerTranslationStates(item.project, 'confirm', undefined, item.pending.edits);
    clearPendingDrafts(item.project, item.pending.drafts);
    refreshed.push(await refreshServerProject(item.project));
  }
  refreshed.forEach((project) => store.replaceServerProject(project));
}

export async function submitCurrentTranslation(trigger) {
  const project = store.getProject();
  try {
    const segmentIds = [trigger.dataset.segmentId];
    const pending = await collectPendingDrafts(project, segmentIds);
    const result = await updateServerTranslationStates(project, 'submit', segmentIds, pending.edits);
    clearPendingDrafts(project, pending.drafts);
    store.replaceServerProject(await refreshServerProject(project));
    showToast(`当前译文已提交教师（${result.count} 条）。`);
  } catch (error) { showToast(`提交失败：${error.message}`); }
}

async function confirmEditor(editor, event) {
  event.preventDefault();
  const project = store.getProject();
  const segment = store.getSegment(editor.dataset.segmentEditor);
  const translation = store.getCurrentTranslation(segment);
  try {
    if (store.getState().serverMode) {
      const saved = translation.postEditText || translation.aiText || '';
      const edits = editor.value === saved ? []
        : [await prepareServerPostEdit(project, segment, translation, editor.value)];
      await updateServerTranslationStates(project, 'confirm', [segment.id], edits);
    } else store.savePostEdit(segment.id, editor.value);
    clearTranslationDraft(project.id, segment.id, translation.id);
    if (store.getState().serverMode) store.replaceServerProject(await refreshServerProject(project));
    showToast('已保存并确认');
    moveToNextSegment(segment.id);
  } catch (error) { showToast(`确认失败：${error.message}`); }
}

export function moveToNextSegment(segmentId) {
  const project = store.getProject();
  const index = project.segments.findIndex((segment) => segment.id === segmentId);
  const next = project.segments[index + 1];
  if (!next) return false;
  store.selectSegment(next.id);
  requestAnimationFrame(() => {
    const selector = `[data-segment-editor="${next.id}"], [data-ai-post-edit-field="${next.id}"]`;
    document.querySelector(selector)?.focus();
  });
  return true;
}

export function handleTranslationConfirmation(event) {
  const editor = event.target.closest('[data-segment-editor]:not([data-ai-post-edit-draft])');
  if (!editor) return false;
  confirmEditor(editor, event);
  return true;
}

export async function cancelFullTranslation() {
  if (!activeBatch) return showToast('当前没有正在执行的全文任务。');
  const task = activeBatch;
  task.controller.abort();
  if (task.requestId) await cancelServerAiTranslation(task.project, task.requestId).catch(() => false);
  dialogs.updateTranslationProgress(0, task.project.segments.length, '正在取消');
}
