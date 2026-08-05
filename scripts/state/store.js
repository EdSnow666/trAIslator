/**
 * 职责: 管理本地 Demo 或服务器项目快照的前端状态
 * 依赖内部: ../data/demo-projects.js, ../services/ai-post-edit.js
 * 依赖外部: 浏览器 localStorage
 * 暴露: store
 */

import { createDemoProjects } from '../data/demo-projects.js?v=20260804-01';
import { createMockAiPostEdit, getAiPostEditParts, resolveAiPostEdit } from '../services/ai-post-edit.js?v=20260804-01';

const STORAGE_KEY = 'translation-aiducator-demo-v1';
const listeners = new Set();
const aiPostEditDrafts = new Map();
const AI_EXAMPLE_PROJECT_IDS = new Set(['demo-en-zh', 'demo-zh-en']);
const BUNDLED_VERSION_PROJECT_IDS = new Set(['a24-s1-sr1-20260803']);

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
  const demos = createDemoProjects();
  const missing = demos.filter((demo) => !saved.projects.some((project) => project.id === demo.id));
  const projects = orderProjects([...saved.projects, ...missing]);
  mergeAiPostEditExamples(projects, demos);
  mergeBundledProjectVersions(projects, demos);
  normalizeAiPostEditStates(projects);
  const project = projects.find((item) => item.id === saved.currentProjectId);
  const segment = project?.segments.find((item) => item.id === saved.currentSegmentId);
  const detailTranslationId = saved.detailTranslationId || segment?.currentTranslationId || null;
  return {
    ...saved, projects, detailTranslationId,
    serverMode: false,
    diffMode: Boolean(saved.diffMode),
    allVersionsMode: Boolean(saved.allVersionsMode),
    aiPostEditVisible: saved.aiPostEditVisible !== false,
  };
}

function orderProjects(projects) {
  const priority = new Map([['demo-en-zh', 0], ['demo-zh-en', 1]]);
  return projects.map((project, index) => ({ project, index }))
    .sort((left, right) => (priority.get(left.project.id) ?? left.index + 2)
      - (priority.get(right.project.id) ?? right.index + 2))
    .map((item) => item.project);
}

function mergeAiPostEditExamples(projects, demos) {
  demos.filter((demo) => AI_EXAMPLE_PROJECT_IDS.has(demo.id))
    .forEach((demo) => mergeProjectExamples(projects, demo));
}

function mergeProjectExamples(projects, demo) {
  const project = projects.find((item) => item.id === demo.id);
  if (!project) return;
  demo.segments.forEach((segment) => mergeSegmentExample(project, segment));
}

function mergeSegmentExample(project, demoSegment) {
  const example = demoSegment.translations.find((item) => item.aiPostEdit);
  if (!example) return;
  const segment = project.segments.find((item) => item.id === demoSegment.id);
  const translationItem = segment?.translations.find((item) => item.id === example.id);
  if (!translationItem || translationItem.aiPostEdit) return;
  translationItem.aiPostEdit = structuredClone(example.aiPostEdit);
  if (segment.currentTranslationId === translationItem.id && !translationItem.postEditText) segment.status = 'ai-edited';
}

function mergeBundledProjectVersions(projects, demos) {
  demos.filter((demo) => BUNDLED_VERSION_PROJECT_IDS.has(demo.id)).forEach((demo) => {
    const project = projects.find((item) => item.id === demo.id);
    if (!project) return;
    demo.segments.forEach((demoSegment) => mergeBundledSegment(project, demoSegment));
  });
}

