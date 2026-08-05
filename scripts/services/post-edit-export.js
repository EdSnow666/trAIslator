/**
 * 职责: 将项目内全部 AI 与人工译后编辑痕迹整理为可供其他 agent 复用的 JSON 语料
 * 依赖内部: diff-engine.js
 * 依赖外部: 无
 * 暴露: buildPostEditCorpusArtifact
 */

import { buildDiff } from './diff-engine.js';

function isManualTranslation(translation) {
  return translation.origin === 'manual' || !translation.promptId;
}

function hasPostEditTrace(translation) {
  const hasHumanEdit = typeof translation.postEditText === 'string' && translation.postEditText.trim().length > 0;
  return hasHumanEdit || Boolean(translation.aiPostEdit);
}

function getDiffLanguage(project) {
  return project.direction?.startsWith('EN') ? 'zh' : 'en';
}

function buildPromptBinding(project, translation) {
  const prompt = project.prompts.find((item) => item.id === translation.promptId);
  return {
    id: translation.promptId,
    label: prompt?.displayLabel || (prompt ? `v${prompt.version}` : null),
    version: prompt?.version || null,
    title: prompt?.title || null,
    author: prompt?.author || null,
    createdAt: prompt?.createdAt || null,
    note: prompt?.note || null,
    snapshot: translation.promptSnapshot || prompt?.content || '',
  };
}

function buildDiffStats(parts) {
  return parts.reduce((stats, part) => {
    if (part.type === 'added') stats.addedCharacters += part.value.length;
    if (part.type === 'removed') stats.removedCharacters += part.value.length;
    return stats;
  }, { addedCharacters: 0, removedCharacters: 0 });
}

function buildAiPostEditTrace(project, translation) {
  const edit = translation.aiPostEdit;
  if (!edit) return null;
  return {
    status: edit.status,
    baseText: edit.baseText,
    proposedText: edit.proposedText,
    resultText: edit.resultText,
    diff: buildDiff(edit.baseText, edit.proposedText, getDiffLanguage(project)),
    decisions: edit.decisions,
    prompt: {
      id: edit.promptId, label: edit.promptLabel, title: edit.promptTitle,
      snapshot: edit.promptSnapshot,
    },
    model: edit.model,
    createdAt: edit.createdAt,
    appliedAt: edit.appliedAt || null,
    appliedBy: edit.appliedBy || null,
    humanContinuedAt: edit.humanContinuedAt || null,
    supersededAt: edit.supersededAt || null,
  };
}

function buildHumanContinuationDiff(project, translation, postEditText) {
  const edit = translation.aiPostEdit;
  if (!edit?.humanContinuedAt || !postEditText) return [];
  return buildDiff(edit.resultText, postEditText, getDiffLanguage(project));
}

function buildMetadata(segment, translation) {
  return {
    model: translation.model || null,
    generatedAt: translation.createdAt || null,
    editedAt: translation.editedAt || null,
    lastSavedBy: translation.author || null,
    contextSnapshot: translation.contextSnapshot || null,
    segmentStatus: segment.status || null,
  };
}

function buildRecord(project, segment, segmentIndex, translation, translationIndex) {
  if (isManualTranslation(translation) || !hasPostEditTrace(translation)) return null;
  const aiText = translation.aiText || '';
  const postEditText = translation.postEditText?.trim() || '';
  const diff = postEditText ? buildDiff(aiText, postEditText, getDiffLanguage(project)) : [];
  return {
    recordId: `${segment.id}:${translation.id}`,
    segmentId: segment.id,
    segmentIndex: segmentIndex + 1,
    unit: segment.unit || null,
    sourceText: segment.source || '',
    translationId: translation.id,
    translationIndex: translationIndex + 1,
    isCurrentDisplay: segment.currentTranslationId === translation.id,
    aiText,
    postEditText,
    hasChanges: Boolean(postEditText && aiText !== postEditText),
    diff,
    diffStats: buildDiffStats(diff),
    aiPostEdit: buildAiPostEditTrace(project, translation),
    humanContinuationDiff: buildHumanContinuationDiff(project, translation, postEditText),
    prompt: buildPromptBinding(project, translation),
    metadata: buildMetadata(segment, translation),
  };
}

function collectRecords(project) {
  return project.segments.flatMap((segment, segmentIndex) => segment.translations
    .map((translation, translationIndex) => buildRecord(
      project, segment, segmentIndex, translation, translationIndex,
    ))
    .filter(Boolean));
}

function countTranslationVersions(project) {
  return project.segments.reduce((total, segment) => total + segment.translations.length, 0);
}

export function buildPostEditCorpusArtifact(project) {
  const records = collectRecords(project);
  return {
    schema: 'translation-aiducator.post-edit-corpus.v1',
    generatedAt: new Date().toISOString(),
    purpose: 'handoff-to-other-agents',
    scope: 'all-ai-and-human-post-edit-traces-in-current-project',
    project: {
      id: project.id,
      name: project.name,
      direction: project.direction,
      sourceLang: project.sourceLang,
      targetLang: project.targetLang,
      brief: project.brief,
    },
    summary: {
      segmentCount: project.segments.length,
      translationVersionCount: countTranslationVersions(project),
      traceRecordCount: records.length,
      savedPostEditCount: records.filter((item) => item.postEditText).length,
      aiPostEditCount: records.filter((item) => item.aiPostEdit).length,
      changedPostEditCount: records.filter((item) => item.hasChanges).length,
    },
    records,
  };
}