/**
 * 职责: 处理 Prompt 谱系管理菜单中的编辑、归档和刷新流程
 * 依赖内部: ../state/store.js, ../services/server-data.js, ./dialogs.js
 * 依赖外部: DOM API
 * 暴露: openPromptVersionEditor | requestPromptArchive | archivePrompt
 */

import { store } from '../state/store.js';
import { archiveServerPrompt, refreshServerProject, restoreServerPrompt } from '../services/server-data.js';
import { dialogs, showToast } from './dialogs.js';

function selectedPrompt(trigger) {
  return store.getProject()?.prompts.find((prompt) => prompt.id === trigger.dataset.promptId) || null;
}

export function openPromptVersionEditor(trigger) {
  const prompt = selectedPrompt(trigger);
  if (!prompt) return showToast('Prompt 版本不存在或已删除。');
  dialogs.openPromptModal(prompt.content, { title: `${prompt.title} · 修改版`,
    note: `基于 ${prompt.displayLabel || `v${prompt.version}`} 修改`,
    basePromptId: prompt.id, promptKind: prompt.promptKind || 'translation', useBase: true });
}

export function requestPromptArchive(trigger) {
  const prompt = selectedPrompt(trigger);
  if (!prompt) return showToast('Prompt 版本不存在或已删除。');
  dialogs.openPromptArchiveConfirm(prompt);
}

async function refreshProject() {
  const snapshot = await refreshServerProject(store.getProject());
  store.replaceServerProject(snapshot);
}

export async function archivePrompt(trigger) {
  const promptId = trigger.dataset.promptId;
  if (!store.getState().serverMode) {
    if (!store.archivePromptVersion(promptId)) return showToast('当前使用的 Prompt 不能归档，请先切换版本。');
    dialogs.openPromptLineageModal();
    return showToast('Prompt 版本已归档，可随时在谱系中查看。');
  }
  trigger.disabled = true;
  try {
    await archiveServerPrompt(promptId);
    await refreshProject();
    dialogs.openPromptLineageModal();
    showToast('Prompt 版本已归档；历史译文仍保留其快照。');
  } catch (error) {
    showToast(`Prompt 归档失败：${error.message}`);
    trigger.disabled = false;
  }
}

export async function restorePrompt(trigger) {
  trigger.disabled = true;
  try {
    await restoreServerPrompt(trigger.dataset.promptId);
    await refreshProject();
    dialogs.openPromptLineageModal({ showArchived: true });
    showToast('Prompt 已恢复到可用谱系。');
  } catch (error) { showToast(`Prompt 恢复失败：${error.message}`); }
  finally { trigger.disabled = false; }
}
