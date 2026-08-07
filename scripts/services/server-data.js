/**
 * 职责: 加载/创建服务器项目，并持久化任务书、Prompt、译后编辑、当前版本和 AI 修改决策
 * 依赖内部: ./auth-client.js, ./ai-post-edit.js
 * 依赖外部: Fetch API, Web Crypto API
 * 暴露: 项目创建与资源目录、可取消资源生成、项目快照、Prompt 协作、译后编辑、版本选择、AI 决策与真实 AI 执行
 */

import { resolveAiPostEdit } from './ai-post-edit.js';
import { apiRequest } from './auth-client.js';

let activeProjectGeneration = null;

function requestId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function ensureWorkspace(project) {
  if (project.workspaceId) return project.workspaceId;
  if (!project.editable) return null;
  const result = await apiRequest(`/api/projects/${encodeURIComponent(project.id)}/workspace`, {
    method: 'POST',
  });
  return result.id;
}

async function loadSnapshot(projectInfo) {
  const workspaceId = await ensureWorkspace(projectInfo);
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const result = await apiRequest(
    `/api/projects/${encodeURIComponent(projectInfo.id)}/snapshot${query}`,
  );
  return {
    ...result.project,
    projectKind: projectInfo.projectKind,
    status: projectInfo.status,
    isLocal: projectInfo.isLocal,
    classTags: projectInfo.classTags || [],
    teachingAssignmentCount: projectInfo.teachingAssignmentCount || 0,
    canManage: Boolean(result.project.canManage || projectInfo.canManage),
    workspaceId,
    editable: Boolean(workspaceId),
  };
}

function emptyProject(message = '请联系教师，将已发布项目分配到你的班级或实验阶段。') {
  const prompt = {
    id: 'no-project-prompt', version: 0, displayLabel: '—', title: '尚未分配项目',
    author: '系统', role: '系统', status: 'published', createdAt: '', note: '',
    content: message,
  };
  return {
    id: 'server-empty', name: '尚未分配项目', direction: '—', sourceLang: '—',
    targetLang: '—', brief: {}, activePromptId: prompt.id, prompts: [prompt],
    segments: [], terms: [], tm: [], serverMode: true, workspaceId: null, editable: false,
  };
}

export function serverErrorProject(message) {
  const project = emptyProject(message);
  project.name = '服务器项目加载失败';
  return project;
}

export async function loadServerProjects() {
  const result = await apiRequest('/api/projects');
  if (!result.projects.length) return [emptyProject()];
  return Promise.all(result.projects.map(loadSnapshot));
}

export async function refreshServerProject(project) {
  return loadSnapshot({
    id: project.id,
    projectKind: project.projectKind,
    status: project.status,
    workspaceId: project.workspaceId,
    editable: project.editable,
    isLocal: project.isLocal,
    classTags: project.classTags,
    teachingAssignmentCount: project.teachingAssignmentCount,
    canManage: project.canManage,
  });
}

function parseBrief(value) {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value); } catch { return {}; }
}

function mapResource(item) {
  const prompt = item.promptVersionId ? { id: item.promptVersionId, version: 1,
    title: '可继承全文 Prompt', content: item.promptContent || '' } : null;
  return { id: item.projectId, name: item.name, direction: item.direction,
    briefVersionId: item.briefVersionId, brief: parseBrief(item.briefContent),
    activePromptId: prompt?.id || null, prompts: prompt ? [prompt] : [] };
}

export async function loadProjectResourceCatalog() {
  const result = await apiRequest('/api/project-resources/catalog');
  return (result.resources || []).map(mapResource);
}

export async function createServerProject(input) {
  return apiRequest('/api/projects', { method: 'POST', body: JSON.stringify(input) });
}

export async function saveServerBrief(projectId, content) {
  return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/briefs`, {
    method: 'POST', body: JSON.stringify({ content }),
  });
}

export async function generateServerBrief(projectId, options = {}) {
  return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/brief/generate`, {
    method: 'POST', body: JSON.stringify(options),
  });
}

