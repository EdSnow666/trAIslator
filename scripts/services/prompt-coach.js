/**
 * 职责: 基于现有 T2 AI 原译与人工译后编辑 Diff 提炼句子结构 Prompt 规则
 * 依赖内部: diff-engine.js
 * 依赖外部: 无
 * 暴露: analyzePromptCoach | buildPromptRuleAppendix | buildPromptCoachArtifact
 */

import { buildDiff } from './diff-engine.js';

const SENTENCE_END = /[。！？!?]+/;
const CLAUSE_MARK = /[，；：,;:]/g;
const PASSIVE_MARK = /被|由.{1,18}(?:发起|开发|实施|创建)|项目通过.{1,22}开展|地点设在/g;
const VAGUE_REFERENCE = /(?:^|[。！？])(?:该项目|该活动|这一方法|后者|这项工作)/g;
const SYNTACTIC_BURDEN = /进行|开展|实施|予以|加以|得以|能够|可以|旨在|从而|以期|使得|有助于/g;
const STRUCTURAL_TOKEN = /[。！？；：，]|尽管|但是|然而|此外|为此|因此|同时|与此同时|随后|最终|旨在|通过|从而|并|而|被|由|作为|其中|该项目|该活动|这一方法|后者/g;

function cleanText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function countMatches(text, pattern) {
  return (cleanText(text).match(pattern) || []).length;
}

function sentenceCount(text) {
  return cleanText(text).split(SENTENCE_END).filter(Boolean).length;
}

function structuralStats(text) {
  return {
    sentenceCount: sentenceCount(text),
    clauseCount: countMatches(text, CLAUSE_MARK),
    passiveCount: countMatches(text, PASSIVE_MARK),
    vagueReferenceCount: countMatches(text, VAGUE_REFERENCE),
    burdenCount: countMatches(text, SYNTACTIC_BURDEN),
  };
}

function getT2Samples(project) {
  return project.segments.map((segment, index) => buildSample(segment, index))
    .filter((item) => item.ai && item.edited && item.ai !== item.edited);
}

function buildSample(segment, index) {
  const translation = segment.translations[1];
  const pair = humanLearningPair(translation);
  return {
    id: segment.id,
    label: segment.unit || `句段 ${index + 1}`,
    ai: pair.ai,
    edited: pair.edited,
    diff: pair.ai && pair.edited ? buildDiff(pair.ai, pair.edited, 'zh') : [],
  };
}

function humanLearningPair(translation) {
  const aiEdit = translation?.aiPostEdit;
  if (aiEdit?.status === 'applied' && !aiEdit.humanContinuedAt) return { ai: '', edited: '' };
  const ai = aiEdit?.humanContinuedAt ? aiEdit.resultText : translation?.aiText;
  return {
    ai: cleanText(ai),
    edited: cleanText(translation?.postEditText || translation?.draftText),
  };
}

function changedStructureCount(sample) {
  return sample.diff.filter((part) => part.type !== 'same')
    .reduce((total, part) => total + countMatches(part.value, STRUCTURAL_TOKEN), 0);
}

function makeRule(id, title, instruction, samples, signal) {
  if (!samples.length) return null;
  const evidence = samples.slice(0, 3).map((item) => ({
    segmentId: item.id,
    label: item.label,
    signal,
    aiText: item.ai,
    postEditText: item.edited,
    diff: item.diff,
  }));
  return { id, title, instruction, evidence };
}

function boundaryRule(samples) {
  const hits = samples.filter((item) => sentenceCount(item.edited) !== sentenceCount(item.ai));
  return makeRule('focus-boundary', '按信息焦点重设句界', '只在主体、行动或结果焦点改变时拆句；同一动作链不要机械拆碎，竞争焦点也不要挤在一个长句中。', hits, '人工编辑改变了句子边界');
}

