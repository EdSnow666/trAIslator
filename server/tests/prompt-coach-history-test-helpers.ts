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
