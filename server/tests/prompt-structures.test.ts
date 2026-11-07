/**
 * 职责: 验证任务书进入翻译上下文并校验项目资源生成语言指令
 * 依赖内部: ../src/modules/prompt-structures.ts
 * 依赖外部: node:assert, node:test
 * 暴露: Prompt 结构单元测试
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { TRANSLATION_SYSTEM, FULL_POST_EDIT_SYSTEM, generationInstruction, translationMessages, fullTranslationMessages }
  from '../src/modules/prompt-structures.js';
import { BRIEF_SYSTEM, PROMPT_GENERATION_SYSTEM, briefPayload, promptGenerationPayload } from '../src/modules/prompt-structures.js';
import { generatedBrief, generatedPrompt } from '../src/modules/project-resources.js';

test('任务书与 Prompt 生成分工明确，语言方向独立于输出语言', () => {
  assert.match(BRIEF_SYSTEM, /not instructions addressed to an AI translator/);
  assert.match(BRIEF_SYSTEM, /genre, skopos, audience, register, strategy/);
  assert.match(PROMPT_GENERATION_SYSTEM, /specification to operationalize/);
  assert.match(PROMPT_GENERATION_SYSTEM, /source-text placeholder/);
  const languages = { sourceLanguage: 'zh-CN', targetLanguage: 'en' };
  const brief = { genre: '纪实', skopos: '传达经历', audience: '一般读者', register: '平实', strategy: '保真' };
  assert.deepEqual(briefPayload(['原文'], languages), { instruction: 'Analyze the first up to 10 source paragraphs.', ...languages, sourceParagraphs: ['原文'] });
  assert.deepEqual(promptGenerationPayload(brief, ['原文'], languages), { ...languages, brief, sourceParagraphs: ['原文'] });
  assert.deepEqual(generatedBrief(JSON.stringify(brief)), brief);
  assert.throws(() => generatedBrief('Translate the text.'), /五栏/);
  assert.throws(() => generatedBrief('{"genre":"news"}'), /五栏/);
  assert.throws(() => generatedPrompt(JSON.stringify(brief)), /未保存/);
  assert.throws(() => generatedPrompt('请翻译：[在此处输入或粘贴原文内容]'), /未保存/);
  assert.equal(generatedPrompt('Translate faithfully. Preserve attribution.'), 'Translate faithfully. Preserve attribution.');
});

test('翻译消息包含独立任务书上下文层', () => {
  const projectBrief = { genre: 'academic', audience: 'students' };
  const messages = translationMessages('ai_translation', { sourceLanguage: 'en', targetLanguage: 'zh-CN',
    source: 'Source.', currentTranslation: null, projectBrief, overarchingPrompt: 'Project prompt',
    customPrompt: 'Student prompt', terminology: [], translationMemory: [] }) as Array<{ content: string }>;
  const payload = JSON.parse(messages[1]!.content);
  assert.deepEqual(payload.projectBrief, projectBrief);
  assert.match(messages[0]!.content, /translation brief/);
});

test('任务书与全文 Prompt 可分别指定中英文输出', () => {
  assert.match(generationInstruction(TRANSLATION_SYSTEM, 'zh-CN'), /Simplified Chinese/);
  assert.match(generationInstruction(TRANSLATION_SYSTEM, 'en'), /in English/);
});

test('全文译后编辑明确对照原文并遵循任务书与用户指令，保留对齐约束', () => {
  for (const phrase of ['Compare each currentTranslation against its source', 'projectBrief',
    'overarchingPrompt', 'customPrompt', 'Do not limit editing to synonym substitution',
    'reorganize sentence structure', 'do not invent content', 'keep every segmentId unchanged']) {
    assert.ok(FULL_POST_EDIT_SYSTEM.includes(phrase), phrase);
  }
  const payload = { projectBrief: { register: '克制' }, customPrompt: '重组意群',
    segments: [{ segmentId: 's', source: 'English source', currentTranslation: '原译' }] };
  const messages = fullTranslationMessages(payload, 'ai_post_edit') as Array<{ content: string }>;
  assert.equal(messages[0]!.content, FULL_POST_EDIT_SYSTEM);
  assert.deepEqual(JSON.parse(messages[1]!.content), payload);
});