function predicateRule(samples) {
  const hits = samples.filter((item) => structuralStats(item.edited).burdenCount < structuralStats(item.ai).burdenCount);
  return makeRule('predicate-core', '压缩功能性谓语链', '每个分句保留一个核心动作，减少“进行、开展、能够、旨在、从而”等多层功能性谓语的套叠。', hits, '人工编辑减少了功能性谓语');
}

function activeRule(samples) {
  const hits = samples.filter((item) => structuralStats(item.edited).passiveCount < structuralStats(item.ai).passiveCount);
  return makeRule('active-agent', '让真实行动者进入主干', '原文已给出行动者时，以“谁做什么”组织主干；避免“项目通过……开展”“地点设在……”等被动或静态承载句。', hits, '人工编辑减少了被动或静态主干');
}

function referenceRule(samples) {
  const hits = samples.filter((item) => structuralStats(item.edited).vagueReferenceCount < structuralStats(item.ai).vagueReferenceCount);
  return makeRule('explicit-reference', '让跨句回指落到具体对象', '相邻句出现多个候选对象时，不以“该项目、该活动、这一方法、后者”裸接新句；重复最短且唯一的对象名称。', hits, '人工编辑减少了悬空回指');
}

function logicRule(samples) {
  const hits = samples.filter((item) => {
    const clauseDelta = Math.abs(structuralStats(item.edited).clauseCount - structuralStats(item.ai).clauseCount);
    return clauseDelta >= 2 || changedStructureCount(item) >= 3;
  });
  return makeRule('logic-layers', '把方式、目的与结果分层', '先写主体和核心行动，再安置方式、目的与结果；不同逻辑角色不要只靠连续逗号或连接词串接。', hits, 'Diff 显示逻辑标记或分句层级被重组');
}

function attributionPosition(text) {
  const verb = '(?:说道?|称|表示|指出|警告(?:称)?|警示(?:道)?|补充(?:说|道)?)';
  const before = new RegExp(`${verb}[：:]?[“"]`).test(text);
  const after = new RegExp(`[”"](?:，|,)?[^。！？]{0,24}${verb}`).test(text);
  return before ? 'before' : after ? 'after' : 'none';
}

function quoteRule(samples) {
  const hits = samples.filter((item) => attributionPosition(item.ai) !== attributionPosition(item.edited));
  return makeRule('quote-attribution', '先固定说话者，再展开引语', '新闻引语优先采用“说话者及身份＋说/警告/补充＋引语”；连续引语不得丢失归属，也不要把归属悬在长引语之后。', hits, '人工编辑调整了引语与归属的位置');
}

function inferRules(samples) {
  return [boundaryRule, predicateRule, activeRule, logicRule, quoteRule, referenceRule]
    .map((rule) => rule(samples)).filter(Boolean).slice(0, 5);
}

export function analyzePromptCoach(project) {
  const samples = getT2Samples(project);
  return {
    totalCount: project.segments.filter((segment) => segment.translations[1]).length,
    editedCount: samples.length,
    rules: inferRules(samples),
  };
}

export function buildPromptRuleAppendix(rules) {
  const lines = rules.map((rule, index) => `${index + 1}. ${rule.instruction}`);
  return `## 根据 T2 译后编辑新增的句子结构规则\n\n${lines.join('\n')}`;
}
export function buildPromptCoachArtifact(project) {
  const analysis = analyzePromptCoach(project);
  const prompt = project.prompts.find((item) => item.id === project.activePromptId);
  return {
    schema: 'translation-aiducator.prompt-coach.v1',
    generatedAt: new Date().toISOString(),
    analysisMode: 'local-diff-no-api',
    focus: 'sentence-structure',
    ignored: ['terminology'],
    project: { id: project.id, name: project.name, direction: project.direction },
    prompt: prompt ? { id: prompt.id, label: prompt.displayLabel || `v${prompt.version}`, title: prompt.title } : null,
    summary: { totalT2: analysis.totalCount, editedT2: analysis.editedCount, ruleCount: analysis.rules.length },
    rules: analysis.rules,
  };
}