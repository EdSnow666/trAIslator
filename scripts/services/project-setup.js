/**
 * 职责: 读取项目创建弹窗中的任务书/Prompt 设置，并应用到离线项目
 * 依赖内部: 无
 * 依赖外部: DOM API
 * 暴露: readProjectSetup | applyOfflineProjectSetup
 */

const briefKeys = ['genre', 'skopos', 'audience', 'register', 'strategy'];

function readBriefContent() {
  return Object.fromEntries(briefKeys.map((key) => [key,
    document.querySelector(`[data-brief-setup-key="${key}"]`)?.value.trim() || '']));
}

export function readProjectSetup() {
  return {
    briefMode: document.querySelector('#import-brief-mode').value,
    promptMode: document.querySelector('#import-prompt-mode').value,
    briefVersionId: document.querySelector('#import-brief-version').value || undefined,
    promptVersionId: document.querySelector('#import-prompt-version').value || undefined,
    briefLanguage: document.querySelector('#import-brief-language')?.value || 'zh-CN',
    promptLanguage: document.querySelector('#import-prompt-language')?.value || 'zh-CN',
    briefContent: readBriefContent(),
    promptContent: document.querySelector('#import-prompt-manual').value.trim(),
  };
}

export function applyOfflineProjectSetup(project, setup, projects) {
  const sourceBrief = projects.find((item) => item.briefVersionId === setup.briefVersionId)?.brief || {};
  if (setup.briefMode !== 'auto') project.brief = { ...sourceBrief, ...setup.briefContent };
  const sourcePrompt = projects.flatMap((item) => item.prompts)
    .find((item) => item.id === setup.promptVersionId)?.content || '';
  if (setup.promptMode !== 'auto') project.prompts[0].content = setup.promptContent || sourcePrompt;
  project.briefVersionId = `brief-local-${Date.now()}`;
}