/**
 * 职责: 提供当前用户个人 API Key 的加密保存、元数据查看与停用弹窗
 * 依赖内部: ../services/auth-client.js, ./dialogs.js, ./render.js
 * 依赖外部: Fetch API, DOM API
 * 暴露: openPersonalApiKeysModal
 */

import { apiRequest, currentAuth } from '../services/auth-client.js';
import { showToast } from './dialogs.js';
import { escapeHtml } from './render.js';

const modalRoot = document.querySelector('#modal-root');
let keys = [];
let serverModels = [];

function keyRows() {
  if (!keys.length) return '<div class="empty-state">尚未保存个人 API Key。</div>';
  return keys.map((item) => `<div class="management-user-row"><span><strong>${escapeHtml(item.label)}</strong>
    <small>${escapeHtml(item.provider)} · ${item.lastUsedAt ? `最近使用 ${escapeHtml(item.lastUsedAt)}` : '尚未使用'}</small></span>
    <span><em>${item.status === 'active' ? '已启用' : '已停用'}</em>${item.status === 'active'
      ? `<button class="text-button danger-text" data-personal-key-action="disable" data-key-id="${item.id}">停用</button>` : ''}</span></div>`).join('');
}

function keyForm() {
  return `<form class="management-panel" data-personal-key-form><h3>保存个人 Key</h3>
    <label>接口类型<select class="field" name="provider"><option value="openai_compatible">OpenAI-compatible</option></select></label>
    <label>名称<input class="field" name="label" required placeholder="例如 我的实验 Key"></label>
    <label>API Key<input class="field" type="password" name="apiKey" required autocomplete="new-password" placeholder="页面不会回显"></label>
    <button class="button button-primary" type="submit">加密保存</button></form>`;
}

function serverModelRows() {
  if (!serverModels.length) return '<div class="empty-state">管理员或教师尚未配置统一服务器模型。</div>';
  return serverModels.map((item) => `<div class="management-user-row"><span><strong>${escapeHtml(item.name)}</strong>
    <small>${escapeHtml(item.provider)} · ${escapeHtml(item.model)}</small></span>
    <em>${item.isDefault ? '默认服务器模型' : '可用服务器模型'}</em></div>`).join('');
}

function modalMarkup() {
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal management-modal"
    role="dialog" aria-modal="true" aria-label="个人 API Key" data-modal-stop>
    <header class="modal-header"><div><div class="eyebrow">PERSONAL API KEY</div><h2>个人 API Key</h2></div>
      <button class="icon-button" data-action="close-modal">×</button></header>
    <div class="modal-body management-body"><section class="management-panel"><div class="management-section-head"><div><h3>服务器默认模型目录</h3>
      <p>仅显示配置元数据；API Key 由管理员或教师保管，不会向学生公开。</p></div></div>${serverModelRows()}</section>
      <div class="management-account-layout">${keyForm()}
      <section class="management-panel"><div class="management-section-head"><div><h3>已保存 Key</h3>
        <p>只显示元数据，密钥明文永不回显。</p></div><span>${keys.length} 个</span></div>
        <div class="management-user-list">${keyRows()}</div></section></div></div>
    <footer class="modal-footer"><span>个人 Key 不会随默认数据迁移导出；服务器统一模型仍为默认调用来源。</span>
      <button class="button button-secondary" data-action="close-modal">关闭</button></footer>
  </section></div>`;
}

async function loadKeys() {
  const [keyResult, modelResult] = await Promise.all([apiRequest('/api/me/api-keys'),
    apiRequest('/api/ai/server-model-directory')]);
  keys = keyResult.keys || [];
  serverModels = modelResult.models || [];
}

async function saveKey(form) {
  const data = new FormData(form);
  await apiRequest('/api/me/api-keys', { method: 'POST', body: JSON.stringify({
    provider: data.get('provider'), label: data.get('label'), apiKey: data.get('apiKey'),
  }) });
  await loadKeys();
  modalRoot.innerHTML = modalMarkup();
  showToast('个人 API Key 已加密保存。');
}

async function handleSubmit(event) {
  const form = event.target.closest('[data-personal-key-form]');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try { await saveKey(form); }
  catch (error) { showToast(`保存失败：${error.message}`); button.disabled = false; }
}

async function handleClick(event) {
  const trigger = event.target.closest('[data-personal-key-action="disable"]');
  if (!trigger || !window.confirm('停用这个个人 API Key 吗？')) return;
  trigger.disabled = true;
  try {
    await apiRequest(`/api/me/api-keys/${encodeURIComponent(trigger.dataset.keyId)}`, { method: 'DELETE' });
    await loadKeys();
    modalRoot.innerHTML = modalMarkup();
    showToast('个人 API Key 已停用。');
  } catch (error) { showToast(`停用失败：${error.message}`); trigger.disabled = false; }
}

modalRoot.addEventListener('submit', handleSubmit);
modalRoot.addEventListener('click', handleClick);

export async function openPersonalApiKeysModal() {
  if (currentAuth.mode !== 'server') return showToast('个人 API Key 仅在服务器版中加密保存。');
  modalRoot.innerHTML = '<div class="modal-backdrop"><section class="modal management-modal"><div class="management-loading">正在加载个人 API Key…</div></section></div>';
  try { await loadKeys(); modalRoot.innerHTML = modalMarkup(); }
  catch (error) { modalRoot.innerHTML = ''; showToast(`个人 API Key 加载失败：${error.message}`); }
}
