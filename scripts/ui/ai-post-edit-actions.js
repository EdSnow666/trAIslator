/**
 * 职责: 处理 AI 译后编辑提案的生成、逐项决策、临时编辑与确认保存
 * 依赖内部: ../state/store.js, ../services/server-data.js, ./dialogs.js, ./translation-batch.js
 * 依赖外部: DOM API
 * 暴露: toggleAiPostEdit | runAiPostEdit | openAiChange | decideAiPostEdit | beginAiPostEdit | acceptCurrentAiPostEdit
 */

import { store } from '../state/store.js';
import { prepareServerPostEdit, refreshServerProject, runServerAiTranslation,
  saveServerAiDecision, updateServerTranslationStates } from '../services/server-data.js';
import { showToast } from './dialogs.js';
import { moveToNextSegment } from './translation-batch.js';

async function refreshProject() {
  const project = store.getProject();
  store.replaceServerProject(await refreshServerProject(project));
}

function aiPostEditBlocked() {
  return store.getProject().aiPostEditAllowed === false;
}

function rejectBlockedAiPostEdit() {
  if (!aiPostEditBlocked()) return false;
  showToast('当前班级仅允许人工编辑');
  return true;
}

function focusSegmentEditor(segmentId) {
  const selector = `[data-segment-editor="${segmentId}"], [data-ai-post-edit-field="${segmentId}"]`;
  document.querySelector(selector)?.focus();
}

export function toggleAiPostEdit() {
  if (rejectBlockedAiPostEdit()) return;
  const visible = !store.getState().aiPostEditVisible;
  store.setAiPostEditVisible(visible);
  showToast(visible ? '已显示' : '已隐藏');
}

export async function runAiPostEdit(trigger) {
  if (rejectBlockedAiPostEdit()) return;
  const segment = store.getSegment(trigger.dataset.segmentId || store.getSegment()?.id);
  const translation = store.getCurrentTranslation(segment);
  if (!translation || translation.origin === 'manual') return showToast('人工参考译文不进入 AI 译后编辑流程。');
  if (!store.getState().serverMode) {
    const proposal = store.generateAiPostEdit(segment.id, trigger.dataset.promptId);
    return showToast(proposal ? '已生成' : '无修改');
  }
  try {
    const project = store.getProject();
    await runServerAiTranslation(project, segment, 'ai_post_edit',
      trigger.dataset.promptId || project.activePostEditPromptId, translation.id);
    await refreshProject();
    showToast('已生成');
  } catch (error) { showToast(`AI 译后编辑失败：${error.message}`); }
}

function closeChangeMenus(exception = null) {
  document.querySelectorAll('.ai-change-wrap.is-open').forEach((item) => {
    if (item !== exception) item.classList.remove('is-open');
  });
}

export function openAiChange(trigger, event) {
  if (rejectBlockedAiPostEdit()) return;
  event.stopPropagation();
  const wrapper = trigger.closest('.ai-change-wrap');
  closeChangeMenus(wrapper);
  wrapper?.classList.toggle('is-open');
}

export async function decideAiPostEdit(trigger, event) {
  if (rejectBlockedAiPostEdit()) return;
  event?.preventDefault(); event?.stopPropagation();
  const segment = store.getSegment(trigger.dataset.segmentId);
  const translation = store.getCurrentTranslation(segment);
  const decision = trigger.dataset.decision;
  const message = decision === 'accepted' ? '已接受' : '已拒绝';
  store.decideAiPostEdit(segment.id, trigger.dataset.changeId, decision);
  if (!store.getState().serverMode || translation?.serverVersionKind !== 'ai_post_edit') {
    return showToast(message);
  }
  try {
    await saveServerAiDecision(store.getProject(), translation.id,
      trigger.dataset.changeId, decision);
    showToast(message);
  } catch (error) {
    await refreshProject().catch(() => undefined);
    showToast(`AI 修改决策保存失败：${error.message}`);
  }
}

export function beginAiPostEdit(trigger) {
  if (rejectBlockedAiPostEdit()) return;
  const result = store.beginAiPostEditDraft(trigger.dataset.segmentId);
  if (result === null) return;
  showToast('待保存');
  requestAnimationFrame(() => focusSegmentEditor(trigger.dataset.segmentId));
}

function applyAiPostEditResult(segmentId, message) {
  const result = store.applyAiPostEdit(segmentId, true);
  if (result === null) return false;
  showToast(message);
  requestAnimationFrame(() => focusSegmentEditor(segmentId));
  return true;
}

async function persistAiPostEdit(segment, text, message) {
  const project = store.getProject();
  const translation = store.getCurrentTranslation(segment);
  try {
    const edit = await prepareServerPostEdit(project, segment, translation, text);
    await updateServerTranslationStates(project, 'confirm', [segment.id], [edit]);
    await refreshProject();
    showToast(message); moveToNextSegment(segment.id);
  } catch (error) {
    await refreshProject().catch(() => undefined);
    showToast(`保存 AI 译后编辑失败：${error.message}`);
  }
}

async function acceptActiveDraft(event, segment, draft) {
  event.preventDefault();
  if (store.getState().serverMode) {
    return persistAiPostEdit(segment, draft.text, '已保存并确认');
  }
  store.savePostEdit(segment.id, draft.text);
  showToast('已保存并确认');
  return moveToNextSegment(segment.id);
}

export async function acceptCurrentAiPostEdit(event) {
  if (aiPostEditBlocked()) return false;
  if (document.querySelector('.modal')) return;
  const segment = store.getSegment();
  const draft = segment ? store.getAiPostEditDraft(segment.id) : null;
  if (draft?.active) return acceptActiveDraft(event, segment, draft);
  if (!store.getState().aiPostEditVisible) return;
  const edit = store.getCurrentTranslation(segment)?.aiPostEdit;
  if (!segment || edit?.status !== 'pending') return;
  event.preventDefault();
  if (!store.getState().serverMode) {
    applyAiPostEditResult(segment.id, '已保存并确认');
    return moveToNextSegment(segment.id);
  }
  const result = store.applyAiPostEdit(segment.id, true);
  if (result !== null) await persistAiPostEdit(segment, result, '已保存并确认');
}