export async function generateServerPrompt(projectId, options = {}) {
  return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/prompt/generate`, {
    method: 'POST', body: JSON.stringify(options),
  });
}

function generationTasks(setup) {
  const tasks = [];
  if (setup.briefMode === 'auto') tasks.push({ resource: 'brief', label: '任务书',
    language: setup.briefLanguage });
  if (setup.promptMode === 'auto') tasks.push({ resource: 'prompt', label: '全文 Prompt',
    language: setup.promptLanguage });
  return tasks;
}

function generationTask(resource, language) {
  return resource === 'brief' ? { resource, language, label: '任务书', generate: generateServerBrief }
    : { resource: 'prompt', language, label: '全文 Prompt', generate: generateServerPrompt };
}

export async function generateServerProjectResource(projectId, resource, language, onProgress) {
  const task = generationTask(resource, language);
  const generationRequestId = requestId(`project-${task.resource}`);
  activeProjectGeneration = { projectId, requestId: generationRequestId };
  onProgress({ active: true, label: `正在生成${task.label}……` });
  try {
    await task.generate(projectId, { language: task.language, requestId: generationRequestId });
  } catch (error) {
    const label = error.code === 'AI_REQUEST_CANCELLED' ? '生成已取消，项目已保留。' : `生成未完成：${error.message}`;
    onProgress({ active: false, label });
    throw error;
  } finally { activeProjectGeneration = null; }
}

export async function generateServerProjectResources(projectId, setup, onProgress) {
  for (const task of generationTasks(setup)) {
    await generateServerProjectResource(projectId, task.resource, task.language, onProgress);
  }
  onProgress({ active: false, label: '自动生成已完成。' });
}

export async function cancelServerProjectGeneration() {
  if (!activeProjectGeneration) return false;
  const current = activeProjectGeneration;
  const result = await apiRequest(`/api/projects/${encodeURIComponent(current.projectId)}/generation/cancel`, {
    method: 'POST', body: JSON.stringify({ requestId: current.requestId }),
  });
  return Boolean(result.cancelled);
}
export async function createServerPrompt(project, input) {
  const parent = input.basePrompt ? {
    ...(input.basePrompt.isOwnedByCurrentUser && input.basePrompt.projectId === project.id
      ? { lineageId: input.basePrompt.lineageId } : {}),
    parentVersionId: input.basePrompt.id,
  } : {};
  const result = await apiRequest(`/api/projects/${encodeURIComponent(project.id)}/prompts`, {
    method: 'POST',
    body: JSON.stringify({
      ...parent,
      title: input.title,
      note: input.note,
      content: input.content,
      promptKind: input.promptKind || 'translation',
      sourceType: 'human',
      requestId: requestId('prompt-save'),
    }),
  });
  return result.id;
}

export async function archiveServerPrompt(promptId) {
  return apiRequest(`/api/prompts/${encodeURIComponent(promptId)}/archive`, { method: 'POST' });
}
export async function restoreServerPrompt(promptId) {
  return apiRequest(`/api/prompts/${encodeURIComponent(promptId)}/restore`, { method: 'POST' });
}
export async function importServerResourcePairs(projectId, kind, pairs) {
  return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/resources/${kind}/import`, {
    method: 'POST', body: JSON.stringify({ pairs }),
  });
}
export async function submitServerPrompt(promptId) {
  return apiRequest(`/api/prompts/${encodeURIComponent(promptId)}/submit`, { method: 'POST' });
}

export async function unpublishServerPrompt(projectId, promptId) {
  return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/prompts/unpublish`, {
    method: 'POST', body: JSON.stringify({ promptVersionId: promptId }),
  });
}
export async function publishServerPrompt(projectId, promptId) {
  return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/prompts/publish`, {
    method: 'POST',
    body: JSON.stringify({ promptVersionId: promptId }),
  });
}

export async function selectServerPrompt(project, promptId, promptKind = 'translation') {
  let workspaceId = project.workspaceId;
  if (!workspaceId && project.canManage) {
    const result = await apiRequest(`/api/projects/${encodeURIComponent(project.id)}/workspace`, { method: 'POST' });
    workspaceId = result.id;
    project.workspaceId = workspaceId;
    project.editable = true;
  }
  if (!workspaceId) throw new Error('当前项目没有可编辑的个人工作空间。');
  return apiRequest(`/api/workspaces/${workspaceId}/active-prompt`, {
    method: 'POST', body: JSON.stringify({ promptVersionId: promptId, promptKind,
      requestId: requestId('prompt-activate') }),
  });
}

