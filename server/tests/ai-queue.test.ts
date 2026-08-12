/**
 * 职责: 验证统一 AI 队列位次与教师手动插队
 * 依赖内部: ../src/auth/types.ts, ../src/modules/ai-queue.ts
 * 依赖外部: node:assert, node:test
 * 暴露: AI 队列单元测试
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthUser } from '../src/auth/types.js';
import { aiQueueStatus, enqueueAiRequest, prioritizeAiRequest } from '../src/modules/ai-queue.js';

test('统一 AI 队列显示位次并允许教师手动插队', async () => {
  const student: AuthUser = { id: 'queue-student', username: 'queue-student',
    displayName: '排队学生', mustChangePassword: false, roles: ['student'] };
  const teacher: AuthUser = { id: 'queue-teacher', username: 'queue-teacher',
    displayName: '排队教师', mustChangePassword: false, roles: ['teacher'] };
  let releaseRunning = () => {};
  const running = enqueueAiRequest(student, 'queue-running', 'translation', 'model-1',
    () => new Promise<string>((resolve) => { releaseRunning = () => resolve('running'); }));
  const order: string[] = [];
  const waitingStudent = enqueueAiRequest(student, 'queue-student-waiting', 'translation', 'model-1',
    async () => { order.push('student'); return 'student'; });
  const waitingTeacher = enqueueAiRequest(teacher, 'queue-teacher-waiting', 'translation', 'model-1',
    async () => { order.push('teacher'); return 'teacher'; });
  assert.equal(aiQueueStatus(teacher, 'queue-teacher-waiting').ahead, 2);
  prioritizeAiRequest(teacher, 'queue-teacher-waiting');
  assert.equal(aiQueueStatus(teacher, 'queue-teacher-waiting').ahead, 1);
  releaseRunning();
  await Promise.all([running, waitingStudent, waitingTeacher]);
  assert.deepEqual(order, ['teacher', 'student']);
});
