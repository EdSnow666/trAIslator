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
