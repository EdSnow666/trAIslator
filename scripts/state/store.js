/**
 * 职责: 管理项目、句段、Prompt 与译文版本的浏览器本地状态
 * 依赖内部: ../data/demo-projects.js
 * 依赖外部: 浏览器 localStorage
 * 暴露: store
 */

import { createDemoProjects } from '../data/demo-projects.js';

const STORAGE_KEY = 'translation-aiducator-demo-v1';
const listeners = new Set();

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeState(JSON.parse(saved));
  } catch (error) {
    console.warn('无法读取本地项目，已加载演示数据。', error);
  }
  return createInitialState();
}

function normalizeState(saved) {
  return { ...saved, diffMode: Boolean(saved.diffMode) };
}

function createInitialState() {
  const projects = createDemoProjects();
  return {
    projects,
    currentProjectId: projects[0].id,
    currentSegmentId: projects[0].segments[0].id,
    role: 'student',
    rightTab: 'prompt',
    diffMode: false,
    apiConfig: { baseUrl: '', model: '', apiKey: '' },
  };
}

let state = loadState();

function persist() {
  const safeState = structuredClone(state);
  safeState.apiConfig.apiKey = '';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
}

function emit() {
  persist();
  listeners.forEach((listener) => listener(state));
}

function getProject() {
  return state.projects.find((project) => project.id === state.currentProjectId);
}

function getSegment(segmentId = state.currentSegmentId) {
  return getProject()?.segments.find((segment) => segment.id === segmentId);
}

function getPrompt(promptId) {
  return getProject()?.prompts.find((prompt) => prompt.id === promptId);
}

function selectProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  state.currentProjectId = projectId;
  state.currentSegmentId = project.segments[0]?.id || null;
  emit();
}

function selectSegment(segmentId) {
  state.currentSegmentId = segmentId;
  state.rightTab = 'prompt';
  emit();
}

function setRole(role) {
  state.role = role;
  emit();
}

function setRightTab(tab) {
  state.rightTab = tab;
  emit();
}

function setDiffMode(enabled) {
  state.diffMode = enabled;
  emit();
}

function setActivePrompt(promptId) {
  const project = getProject();
  if (!project?.prompts.some((prompt) => prompt.id === promptId)) return;
  project.activePromptId = promptId;
  emit();
}

function savePromptVersion({ title, note, content }) {
  const project = getProject();
  const version = Math.max(...project.prompts.map((prompt) => prompt.version), 0) + 1;
  const prompt = createPrompt(project, version, title, note, content);
  project.prompts.push(prompt);
  project.activePromptId = prompt.id;
  emit();
  return prompt;
}

function createPrompt(project, version, title, note, content) {
  return {
    id: `p-${project.id}-${Date.now()}`,
    version,
    title: title || `共创 Prompt v${version}`,
    author: state.role === 'teacher' ? '林老师' : '当前学生',
    role: state.role === 'teacher' ? '教师' : '学生',
    status: 'published',
    createdAt: formatNow(),
    note: note || '基于课堂讨论创建的新版本。',
    content,
  };
}

function savePostEdit(segmentId, text) {
  const segment = getSegment(segmentId);
  const current = getCurrentTranslation(segment);
  if (!current) return;
  current.postEditText = text.trim();
  current.author = state.role === 'teacher' ? '林老师' : '当前学生';
  current.editedAt = formatNow();
  segment.status = current.postEditText ? 'edited' : 'translated';
  emit();
}

function getCurrentTranslation(segment = getSegment()) {
  return segment?.translations.find((item) => item.id === segment.currentTranslationId);
}

function setCurrentTranslation(segmentId, translationId) {
  const segment = getSegment(segmentId);
  if (!segment?.translations.some((item) => item.id === translationId)) return;
  segment.currentTranslationId = translationId;
  state.currentSegmentId = segmentId;
  state.rightTab = 'prompt';
  emit();
}

function generateMock(segmentIds) {
  const project = getProject();
  const prompt = getPrompt(project.activePromptId);
  segmentIds.forEach((segmentId) => appendMockTranslation(project, segmentId, prompt));
  emit();
}

function appendMockTranslation(project, segmentId, prompt) {
  const segment = project.segments.find((item) => item.id === segmentId);
  if (!segment) return;
  const aiText = chooseMockText(project, segment, prompt);
  const item = {
    id: `${segment.id}-t${segment.translations.length + 1}-${Date.now()}`,
    promptId: prompt.id,
    promptSnapshot: prompt.content,
    aiText,
    postEditText: '',
    author: '模拟引擎',
    model: 'Mock-Translator 1.0',
    createdAt: formatNow(),
    contextSnapshot: '术语命中 + 相邻句段 + 项目翻译任务书',
  };
  segment.translations.push(item);
  segment.currentTranslationId = item.id;
  segment.status = 'translated';
}

function chooseMockText(project, segment, prompt) {
  const seeded = [...segment.translations].reverse().find((item) => item.promptId === prompt.id);
  if (seeded) return seeded.aiText;
  const current = getCurrentTranslation(segment);
  const base = current?.postEditText || current?.aiText || segment.source;
  return styleVariant(project.direction, base, prompt.version);
}

function styleVariant(direction, text, version) {
  const replacements = direction === 'EN → ZH'
    ? [['然而', '不过'], ['本展厅', '这个展厅'], ['并非', '不是']]
    : [['This article', 'This study'], ['therefore', 'thus'], ['is not', 'is no longer']];
  let revised = text;
  replacements.forEach(([from, to]) => { revised = revised.replace(from, to); });
  return revised === text ? `${text} [模拟重译 v${version}]` : revised;
}

function addImportedProject(project) {
  state.projects.push(project);
  state.currentProjectId = project.id;
  state.currentSegmentId = project.segments[0]?.id || null;
  emit();
}

function saveApiConfig(config) {
  state.apiConfig = { ...config };
  emit();
}

function reset() {
  state = createInitialState();
  emit();
}

function formatNow() {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date()).replaceAll('/', '-');
}

export const store = {
  getState: () => state,
  getProject,
  getSegment,
  getPrompt,
  getCurrentTranslation,
  setCurrentTranslation,
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  selectProject,
  selectSegment,
  setRole,
  setRightTab,
  setDiffMode,
  setActivePrompt,
  savePromptVersion,
  savePostEdit,
  generateMock,
  addImportedProject,
  saveApiConfig,
  reset,
};
