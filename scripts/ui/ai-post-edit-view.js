/**
 * 职责: 在译文单元格内按正常文本流渲染可逐项接受或拒绝的 AI 译后编辑提案
 * 依赖内部: ../services/ai-post-edit.js
 * 依赖外部: 无
 * 暴露: hasVisibleAiPostEdit | renderAiPostEditField
 */

import { getAiPostEditParts } from '../services/ai-post-edit.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

export function hasVisibleAiPostEdit(state, translation) {
  return Boolean(state.aiPostEditVisible && translation?.aiPostEdit);
}

function renderDecisionMenu(segmentId, part) {
  return `<span class="ai-change-menu" role="menu"><button data-action="decide-ai-post-edit" data-segment-id="${segmentId}" data-change-id="${part.changeId}" data-decision="accepted">接受</button><button data-action="decide-ai-post-edit" data-segment-id="${segmentId}" data-change-id="${part.changeId}" data-decision="rejected">拒绝</button></span>`;
}

function changeLabel(part) {
  const action = part.type === 'added' ? '增加' : '删除';
  const decision = part.decision === 'pending' ? '未决定' : part.decision === 'accepted' ? '已接受' : '已拒绝';
  return `${action}：${part.value}，${decision}`;
}

function renderChange(segmentId, part) {
  const className = `ai-change-token is-${part.type} is-${part.decision}`;
  const attributes = `data-action="open-ai-change" aria-label="${escapeHtml(changeLabel(part))}"`;
  return `<span class="ai-change-wrap is-${part.type}"><span class="${className}" role="button" tabindex="0" ${attributes} title="点击接受或拒绝">${escapeHtml(part.value)}</span>${renderDecisionMenu(segmentId, part)}</span>`;
}

function renderParts(segmentId, aiPostEdit, direction) {
  return getAiPostEditParts(aiPostEdit, direction).map((part) => (
    part.type === 'same' ? `<span class="ai-same-text">${escapeHtml(part.value)}</span>` : renderChange(segmentId, part)
  )).join('');
}

export function renderAiPostEditField(project, segment, index, translation) {
  const languageClass = project.direction?.startsWith('ZH') ? 'is-en' : 'is-zh';
  return `<div class="ai-post-edit-text ${languageClass}" data-action="edit-ai-post-edit" data-segment-id="${segment.id}" data-ai-post-edit-field="${segment.id}" tabindex="0"
    aria-label="第 ${index + 1} 句 AI 译后编辑建议" title="点击进入临时编辑；离开时恢复 AI Diff 并保留草稿">${renderParts(
    segment.id, translation.aiPostEdit, project.direction,
  )}</div>`;
}