async function materializeBase(project, segment, translation) {
  if (translation.serverVersionKind) {
    return {
      parentId: translation.id,
      baseId: translation.serverBaseVersionId || translation.id,
    };
  }
  const result = await apiRequest(`/api/workspaces/${project.workspaceId}/generated-translations`, {
    method: 'POST',
    body: JSON.stringify({
      segmentId: segment.id,
      content: translation.aiText || '',
      promptVersionId: translation.promptId || undefined,
      kind: 'ai_translation',
      requestId: requestId('translation'),
      provider: 'mock',
      model: translation.model || 'Mock Translator',
      context: { source: 'browser-mock-translation' },
    }),
  });
  return { parentId: result.id, baseId: result.id };
}

async function materializeAiEdit(project, segment, translation) {
  const base = await materializeBase(project, segment, translation);
  const edit = translation.aiPostEdit;
  if (!edit || translation.serverVersionKind === 'ai_post_edit') return base;
  const content = edit.resultText || resolveAiPostEdit(edit, project.direction, true);
  const result = await apiRequest(`/api/workspaces/${project.workspaceId}/generated-translations`, {
    method: 'POST',
    body: JSON.stringify({
      segmentId: segment.id,
      content,
      parentVersionId: base.parentId,
      baseVersionId: base.baseId,
      promptVersionId: translation.promptId || undefined,
      kind: 'ai_post_edit',
      requestId: requestId('ai-post-edit'),
      provider: 'mock',
      model: edit.model || 'Mock-PostEditor 1.0',
      context: { source: 'browser-ai-post-edit' },
    }),
  });
  return { parentId: result.id, baseId: base.baseId };
}

export async function runServerAiTranslation(project, segment, kind, promptId, baseVersionId, options = {}) {
  if (!project.workspaceId) throw new Error('当前项目没有可运行 AI 任务的个人工作空间。');
  const runRequestId = options.requestId || requestId(kind);
  const result = await apiRequest(`/api/workspaces/${project.workspaceId}/ai/execute`, {
    method: 'POST',
    body: JSON.stringify({ segmentId: segment.id, promptVersionId: promptId,
      baseVersionId: baseVersionId || undefined, kind, requestId: runRequestId }),
    signal: options.signal,
  });
  return result.translationVersionId;
}
export async function cancelServerAiTranslation(project, runRequestId) {
  if (!project.workspaceId) return false;
  const result = await apiRequest(`/api/workspaces/${project.workspaceId}/ai/cancel`, {
    method: 'POST', body: JSON.stringify({ requestId: runRequestId }),
  });
  return Boolean(result.cancelled);
}
export async function saveServerPostEdit(project, segment, translation, content) {
  if (!project.workspaceId) throw new Error('当前项目为只读模板，请先发布并分配项目。');
  const edit = await prepareServerPostEdit(project, segment, translation, content);
  const result = await apiRequest(`/api/workspaces/${project.workspaceId}/post-edits`, {
    method: 'POST',
    body: JSON.stringify(edit),
  });
  return result.id;
}

export async function prepareServerPostEdit(project, segment, translation, content) {
  const version = await materializeAiEdit(project, segment, translation);
  return {
    segmentId: segment.id,
    content: content.trim(),
    parentVersionId: version.parentId,
    baseVersionId: version.baseId,
    expectedVersionId: version.parentId,
    promptVersionId: translation.promptId || undefined,
    requestId: requestId('human-post-edit'),
  };
}
export async function selectServerVersion(project, segmentId, translationId) {
  if (!project.workspaceId) throw new Error('当前项目为只读模板，不能改变当前译文。');
  return apiRequest(`/api/workspaces/${project.workspaceId}/current-version`, {
    method: 'POST',
    body: JSON.stringify({
      segmentId,
      translationVersionId: translationId,
      requestId: requestId('select-version'),
    }),
  });
}

export async function updateServerTranslationStates(project, action, segmentIds, edits = []) {
  if (!project.workspaceId) throw new Error('当前项目没有可操作的个人工作空间。');
  return apiRequest(`/api/workspaces/${project.workspaceId}/translations/${action}`, {
    method: 'POST', body: JSON.stringify({ segmentIds, edits, requestId: requestId(`translation-${action}`) }),
  });
}

export async function saveServerAiDecision(project, translationId, changeId, decision) {
  if (!project.workspaceId) return;
  return apiRequest(`/api/workspaces/${project.workspaceId}/ai-decisions`, {
    method: 'POST',
    body: JSON.stringify({
      aiVersionId: translationId,
      changeId,
      decision,
      requestId: requestId('ai-decision'),
    }),
  });
}
