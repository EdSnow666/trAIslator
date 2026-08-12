/**
 * 职责: 在顶栏和当前生成窗口显示 AI 排队位次，并提供教师/管理员插队操作
 * 依赖内部: ../services/auth-client.js, ./dialogs.js
 * 依赖外部: DOM API
 * 暴露: initAiQueueStatus | prioritizeAiQueue
 */

import { apiRequest } from '../services/auth-client.js';
import { showToast } from './dialogs.js';

let currentStatus = null;

function statusLabel(status) {
  if (status.state === 'waiting') return `排队中，预计前面还有 ${status.ahead} 位`;
  if (status.state === 'running') return 'AI 生成中';
  if (status.state === 'cancelled') return '已取消';
  return '';
}

function renderStatus(status) {
  currentStatus = status.state === 'hidden' ? null : status;
  const root = document.querySelector('#ai-queue-indicator');
  if (!root) return;
  root.hidden = !currentStatus || !['waiting', 'running'].includes(currentStatus.state);
  root.querySelector('[data-ai-queue-label]').textContent = currentStatus ? statusLabel(currentStatus) : '';
  root.querySelector('[data-action="prioritize-ai-request"]').hidden = !currentStatus?.canPrioritize;
  const progress = document.querySelector('[data-translation-progress], [data-prompt-coach-progress]');
  if (progress && currentStatus?.state === 'waiting') progress.textContent = statusLabel(currentStatus);
}

export function initAiQueueStatus() {
  window.addEventListener('ai-queue-status', (event) => renderStatus(event.detail));
}

export async function prioritizeAiQueue() {
  if (!currentStatus?.requestId) return;
  try {
    const status = await apiRequest(`/api/ai/queue/${currentStatus.requestId}/priority`, { method: 'POST' });
    renderStatus(status);
    showToast('已插队，任务将在当前运行任务结束后优先执行。');
  } catch (error) { showToast(`插队失败：${error.message}`); }
}
