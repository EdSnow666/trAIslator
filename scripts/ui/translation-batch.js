/**
 * 职责: 执行带进度提示和取消能力的全文翻译任务
 * 依赖内部: ../state/store.js, ../services/server-data.js, ./dialogs.js
 * 依赖外部: AbortController
 * 暴露: generateAllTranslations | generateAllPostEdits | confirmAllTranslations | submitAllTranslations | submitCurrentTranslation | cancelFullTranslation
 */

import { store } from '../state/store.js';
import { cancelServerAiTranslation, refreshServerProject,
  runServerAiTranslation, saveServerPostEdit, updateServerTranslationStates } from '../services/server-data.js';
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
    title: '全文 AI 译后编辑', done: 'AI 译后编辑', baseId: (segment) => store.getCurrentTranslation(segment)?.id };
  return { kind: 'ai_translation', promptId: project.activePromptId,
    title: '全文翻译', done: 'AI 译文', baseId: () => null };
}

async function runServerBatch(project, config) {
  const controller = new AbortController();
  activeBatch = { project, controller, requestId: null };
  dialogs.openTranslationProgress(project.segments.length, config.title);
  for (let index = 0; index < project.segments.length; index += 1) {
    const requestId = `full-${config.kind}-${crypto.randomUUID()}`;
    activeBatch.requestId = requestId;
    dialogs.updateTranslationProgress(index, project.segments.length, `正在处理第 ${index + 1} 段`);
    await runServerAiTranslation(project, project.segments[index], config.kind,
      config.promptId, config.baseId(project.segments[index]), { requestId, signal: controller.signal });
  }
  store.replaceServerProject(await refreshServerProject(project));
  showToast(`已生成 ${project.segments.length} 个${config.done}版本。`);
}

async function runBatch(kind) {
  const project = store.getProject();
  if (!store.getState().serverMode) return localGeneration(project);
  const config = operationConfig(project, kind);
  try {
    await runServerBatch(project, config);
  } catch (error) {
    showToast(activeBatch?.controller.signal.aborted ? '批量任务已取消，已完成的版本仍然保留。'
      : `${config.title}中断：${error.message}`);
  } finally { activeBatch = null; dialogs.closeModal(); }
}

export async function generateAllTranslations() { return runBatch('ai_translation'); }
export async function generateAllPostEdits() { return runBatch('ai_post_edit'); }

async function updateAllStates(action, label) {
  const project = store.getProject();
  if (!store.getState().serverMode) return showToast('批量确认与提交仅在登录服务器后可用。');
  try {
    await savePendingDrafts(project);
    const result = await updateServerTranslationStates(project, action);
    store.replaceServerProject(await refreshServerProject(project));
    dialogs.closeModal();
    showToast(`已${label} ${result.count} 条当前译文。`);
  } catch (error) { showToast(`${label}失败：${error.message}`); }
}

async function savePendingDrafts(project, segmentIds) {
  const selected = segmentIds?.length
    ? project.segments.filter((segment) => segmentIds.includes(segment.id)) : project.segments;
  for (const segment of selected) {
    const translation = store.getCurrentTranslation(segment);
    if (!translation) continue;
    const draft = getTranslationDraft(project.id, segment.id, translation.id);
    const saved = translation.postEditText || translation.aiText || '';
    if (draft === null || draft === saved) continue;
    await saveServerPostEdit(project, segment, translation, draft);
    clearTranslationDraft(project.id, segment.id, translation.id);
  }
}

export async function confirmAllTranslations() { return updateAllStates('confirm', '确认'); }
export async function submitAllTranslations() { return updateAllStates('submit', '提交'); }

export async function submitCurrentTranslation(trigger) {
  const project = store.getProject();
  try {
    await savePendingDrafts(project, [trigger.dataset.segmentId]);
    const result = await updateServerTranslationStates(project, 'submit', [trigger.dataset.segmentId]);
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
    if (store.getState().serverMode && editor.value !== (translation.postEditText || translation.aiText)) {
      await saveServerPostEdit(project, segment, translation, editor.value);
    }
    if (store.getState().serverMode) await updateServerTranslationStates(project, 'confirm', [segment.id]);
    clearTranslationDraft(project.id, segment.id, translation.id);
    if (store.getState().serverMode) store.replaceServerProject(await refreshServerProject(project));
    showToast('当前译文已确认。');
  } catch (error) { showToast(`确认失败：${error.message}`); }
}

export function handleTranslationConfirmation(event) {
  const editor = event.target.closest('[data-segment-editor]:not([data-ai-post-edit-draft])');
  if (!editor) return false;
  confirmEditor(editor, event);
  return true;
}

export async function cancelFullTranslation() {
  if (!activeBatch) return showToast('当前没有正在执行的全文翻译。');
  const task = activeBatch;
  task.controller.abort();
  if (task.requestId) await cancelServerAiTranslation(task.project, task.requestId).catch(() => false);
  dialogs.updateTranslationProgress(0, task.project.segments.length, '正在取消');
}