function mergeBundledSegment(project, demoSegment) {
  const segment = project.segments.find((item) => item.id === demoSegment.id);
  if (!segment) return;
  demoSegment.translations.forEach((translation) => {
    const exists = segment.translations.some((item) => item.id === translation.id);
    if (!exists) segment.translations.push(structuredClone(translation));
  });
}
function normalizeAiPostEditStates(projects) {
  projects.forEach((project) => project.segments.forEach((segment) => {
    segment.translations.forEach((translation) => {
      const edit = translation.aiPostEdit;
      if (edit?.status !== 'superseded' || edit.resultText != null) return;
      edit.status = 'pending';
      delete edit.supersededAt;
    });
  }));
}
function createInitialState() {
  const projects = createDemoProjects();
  const segment = preferredSegment(projects[0]);
  return {
    projects,
    currentProjectId: projects[0].id,
    currentSegmentId: segment.id,
    detailTranslationId: segment.currentTranslationId,
    role: 'student',
    serverMode: false,
    rightTab: 'prompt',
    diffMode: false,
    allVersionsMode: false,
    aiPostEditVisible: true,
    apiConfig: { baseUrl: '', model: '', apiKey: '' },
  };
}

function preferredSegment(project) {
  return project.segments.find((segment) => segment.status === 'ai-edited') || project.segments[0];
}

let state = loadState();

function persist() {
  if (state.serverMode) return;
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

function setServerProjects(projects) {
  const selected = projects.find((project) => project.id === state.currentProjectId) || projects[0];
  const segment = preferredSegment(selected);
  state = {
    ...state,
    projects,
    serverMode: true,
    currentProjectId: selected.id,
    currentSegmentId: segment?.id || null,
    detailTranslationId: segment?.currentTranslationId || null,
  };
  aiPostEditDrafts.clear();
  emit();
}

function replaceServerProject(project) {
  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index < 0) return;
  state.projects[index] = project;
  if (state.currentProjectId === project.id) {
    const segment = project.segments.find((item) => item.id === state.currentSegmentId)
      || preferredSegment(project);
    state.currentSegmentId = segment?.id || null;
    state.detailTranslationId = segment?.currentTranslationId || null;
  }
  aiPostEditDrafts.clear();
  emit();
}

function selectProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  const segment = preferredSegment(project);
  state.currentProjectId = projectId;
  state.currentSegmentId = segment?.id || null;
  state.detailTranslationId = segment?.currentTranslationId || null;
  emit();
}

function selectSegment(segmentId) {
  state.currentSegmentId = segmentId;
  state.detailTranslationId = getSegment(segmentId)?.currentTranslationId || null;
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

function setAllVersionsMode(enabled) {
  state.allVersionsMode = enabled;
  emit();
}

function setAiPostEditVisible(enabled) {
  state.aiPostEditVisible = enabled;
  emit();
}

function getAiPostEditDraft(segmentId) {
  return aiPostEditDrafts.get(segmentId) || null;
}

function beginAiPostEditDraft(segmentId) {
  const project = getProject();
  const segment = getSegment(segmentId);
  const translation = getCurrentTranslation(segment);
  const edit = translation?.aiPostEdit;
  if (!edit) return null;
  const existing = aiPostEditDrafts.get(segmentId);
  if (existing?.translationId === translation.id) {
    existing.active = true;
    emit();
    return existing.text;
  }
  const text = edit.status === 'pending'
    ? resolveAiPostEdit(edit, project.direction, true)
    : translation.postEditText || edit.resultText || resolveAiPostEdit(edit, project.direction, true);
  aiPostEditDrafts.set(segmentId, {
    translationId: translation.id, initialText: text, text, active: true,
  });
  state.currentSegmentId = segmentId;
  emit();
  return text;
}

function updateAiPostEditDraft(segmentId, text) {
  const draft = aiPostEditDrafts.get(segmentId);
  if (draft) draft.text = text;
}

function pauseAiPostEditDraft(segmentId) {
  const draft = aiPostEditDrafts.get(segmentId);
  if (!draft?.active) return;
  draft.active = false;
  emit();
}
function setActivePrompt(promptId) {
  const project = getProject();
  if (!project?.prompts.some((prompt) => prompt.id === promptId)) return;
  project.activePromptId = promptId;
  emit();
}

function savePromptVersion({ title, note, content, parentPromptId }) {
  const project = getProject();
  const version = Math.max(...project.prompts.map((prompt) => prompt.version), 0) + 1;
  const prompt = createPrompt(project, version, title, note, content, parentPromptId);
  project.prompts.push(prompt);
  project.activePromptId = prompt.id;
  emit();
  return prompt;
}

function createPrompt(project, version, title, note, content, parentPromptId) {
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
    parentPromptId: parentPromptId || project.activePromptId || null,
  };
}

