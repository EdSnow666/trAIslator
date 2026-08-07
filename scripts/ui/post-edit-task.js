/**
 * 职责: 执行使用独立译后编辑 Prompt 的当前句任务，并可先保存新 Prompt 版本
 * 依赖内部: ../state/store.js, ../services/server-data.js, ./dialogs.js
 * 依赖外部: DOM API
 * 暴露: runPostEditTask
 */

import { store } from '../state/store.js';
import { createServerPrompt, refreshServerProject, runServerAiTranslation,
  selectServerPrompt } from '../services/server-data.js';
import { dialogs, showToast } from './dialogs.js';

async function resolvePrompt(project, content) {
  const current = project.prompts.find((item) => item.id === project.activePostEditPromptId);
  if (!document.querySelector('#post-edit-save-prompt')?.checked) return current?.id;
  const id = await createServerPrompt(project, { title: '译后编辑 Prompt 修改版',
    note: '从译后编辑任务窗口修改', content, promptKind: 'post_edit', basePrompt: current });
  await selectServerPrompt(project, id, 'post_edit');
  return id;
}

export async function runPostEditTask(trigger) {
  const project = store.getProject();
  const segment = store.getSegment();
  const translation = store.getCurrentTranslation(segment);
  if (!segment || !translation) return showToast('当前句没有可供译后编辑的译文。');
  trigger.disabled = true;
  try {
    const content = document.querySelector('#post-edit-task-prompt')?.value.trim();
    if (!content) throw new Error('译后编辑 Prompt 不能为空。');
    const promptId = await resolvePrompt(project, content);
    await runServerAiTranslation(project, segment, 'ai_post_edit', promptId,
      translation.serverBaseVersionId || translation.id);
    store.replaceServerProject(await refreshServerProject(project));
    dialogs.closeModal();
    showToast('AI 译后编辑已完成，可在译文框逐项检查。');
  } catch (error) { showToast(`译后编辑失败：${error.message}`); }
  finally { trigger.disabled = false; }
}
