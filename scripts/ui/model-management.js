/**
 * 职责: 提供管理员和教师使用的统一服务器模型配置弹窗
 * 依赖内部: ../services/auth-client.js, ./dialogs.js, ./render.js
 * 依赖外部: Fetch API, DOM API
 * 暴露: openModelManagementModal
 */

import { apiRequest, currentAuth } from '../services/auth-client.js?v=20260805-02';
import { showToast } from './dialogs.js?v=20260805-07';
import { escapeHtml } from './render.js?v=20260805-04';

const modalRoot = document.querySelector('#modal-root');
let modelState = { models: [], editingId: null, testingId: null, testResults: {} };

function canManageModels() {
  return currentAuth.mode === 'server'
    && currentAuth.user?.roles.some((role) => ['admin', 'teacher'].includes(role));
}

function editingModel() {
  return modelState.models.find((item) => item.id === modelState.editingId) || null;
}

function modelTestResult(id) {
  const result = modelState.testResults[id];
  if (!result) return '';
  const className = result.ok ? 'is-success' : 'is-error';
  const text = result.ok ? `连接成功 · ${result.latencyMs} ms · ${result.attempts} 次尝试`
    : `连接失败 · ${result.message}`;
  return `<small class="model-test-result ${className}">${escapeHtml(text)}</small>`;
}

function modelRows() {
  if (!modelState.models.length) return '<div class="empty-state">尚未配置服务器模型。</div>';
  return modelState.models.map((item) => `<div class="management-user-row">
    <span><strong>${escapeHtml(item.name)}${item.isDefault ? ' · 默认' : ''}</strong>
      <small>${escapeHtml(item.model)} · ${escapeHtml(item.baseUrl)}</small>${modelTestResult(item.id)}</span>
    <span><em>${item.status === 'active' ? '已启用' : '已停用'}</em>
      ${item.status === 'active' ? `<button class="text-button" data-model-action="test" data-model-id="${item.id}"
        ${modelState.testingId === item.id ? 'disabled' : ''}>${modelState.testingId === item.id ? '测试中…' : '测试连接'}</button>` : ''}
      <button class="text-button" data-model-action="edit" data-model-id="${item.id}">编辑</button>
      ${item.status === 'active' ? `<button class="text-button danger-text" data-model-action="disable" data-model-id="${item.id}">停用</button>` : ''}</span>
  </div>`).join('');
}

function modelForm() {
  const item = editingModel();
  return `<form class="management-panel" data-model-form>
    <h3>${item ? '编辑服务器模型' : '新增服务器模型'}</h3>
    <input type="hidden" name="id" value="${item?.id || ''}">
    <label>配置名称<input class="field" name="name" required value="${escapeHtml(item?.name || '')}" placeholder="例如 课堂统一模型"></label>
    <label>OpenAI-compatible Base URL<input class="field" name="baseUrl" required value="${escapeHtml(item?.baseUrl || '')}" placeholder="https://api.example.com/v1"></label>
    <label>模型名称<input class="field" name="model" required value="${escapeHtml(item?.model || '')}" placeholder="model-name"></label>
    <label>API Key<input class="field" type="password" name="apiKey" autocomplete="new-password" placeholder="${item ? '留空表示保留现有 Key' : '新配置必须填写'}"></label>
    <div class="management-model-numbers"><label>超时（秒）<input class="field" type="number" name="timeoutSeconds" min="5" max="300" value="${(item?.requestTimeoutMs || 60000) / 1000}"></label>
      <label>失败重试<input class="field" type="number" name="maxRetries" min="0" max="5" value="${item?.maxRetries ?? 1}"></label></div>
    <label class="management-model-default"><input type="checkbox" name="isDefault" ${item?.isDefault ? 'checked' : ''}>设为服务器默认模型</label>
    <div class="management-row-actions"><button class="button button-primary" type="submit">保存配置</button>
      ${item ? '<button class="button button-secondary" type="button" data-model-action="cancel-edit">取消编辑</button>' : ''}</div>
  </form>`;
}

