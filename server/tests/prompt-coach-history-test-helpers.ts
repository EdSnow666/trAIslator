/**
 * 职责: 验证教练历史恢复、账号隔离及幂等运行
 * 依赖内部: ../src/app.ts
 * 依赖外部: fastify, node:assert
 * 暴露: exerciseCoachHistory | verifyCoachHistoryAfterRestart
 */

import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/app.js';

interface Sessions { student: { cookie: string }; teacher: { cookie: string } }
interface Scenario { projectId: string; workspaceId: string }

export async function exerciseCoachHistory(app: FastifyInstance, sessions: Sessions,
  scenario: Scenario, checkRetry = true): Promise<void> {
  const headers = { cookie: sessions.student.cookie };
  const url = `/api/prompt-coach/history?projectId=${scenario.projectId}`;
  const history = await app.inject({ method: 'GET', url, headers });
  assert.equal(history.statusCode, 200, history.body);
  assert.equal(history.json().total, 2);
  const latestId = history.json().runs[0].id;
  const detail = await app.inject({ method: 'GET', url: `/api/prompt-coach/history/${latestId}`, headers });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.ok(detail.json().result.rules.length > 0);
  assert.ok(detail.json().inputSnapshot.length > 0);
  assert.ok(detail.json().coachPromptVersionId);
  assert.equal(detail.json().coachPromptVersionId, detail.json().result.coachPromptVersionId);
  assert.deepEqual(detail.json().audit.map((e: { type: string }) => e.type), ['request', 'response', 'validation']);
  const sent = detail.json().audit[0].payload.body;
  assert.equal(typeof sent.model, 'string');
  assert.equal(JSON.parse(sent.messages[1].content).coachInstruction, detail.json().coachPrompt);
  assert.equal('focus' in JSON.parse(sent.messages[1].content), false);
  assert.equal('ignored' in JSON.parse(sent.messages[1].content), false);
  assert.ok(JSON.parse(detail.json().audit[1].payload.rawBody).choices[0].message.content);
  assert.equal(detail.json().audit[2].payload.rules[0].accepted, true);
  assert.doesNotMatch(JSON.stringify(detail.json().audit), /authorization|Bearer /i);
  const forbidden = await app.inject({ method: 'GET', url: `/api/prompt-coach/history/${latestId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(forbidden.statusCode, 404);
  await assertCoachReload(app, headers, scenario, detail.json().result);
  if (checkRetry) {
    const repeated = await app.inject({ method: 'POST', url: '/api/prompt-coach/projects', headers,
      payload: { projectIds: [scenario.projectId], requestId: 'coach-projects-001' } });
    assert.equal(repeated.statusCode, 201, repeated.body);
  }
  const after = await app.inject({ method: 'GET', url, headers });
  assert.equal(after.json().total, 2);
  for (const marker of ['TEST_INVALID_EVIDENCE', 'TEST_INVALID_JSON', 'TEST_HTTP_ERROR']) {
    const requestId = `audit-${marker}`;
    if (checkRetry) {
      const failed = await app.inject({ method: 'POST', url: '/api/prompt-coach/projects', headers,
        payload: { projectIds: [scenario.projectId], coachPrompt: marker, requestId } });
      assert.equal(failed.statusCode, 502, failed.body);
    }
    const audit = await app.inject({ method: 'GET', url: `/api/prompt-coach/audit/${requestId}`, headers });
    assert.equal(audit.statusCode, 200, audit.body);
    const events = audit.json().audit;
    if (marker === 'TEST_HTTP_ERROR') {
      assert.equal(events.at(-1).type, 'error');
      const responses = events.filter((e: { type: string }) => e.type === 'response');
      assert.ok(responses.length > 0);
      assert.equal(events.filter((e: { type: string }) => e.type === 'request').length, responses.length);
      assert.ok(responses.every((e: { payload: { status: number; rawBody: string } }) => e.payload.status === 503 && e.payload.rawBody.includes('model_not_found')));
    } else assert.deepEqual(events.map((e: { type: string }) => e.type), ['request', 'response', 'validation', 'error']);
    const denied = await app.inject({ method: 'GET', url: `/api/prompt-coach/audit/${requestId}`,
      headers: { cookie: sessions.teacher.cookie } });
    assert.equal(denied.statusCode, 404);
  }
  const failedList = await app.inject({ method: 'GET', url, headers });
  assert.equal(failedList.json().failedAttempts.length, 3);
  const invalid = await app.inject({ method: 'GET', url: '/api/prompt-coach/history?offset=-1', headers });
  assert.equal(invalid.statusCode, 400);
}

async function assertCoachReload(app: FastifyInstance, headers: { cookie: string },
  scenario: Scenario, expected: unknown): Promise<void> {
  const url = `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = await app.inject({ method: 'GET', url, headers });
    assert.equal(snapshot.statusCode, 200, snapshot.body);
    assert.deepEqual(snapshot.json().project.promptCoachResult, expected);
  }
  const teacherHistory = await app.inject({ method: 'GET', url: '/api/prompt-coach/history',
    headers: { cookie: 'invalid-session' } });
  assert.equal(teacherHistory.statusCode, 401);
}

export async function verifyCoachHistoryAfterRestart(databasePath: string, sessions: Sessions,
  scenario: Scenario): Promise<void> {
  const app = await buildServer(databasePath, false);
  try { await exerciseCoachHistory(app, sessions, scenario, false); }
  finally { await app.close(); }
}
