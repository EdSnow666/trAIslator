/**
 * 职责: 生成本地模拟 AI 译后编辑提案并解析逐项接受或拒绝结果
 * 依赖内部: diff-engine.js
 * 依赖外部: 无
 * 暴露: createMockAiPostEdit | getAiPostEditParts | resolveAiPostEdit
 */

import { buildDiff } from './diff-engine.js';

const ZH_REPLACEMENTS = [
  [/为了(?=.{0,16}[，。；])/g, '为'],
  [/进行了/g, '开展了'],
  [/进行/g, '开展'],
  [/能够/g, '可'],
  [/可以/g, '可'],
  [/成为了/g, '成为'],
  [/加入了/g, '加入'],
  [/针对于/g, '针对'],
];

const EN_REPLACEMENTS = [
  [/\bin order to\b/gi, 'to'],
  [/\bis able to\b/gi, 'can'],
  [/\bare able to\b/gi, 'can'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bit is important to note that\s*/gi, ''],
  [/\bin the event that\b/gi, 'if'],
];

function applyReplacements(text, replacements) {
  return replacements.reduce((result, [pattern, replacement]) => (
    result.replace(pattern, replacement)
  ), text);
}

function fallbackRevision(text, direction) {
  const isChinese = direction?.startsWith('EN');
  const marker = isChinese ? '，' : ',';
  const replacement = isChinese ? '；' : ';';
  const minimumLength = isChinese ? 42 : 90;
  if (text.length < minimumLength || !text.includes(marker)) return text;
  return text.replace(marker, replacement);
}

function reviseText(text, direction) {
  const replacements = direction?.startsWith('EN') ? ZH_REPLACEMENTS : EN_REPLACEMENTS;
  const revised = applyReplacements(text, replacements);
  return revised === text ? fallbackRevision(text, direction) : revised;
}

export function createMockAiPostEdit(baseText, direction, prompt, createdAt) {
  return {
    status: 'pending',
    baseText,
    proposedText: reviseText(baseText, direction),
    promptId: prompt.id,
    promptLabel: prompt.displayLabel || `v${prompt.version}`,
    promptTitle: prompt.title,
    promptSnapshot: prompt.content,
    model: 'Mock-PostEditor 1.0',
    createdAt,
    decisions: {},
    resultText: null,
  };
}

export function getAiPostEditParts(aiPostEdit, direction) {
  let changeIndex = 0;
  const language = direction?.startsWith('EN') ? 'zh' : 'en';
  return buildDiff(aiPostEdit.baseText, aiPostEdit.proposedText, language).map((part) => {
    if (part.type === 'same') return part;
    changeIndex += 1;
    const changeId = `change-${changeIndex}`;
    return { ...part, changeId, decision: aiPostEdit.decisions[changeId] || 'pending' };
  });
}

function includePart(part, acceptUndecided) {
  if (part.type === 'same') return true;
  if (part.type === 'added') return part.decision === 'accepted'
    || (part.decision === 'pending' && acceptUndecided);
  return part.decision === 'rejected'
    || (part.decision === 'pending' && !acceptUndecided);
}

export function resolveAiPostEdit(aiPostEdit, direction, acceptUndecided = false) {
  return getAiPostEditParts(aiPostEdit, direction)
    .filter((part) => includePart(part, acceptUndecided))
    .map((part) => part.value).join('');
}