function savePostEdit(segmentId, text) {
  const segment = getSegment(segmentId);
  const current = getCurrentTranslation(segment);
  if (!current) return;
  const draft = aiPostEditDrafts.get(segmentId) || null;
  aiPostEditDrafts.delete(segmentId);
  const savedText = text.trim();
  const editedAt = formatNow();
  current.postEditText = savedText;
  current.author = state.role === 'teacher' ? '林老师' : '当前学生';
  current.editedAt = editedAt;
  segment.status = postEditStatus(current, savedText, editedAt, draft);
  emit();
}

function postEditStatus(translation, text, editedAt, draft) {
  const aiEdit = translation.aiPostEdit;
  if (!aiEdit) return text ? 'edited' : 'translated';
  if (aiEdit.status === 'pending' && !draft) {
    aiEdit.humanEditedAt = editedAt;
    return text ? 'edited' : 'translated';
  }
  if (aiEdit.status === 'pending') return applyAiDraftStatus(aiEdit, draft, text, editedAt);
  const continued = aiEdit.status === 'applied' && text !== aiEdit.resultText;
  if (continued) aiEdit.humanContinuedAt = editedAt;
  return continued ? 'edited' : 'ai-edited';
}

function applyAiDraftStatus(aiEdit, draft, text, editedAt) {
  aiEdit.status = 'applied';
  aiEdit.resultText = draft.initialText;
  aiEdit.appliedAt = editedAt;
  aiEdit.appliedBy = state.role === 'teacher' ? '林老师' : '当前学生';
  const continued = text !== draft.initialText;
  if (continued) aiEdit.humanContinuedAt = editedAt;
  return continued ? 'edited' : 'ai-edited';
}

function getCurrentTranslation(segment = getSegment()) {
  return segment?.translations.find((item) => item.id === segment.currentTranslationId);
}

function getDetailTranslation(segment = getSegment()) {
  return segment?.translations.find((item) => item.id === state.detailTranslationId) || getCurrentTranslation(segment);
}

function selectTranslationDetails(segmentId, translationId) {
  state.currentSegmentId = segmentId;
  state.detailTranslationId = translationId;
  state.rightTab = 'prompt';
  emit();
}

function setCurrentTranslation(segmentId, translationId) {
  const segment = getSegment(segmentId);
  if (!segment?.translations.some((item) => item.id === translationId)) return;
  segment.currentTranslationId = translationId;
  state.currentSegmentId = segmentId;
  state.detailTranslationId = translationId;
  state.rightTab = 'prompt';
  emit();
}

function discardAiPostEdit(segmentId, translationId) {
  const segment = getSegment(segmentId);
  const translation = segment?.translations.find((item) => item.id === translationId);
  const edit = translation?.aiPostEdit;
  if (!segment || !translation || !edit) return false;
  aiPostEditDrafts.delete(segmentId);
  restorePreAiPostEdit(translation, edit);
  delete translation.aiPostEdit;
  segment.currentTranslationId = translationId;
  segment.status = translation.postEditText ? 'edited' : 'translated';
  state.currentSegmentId = segmentId;
  state.detailTranslationId = translationId;
  emit();
  return true;
}

