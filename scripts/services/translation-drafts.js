/**
 * 职责: 按项目、句段和当前译文版本缓存尚未确认的人工编辑草稿
 * 依赖内部: 无
 * 依赖外部: LocalStorage API
 * 暴露: getTranslationDraft | saveTranslationDraft | clearTranslationDraft
 */

const STORAGE_KEY = 'translation-aiducator:translation-drafts:v1';

function readDrafts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function draftKey(projectId, segmentId, versionId) {
  return `${projectId}:${segmentId}:${versionId || 'empty'}`;
}

export function getTranslationDraft(projectId, segmentId, versionId) {
  return readDrafts()[draftKey(projectId, segmentId, versionId)]?.text ?? null;
}

export function saveTranslationDraft(projectId, segmentId, versionId, text) {
  const drafts = readDrafts();
  drafts[draftKey(projectId, segmentId, versionId)] = { text, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function clearTranslationDraft(projectId, segmentId, versionId) {
  const drafts = readDrafts();
  delete drafts[draftKey(projectId, segmentId, versionId)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}
