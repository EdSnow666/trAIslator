/**
 * 职责: 验证任务书进入翻译上下文并校验项目资源生成语言指令
 * 依赖内部: ../src/modules/prompt-structures.ts
 * 依赖外部: node:assert, node:test
 * 暴露: Prompt 结构单元测试
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { TRANSLATION_SYSTEM, generationInstruction, translationMessages }
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
