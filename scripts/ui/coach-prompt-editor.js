/**
 * 职责: 独立编辑保存教练 Prompt 版本、切换当前版本、从人工 Diff 生成草稿并取消生成
 * 依赖内部: ../services/auth-client.js, ../services/server-data.js, ../state/store.js, ./dialogs.js, ./translation-batch.js
 * 依赖外部: DOM API, MutationObserver, AbortController
 * 暴露: openCoachPromptEditor | saveCoachPrompt | activateCoachPromptVersion | generateCoachInstruction | cancelCoachInstruction
 */

import { apiRequest } from '../services/auth-client.js';
import { loadPromptCoachSettings, cancelServerProjectPromptCoach } from '../services/server-data.js';
import { store } from '../state/store.js';
import { dialogs, showToast } from './dialogs.js';
import { confirmSelectedProjects } from './translation-batch.js';

let activeGeneration = null;

export async function openCoachPromptEditor() {
  if (!store.getState().serverMode) return showToast('请登录服务器后编辑');
  try {
    const settings = await loadPromptCoachSettings();
    const projects = store.getState().projects.filter((item) => item.editable && item.workspaceId);
    dialogs.openPromptCoachSetup(projects, settings, store.getProject().id, { editorOnly: true });
  } catch (error) { showToast(`教练 Prompt 加载失败：${error.message}`); }
}

export async function saveCoachPrompt() {
  const field = document.querySelector('#prompt-coach-instruction');
  if (!field || activeGeneration) return;
  try {
    const result = await apiRequest('/api/prompt-coach/settings', { method: 'PUT',
      body: JSON.stringify({ coachPrompt: field.value.trim(),
        title: document.querySelector('#coach-prompt-title')?.value.trim(),
        parentVersionId: document.querySelector('#coach-prompt-version')?.value }) });
    dialogs.updateCoachVersionSettings(result);
    showToast('教练 Prompt 版本已保存');
  } catch (error) { showToast(`保存失败：${error.message}`); }
}

export async function activateCoachPromptVersion() {
  if (activeGeneration) return;
  const id = document.querySelector('#coach-prompt-version')?.value;
  if (!id) return;
  try {
    const settings = await apiRequest(`/api/prompt-coach/versions/${encodeURIComponent(id)}/activate`, { method: 'POST' });
    dialogs.updateCoachVersionSettings(settings);
    showToast('已切换当前教练 Prompt');
  } catch (error) { showToast(`切换失败：${error.message}`); }
}

function generationControls(active, status) {
  const root = document.querySelector('#modal-root');
  root.querySelectorAll('[data-coach-project], #prompt-coach-instruction, #coach-prompt-version, #coach-prompt-title, [data-action="activate-coach-prompt-version"], [data-action="save-coach-prompt"], [data-action="generate-coach-instruction"], [data-action="confirm-run-prompt-coach"], [data-action="reset-prompt-coach-prompt"]').forEach((field) => { field.disabled = active; });
  const cancel = root.querySelector('[data-action="cancel-coach-instruction"]');
  if (cancel) cancel.hidden = !active;
  const label = root.querySelector('[data-coach-instruction-status]');
  if (label) label.textContent = status;
}

export async function generateCoachInstruction() {
  if (activeGeneration) return;
  const field = document.querySelector('#prompt-coach-instruction');
  if (!field) return;
  const ids = [...document.querySelectorAll('[data-coach-project]:checked')].map((item) => item.value);
  const projects = store.getState().projects.filter((item) => ids.includes(item.id));
  if (!projects.length) return showToast('请至少选择一个项目');
  const task = { requestId: `coach-instruction-${crypto.randomUUID()}`, controller: new AbortController() };
  activeGeneration = task;
  generationControls(true, '正在确认所选项目修改…');
  const observer = new MutationObserver(() => { if (!field.isConnected) cancelCoachInstruction(); });
  observer.observe(document.querySelector('#modal-root'), { childList: true });
  try {
    await confirmSelectedProjects(projects);
    if (task.controller.signal.aborted) return;
    generationControls(true, '正在根据人工修改生成教练 Prompt…');
    const result = await apiRequest('/api/prompt-coach/instruction/generate', { method: 'POST',
      body: JSON.stringify({ projectIds: ids, coachPrompt: field.value, requestId: task.requestId }),
      signal: task.controller.signal });
    if (field.isConnected) field.value = result.content;
    generationControls(false, '已生成草稿，可继续编辑并保存');
  } catch (error) {
    generationControls(false, task.controller.signal.aborted ? '已取消生成' : `生成失败：${error.message}`);
  } finally { observer.disconnect(); activeGeneration = null; generationControls(false,
    document.querySelector('[data-coach-instruction-status]')?.textContent || ''); }
}

export async function cancelCoachInstruction() {
  if (!activeGeneration || activeGeneration.controller.signal.aborted) return;
  activeGeneration.controller.abort();
  await cancelServerProjectPromptCoach(activeGeneration.requestId).catch(() => false);
}
