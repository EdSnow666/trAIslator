/**
 * 职责: 验证教练 Prompt 独立保存、账号隔离、基于 Diff 生成与草稿确认
 * 依赖内部: 无
 * 依赖外部: node:assert, fastify
 * 暴露: exerciseCoachInstruction
 */

import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

interface Sessions { student: { cookie: string }; teacher: { cookie: string } }

export async function exerciseCoachInstruction(app: FastifyInstance, sessions: Sessions,
  projectId: string): Promise<void> {
  const headers = { cookie: sessions.student.cookie };
  const settings = '/api/prompt-coach/settings';
  const saved = await app.inject({ method: 'PUT', url: settings, headers,
    payload: { coachPrompt: '识别引语边界重组，单段落允许候选规则。' } });
  assert.equal(saved.statusCode, 200, saved.body);
  const read = await app.inject({ method: 'GET', url: settings, headers });
  assert.equal(read.json().effectivePrompt, saved.json().customPrompt);
  const teacher = await app.inject({ method: 'GET', url: settings,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(teacher.json().customPrompt, null);
  const payload = { projectIds: [projectId], requestId: 'coach-instruction-001',
    coachPrompt: saved.json().customPrompt };
  const generated = await app.inject({ method: 'POST', url: '/api/prompt-coach/instruction/generate', headers, payload });
  assert.equal(generated.statusCode, 200, generated.body);
  assert.match(generated.json().content, /单例候选/);
  const unchanged = await app.inject({ method: 'GET', url: settings, headers });
  assert.equal(unchanged.json().customPrompt, saved.json().customPrompt);
  const repeated = await app.inject({ method: 'POST', url: '/api/prompt-coach/instruction/generate', headers, payload });
  assert.equal(repeated.json().content, generated.json().content);
  await assertGeneratedPromptSave(app, headers, generated.json().content);
  const denied = await app.inject({ method: 'POST', url: '/api/prompt-coach/instruction/generate',
    headers, payload: { projectIds: ['not-owned-project'], requestId: 'coach-instruction-denied' } });
  assert.equal(denied.statusCode, 403);
}

async function assertGeneratedPromptSave(app: FastifyInstance, headers: { cookie: string },
  content: string): Promise<void> {
  const saved = await app.inject({ method: 'PUT', url: '/api/prompt-coach/settings', headers,
    payload: { coachPrompt: `${content}\n增加信息顺序分析。` } });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.match(saved.json().customPrompt, /增加信息顺序分析/);
  const tooLong = await app.inject({ method: 'PUT', url: '/api/prompt-coach/settings', headers,
    payload: { coachPrompt: 'x'.repeat(8001) } });
  assert.equal(tooLong.statusCode, 400);
  const reset = await app.inject({ method: 'PUT', url: '/api/prompt-coach/settings', headers,
    payload: { coachPrompt: '' } });
  assert.equal(reset.json().customPrompt, null);
  assert.equal(reset.json().effectivePrompt, reset.json().defaultPrompt);
}
