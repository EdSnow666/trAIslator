/**
 * 职责: 加载/创建服务器项目，并持久化任务书、Prompt、译后编辑、当前版本和 AI 修改决策
 * 依赖内部: ./auth-client.js, ./ai-post-edit.js
 * 依赖外部: Fetch API, Web Crypto API
 * 暴露: 项目创建与资源目录、项目快照、Prompt 协作、译后编辑、版本选择、AI 决策与真实 AI 执行
 */

import { resolveAiPostEdit } from './ai-post-edit.js?v=20260804-01';
import { apiRequest } from './auth-client.js?v=20260805-02';

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
    canManage: projectInfo.canManage,
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

export async function generateServerBrief(projectId) {
  return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/brief/generate`, {
    method: 'POST', body: '{}',
  });
}

export async function generateServerPrompt(projectId) {
  return apiRequest(`/api/projects/${encodeURIComponent(projectId)}/prompt/generate`, {
    method: 'POST', body: '{}',
  });
}

export async function createServerPrompt(project, input) {
  const parent = input.basePrompt ? {
    ...(input.basePrompt.isOwnedByCurrentUser ? { lineageId: input.basePrompt.lineageId } : {}),
    parentVersionId: input.basePrompt.id,
  } : {};
  const result = await apiRequest(`/api/projects/${encodeURIComponent(project.id)}/prompts`, {
    method: 'POST',
    body: JSON.stringify({
      ...parent,
      title: input.title,
      note: input.note,
      content: input.content,
      sourceType: 'human',
      requestId: requestId('prompt-save'),
    }),
  });
  return result.id;
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

export async function selectServerPrompt(project, promptId) {
  if (!project.workspaceId) throw new Error('当前项目没有可编辑的个人工作空间。');
  return apiRequest(`/api/workspaces/${project.workspaceId}/active-prompt`, {
    method: 'POST',
    body: JSON.stringify({
      promptVersionId: promptId,
      requestId: requestId('prompt-activate'),
    }),
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

export async function runServerAiTranslation(project, segment, kind, promptId, baseVersionId) {
  if (!project.workspaceId) throw new Error('当前项目没有可运行 AI 任务的个人工作空间。');
  const result = await apiRequest(`/api/workspaces/${project.workspaceId}/ai/execute`, {
    method: 'POST',
    body: JSON.stringify({ segmentId: segment.id, promptVersionId: promptId,
      baseVersionId: baseVersionId || undefined, kind, requestId: requestId(kind) }),
  });
  return result.translationVersionId;
}
export async function saveServerPostEdit(project, segment, translation, content) {
  if (!project.workspaceId) throw new Error('当前项目为只读模板，请先发布并分配项目。');
  const version = await materializeAiEdit(project, segment, translation);
  const result = await apiRequest(`/api/workspaces/${project.workspaceId}/post-edits`, {
    method: 'POST',
    body: JSON.stringify({
      segmentId: segment.id,
      content: content.trim(),
      parentVersionId: version.parentId,
      baseVersionId: version.baseId,
      promptVersionId: translation.promptId || undefined,
      requestId: requestId('human-post-edit'),
    }),
  });
  return result.id;
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