function restorePreAiPostEdit(translation, edit) {
  const inferredText = edit.baseText === translation.aiText ? '' : edit.baseText;
  translation.postEditText = edit.basePostEditText ?? inferredText;
  if (!translation.postEditText) delete translation.editedAt;
  if (edit.baseAuthor) translation.author = edit.baseAuthor;
}
function generateMock(segmentIds) {
  const project = getProject();
  const prompt = getPrompt(project.activePromptId);
  segmentIds.forEach((segmentId) => appendMockTranslation(project, segmentId, prompt));
  state.detailTranslationId = getCurrentTranslation()?.id || state.detailTranslationId;
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

function generateAiPostEdit(segmentId, promptId = '') {
  const project = getProject();
  const segment = getSegment(segmentId);
  const translation = getCurrentTranslation(segment);
  const prompt = getPrompt(promptId || project.activePromptId);
  if (!translation || !prompt || translation.origin === 'manual') return null;
  aiPostEditDrafts.delete(segmentId);
  const baseText = translation.postEditText || translation.aiText || '';
  const proposal = createMockAiPostEdit(baseText, project.direction, prompt, formatNow());
  proposal.basePostEditText = translation.postEditText || '';
  proposal.baseAuthor = translation.author;
  if (!baseText || proposal.proposedText === baseText) return null;
  translation.aiPostEdit = proposal;
  state.aiPostEditVisible = true;
  segment.status = 'ai-edited';
  state.currentSegmentId = segment.id;
  state.detailTranslationId = translation.id;
  emit();
  return proposal;
}

function decideAiPostEdit(segmentId, changeId, decision) {
  const edit = getCurrentTranslation(getSegment(segmentId))?.aiPostEdit;
  if (!edit || !['accepted', 'rejected'].includes(decision)) return;
  edit.decisions[changeId] = decision;
  emit();
}

function acceptPendingDecisions(edit, direction) {
  getAiPostEditParts(edit, direction).forEach((part) => {
    if (part.changeId && !edit.decisions[part.changeId]) edit.decisions[part.changeId] = 'accepted';
  });
}

function applyAiPostEdit(segmentId, acceptPending = false) {
  aiPostEditDrafts.delete(segmentId);
  const project = getProject();
  const segment = getSegment(segmentId);
  const translation = getCurrentTranslation(segment);
  const edit = translation?.aiPostEdit;
  if (!edit || edit.status !== 'pending') return null;
  if (acceptPending) acceptPendingDecisions(edit, project.direction);
  const resultText = resolveAiPostEdit(edit, project.direction, acceptPending);
  edit.status = 'applied';
  edit.resultText = resultText;
  edit.appliedAt = formatNow();
  edit.appliedBy = state.role === 'teacher' ? '林老师' : '当前学生';
  translation.postEditText = resultText;
  segment.status = 'ai-edited';
  emit();
  return resultText;
}
function addImportedProject(project) {
  state.projects.push(project);
  state.currentProjectId = project.id;
  state.currentSegmentId = project.segments[0]?.id || null;
  state.detailTranslationId = project.segments[0]?.currentTranslationId || null;
  emit();
}

function saveApiConfig(config) {
  state.apiConfig = { ...config };
  emit();
}

function saveBrief(content) {
  const project = getProject();
  if (!project) return;
  project.brief = { ...content };
  project.briefVersionId = `brief-local-${Date.now()}`;
  emit();
}

function reset() {
  aiPostEditDrafts.clear();
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
  getDetailTranslation,
  selectTranslationDetails,
  setCurrentTranslation,
  discardAiPostEdit,
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  setServerProjects,
  replaceServerProject,
  selectProject,
  selectSegment,
  setRole,
  setRightTab,
  setDiffMode,
  setAllVersionsMode,
  setAiPostEditVisible,
  getAiPostEditDraft,
  beginAiPostEditDraft,
  updateAiPostEditDraft,
  pauseAiPostEditDraft,
  setActivePrompt,
  savePromptVersion,
  savePostEdit,
  generateAiPostEdit,
  decideAiPostEdit,
  applyAiPostEdit,
  generateMock,
  addImportedProject,
  saveBrief,
  saveApiConfig,
  reset,
};
