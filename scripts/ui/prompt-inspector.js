/**
 * 职责: 在管理员 Prompt 菜单中展示各 AI 功能实际发送的完整消息结构
 * 依赖内部: ../state/store.js, ../services/auth-client.js, ./render.js, ./dialogs.js
 * 依赖外部: DOM API
 * 暴露: openPromptInspectorModal
 */

import { store } from '../state/store.js?v=20260805-04';
import { apiRequest } from '../services/auth-client.js?v=20260805-04';
import { escapeHtml } from './render.js?v=20260805-04';
import { showToast } from './dialogs.js?v=20260805-10';
function inspectorUrl(project, segment) {
  const query = new URLSearchParams({ projectId: project.id });
  if (project.workspaceId) query.set('workspaceId', project.workspaceId);
  if (segment?.id) query.set('segmentId', segment.id);
  return `/api/manage/prompt-structures?${query}`;
}
function operationCard(operation, index) {
  const content = escapeHtml(JSON.stringify(operation.messages, null, 2));
  return `<details class="prompt-inspector-operation" ${index === 0 ? 'open' : ''}>
    <summary>${escapeHtml(operation.label)}</summary><pre>${content}</pre></details>`;
}
function renderInspector(data) {
  const root = document.querySelector('#modal-root');
  const layers = data.promptLayers;
  const cards = data.operations.map(operationCard).join('');
  root.innerHTML = `<div class="modal-backdrop"><section class="modal modal-wide" role="dialog"
    aria-modal="true" aria-label="后台 Prompt 发送结构">
    <header class="modal-header"><div><div class="eyebrow">ADMIN PROMPT INSPECTOR</div>
      <h2>后台 Prompt 发送结构</h2></div><button class="icon-button" data-action="close-modal">×</button></header>
    <div class="modal-body"><p class="muted">以下为实际消息组装结构；不展示 API Key、登录 Token 和请求头。</p>
      <div class="prompt-layer-summary"><strong>Overarching Prompt</strong><span>${escapeHtml(layers.overarching?.title || '未发布')}</span>
      <strong>自定义 Prompt</strong><span>${escapeHtml(layers.custom?.title || '未使用')}</span></div>${cards}</div>
    <footer class="modal-footer"><button class="button button-ghost" data-action="close-modal">关闭</button></footer>
  </section></div>`;
}
export async function openPromptInspectorModal() {
  const project = store.getProject();
  if (!store.getState().serverMode) return showToast('后台 Prompt 结构仅在服务器管理员账号中提供。');
  try {
    const data = await apiRequest(inspectorUrl(project, store.getSegment()));
    renderInspector(data);
  } catch (error) { showToast(`Prompt 结构读取失败：${error.message}`); }
}