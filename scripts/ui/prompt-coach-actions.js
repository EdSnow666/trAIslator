/**
 * 职责: 选择多个个人项目、编辑教练 Prompt、确认修改并运行可取消的 AI Prompt 教练
 * 依赖内部: ../state/store.js, ../services/server-data.js, ./dialogs.js, ./translation-batch.js
 * 依赖外部: AbortController
 * 暴露: runPromptCoach | confirmRunPromptCoach | resetPromptCoachPrompt | cancelPromptCoach
 */

import { cancelServerProjectPromptCoach, loadPromptCoachSettings, refreshServerProject,
  runServerProjectPromptCoach } from '../services/server-data.js';
import { store } from '../state/store.js';
import { dialogs, showToast } from './dialogs.js';
import { confirmSelectedProjects } from './translation-batch.js';

let activeCoach = null;

export async function runPromptCoach() {
  if (!store.getState().serverMode) return showToast('请登录服务器后运行');
  const projects = store.getState().projects.filter((item) => item.editable && item.workspaceId);
  if (!projects.length) return showToast('当前账号没有可分析的个人项目。');
  try {
    const settings = await loadPromptCoachSettings();
    dialogs.openPromptCoachSetup(projects, settings, store.getProject().id);
  } catch (error) { showToast(`教练设置加载失败：${error.message}`); }
}

function selectedCoachInput() {
  const ids = [...document.querySelectorAll('[data-coach-project]:checked')].map((item) => item.value);
  const projects = ids.map((id) => store.getState().projects.find((item) => item.id === id)).filter(Boolean);
  const coachPrompt = document.querySelector('#prompt-coach-instruction')?.value.trim() || '';
  return { ids, projects, coachPrompt,
    coachPromptVersionId: document.querySelector('#coach-prompt-version')?.value,
    coachPromptTitle: document.querySelector('#coach-prompt-title')?.value.trim() };
}

export async function confirmRunPromptCoach() {
  const input = selectedCoachInput();
  if (!input.projects.length) return showToast('请至少选择一个项目。');
  const requestId = `prompt-coach-${crypto.randomUUID()}`;
  const controller = new AbortController();
  activeCoach = { requestId, controller };
  dialogs.openPromptCoachProgress(input.projects.length);
  await executeProjectCoach(input, requestId, controller);
}

async function executeProjectCoach(input, requestId, controller) {
  try {
    await confirmSelectedProjects(input.projects);
    dialogs.updatePromptCoachProgress('正在按教练 Prompt 分析已确认 Diff');
    const result = await runServerProjectPromptCoach(input.ids,
      { requestId, signal: controller.signal, coachPrompt: input.coachPrompt,
        coachPromptVersionId: input.coachPromptVersionId, coachPromptTitle: input.coachPromptTitle });
    for (const project of input.projects) {
      store.replaceServerProject(await refreshServerProject(project));
    }
    if (input.ids.includes(store.getProject().id)) store.setPromptCoachResult(result);
    dialogs.openResourceModal({ dataset: { tab: 'mentor' } });
    showToast('教练分析已完成');
  } catch (error) {
    if (controller.signal.aborted) {
      dialogs.closeModal();
      showToast('AI Prompt 教练已取消，本次结果未写入。');
    } else {
      dialogs.modal('AI Prompt 教练 · 运行未完成',
        `<p role="alert">${escapeCoachError(error.message)}</p><p class="muted">原译、人工版本及 Diff 记录仍保留；如分析已完成，可从历史记录查看结果。</p>`,
        '<button class="button button-ghost" data-action="close-modal">关闭</button><button class="button button-secondary" data-action="open-coach-history">历史运行记录</button><button class="button button-primary" data-action="run-prompt-coach">返回教练设置</button>');
    }
  } finally { activeCoach = null; }
}

function escapeCoachError(value) {
  return String(value || '运行未完成').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function resetPromptCoachPrompt() { dialogs.resetPromptCoachPrompt(); }

export async function cancelPromptCoach() {
  if (!activeCoach) return showToast('当前没有正在运行的 AI Prompt 教练。');
  const task = activeCoach;
  task.controller.abort();
  dialogs.updatePromptCoachProgress('正在取消');
  await cancelServerProjectPromptCoach(task.requestId).catch(() => false);
}
