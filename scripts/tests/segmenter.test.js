/**
 * 职责: 验证导入文本按段落切分且不会退化为按句切分
 * 依赖内部: ../services/segmenter.js
 * 依赖外部: node:assert, node:test
 * 暴露: 段落切分测试
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImportedProject, segmentParagraphs } from '../services/segmenter.js';

test('有空行时按段落切分并合并段内换行', () => {
  const paragraphs = segmentParagraphs('First sentence. Second sentence.\ncontinued line.\n\nThird paragraph.');
  assert.deepEqual(paragraphs, [
    'First sentence. Second sentence. continued line.',
    'Third paragraph.',
  ]);
});

test('没有空行时把每个显式换行视为段落边界', () => {
  assert.deepEqual(segmentParagraphs('第一段。\n第二段。'), ['第一段。', '第二段。']);
});

test('导入项目的句段数量等于段落数量', () => {
  const project = buildImportedProject('Paragraph demo', 'EN → ZH', 'One. Two.\n\nThree.');
  assert.equal(project.segments.length, 2);
  assert.equal(project.segments[0].source, 'One. Two.');
});