function modalMarkup() {
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal management-modal model-management-modal" role="dialog" aria-modal="true" aria-label="服务器模型配置" data-modal-stop>
    <header class="modal-header"><div><div class="eyebrow">SERVER AI</div><h2>服务器模型配置</h2></div><button class="icon-button" data-action="close-modal">×</button></header>
    <div class="modal-body management-body"><div class="management-account-layout">${modelForm()}
      <section class="management-panel"><div class="management-section-head"><div><h3>统一模型</h3><p>学生和实验用户只使用已启用的默认配置，看不到 API Key。</p></div><span>${modelState.models.length} 个</span></div>
        <div class="management-user-list">${modelRows()}</div></section></div></div>
    <footer class="modal-footer"><span>Key 使用服务器主密钥加密；页面不会回显。</span><button class="button button-secondary" data-action="close-modal">关闭</button></footer>
  </section></div>`;
}

function renderModels() {
  modalRoot.innerHTML = modalMarkup();
}

async function loadModels() {
  const result = await apiRequest('/api/manage/server-models');
  modelState.models = result.models;
  if (!modelState.models.some((item) => item.id === modelState.editingId)) modelState.editingId = null;
}

async function saveModel(form) {
  const data = new FormData(form);
  const payload = { id: data.get('id') || undefined, name: data.get('name'),
    provider: 'openai_compatible', baseUrl: data.get('baseUrl'), model: data.get('model'),
    apiKey: data.get('apiKey') || undefined, isDefault: data.get('isDefault') === 'on',
    requestTimeoutMs: Number(data.get('timeoutSeconds')) * 1000,
    maxRetries: Number(data.get('maxRetries')) };
  await apiRequest('/api/manage/server-models', { method: 'POST', body: JSON.stringify(payload) });
  modelState.editingId = null;
  await loadModels();
  renderModels();
  showToast('服务器模型配置已保存。');
}

async function handleModelSubmit(event) {
  const form = event.target.closest('[data-model-form]');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try { await saveModel(form); }
  catch (error) { showToast(`保存失败：${error.message}`); button.disabled = false; }
}

async function testModel(id) {
  modelState.testingId = id;
  renderModels();
  try {
    const result = await apiRequest(`/api/manage/server-models/${encodeURIComponent(id)}/test`, { method: 'POST' });
    modelState.testResults[id] = result;
    showToast(`模型连接成功，耗时 ${result.latencyMs} ms。`);
  } catch (error) {
    modelState.testResults[id] = { ok: false, message: error.message };
    showToast(`模型连接失败：${error.message}`);
  } finally {
    modelState.testingId = null;
    renderModels();
  }
}

async function disableModel(id) {
  if (!window.confirm('停用这个服务器模型配置吗？')) return;
  await apiRequest(`/api/manage/server-models/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await loadModels();
  renderModels();
  showToast('服务器模型配置已停用。');
}

async function handleModelClick(event) {
  const trigger = event.target.closest('[data-model-action]');
  if (!trigger) return;
  const action = trigger.dataset.modelAction;
  if (action === 'edit') { modelState.editingId = trigger.dataset.modelId; return renderModels(); }
  if (action === 'cancel-edit') { modelState.editingId = null; return renderModels(); }
  if (action === 'test') return testModel(trigger.dataset.modelId);
  if (action !== 'disable') return;
  try { await disableModel(trigger.dataset.modelId); }
  catch (error) { showToast(`停用失败：${error.message}`); }
}

modalRoot.addEventListener('submit', handleModelSubmit);
modalRoot.addEventListener('click', handleModelClick);

export async function openModelManagementModal() {
  if (!canManageModels()) return showToast('服务器模型配置仅供已登录的管理员和教师使用。');
  modelState = { models: [], editingId: null, testingId: null, testResults: {} };
  modalRoot.innerHTML = '<div class="modal-backdrop"><section class="modal management-modal"><div class="management-loading">正在加载服务器模型配置…</div></section></div>';
  try { await loadModels(); renderModels(); }
  catch (error) { modalRoot.innerHTML = ''; showToast(`模型配置加载失败：${error.message}`); }
}
