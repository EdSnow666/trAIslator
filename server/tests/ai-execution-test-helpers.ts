/**
 * 职责: 提供后端集成测试所需的模拟模型及逐句/全文 AI 执行断言
 * 依赖内部: 无
 * 依赖外部: node:assert, node:http, fastify
 * 暴露: startMockModel | exerciseRealAiExecution | exerciseFullTranslation | exerciseInvalidFullTranslation
 */

import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';

interface SessionSet { student: { cookie: string }; teacher: { cookie: string } }
interface Scenario { projectId: string; workspaceId: string; segmentId: string; promptId: string }

function mockModelContent(messages: Array<{ content?: string }> = []): string {
  const instruction = messages[0]?.content || '';
  if (instruction.includes('complete document as one coherent text')) {
    const payload = JSON.parse(messages[1]?.content || '{}') as
      { segments?: Array<{ segmentId: string }> };
    return JSON.stringify({ translations: (payload.segments || []).map((item, index) =>
      ({ segmentId: item.segmentId, text: `Full translated paragraph ${index + 1}.` })) });
  }
  if (instruction.includes('cold-start translation brief')) return JSON.stringify({ genre: 'academic article',
    skopos: 'teaching', audience: 'students', register: 'formal', strategy: 'preserve explicit sentence structure' });
  if (instruction.includes('complete reusable translation prompt')) {
    return 'Translate the full document in a formal academic register.';
  }
  return instruction.includes('post-editor') ? 'Structurally revised target.' : 'Server generated target.';
}

function respondMockModel(request: IncomingMessage, response: ServerResponse): void {
  const chunks: Buffer[] = [];
  request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  request.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as
      { model?: string; messages?: Array<{ content?: string }> };
    if (body.model === 'no-channel-model') {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'model_not_found',
        message: 'No available channel for model no-channel-model under group user.' } }));
      return;
    }
    const content = body.model === 'invalid-full-model'
      ? JSON.stringify({ translations: [{ segmentId: 'wrong-id', text: 'Invalid.' }] })
      : mockModelContent(body.messages);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 } }));
  });
}

export async function startMockModel(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(respondMockModel);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock model failed to start.');
  return { baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

export async function exerciseRealAiExecution(app: FastifyInstance, sessions: SessionSet,
  scenario: Scenario): Promise<void> {
  const translation = await app.inject({ method: 'POST',
    url: `/api/workspaces/${scenario.workspaceId}/ai/execute`, headers: { cookie: sessions.student.cookie },
    payload: { segmentId: scenario.segmentId, promptVersionId: scenario.promptId,
      kind: 'ai_translation', requestId: 'real-translation-001' } });
  assert.equal(translation.statusCode, 201, translation.body);
  const repeated = await app.inject({ method: 'POST', url: `/api/workspaces/${scenario.workspaceId}/ai/execute`,
    headers: { cookie: sessions.student.cookie }, payload: { segmentId: scenario.segmentId,
      promptVersionId: scenario.promptId, kind: 'ai_translation', requestId: 'real-translation-001' } });
  assert.equal(repeated.json().translationVersionId, translation.json().translationVersionId);
  const postEdit = await app.inject({ method: 'POST', url: `/api/workspaces/${scenario.workspaceId}/ai/execute`,
    headers: { cookie: sessions.student.cookie }, payload: { segmentId: scenario.segmentId,
      baseVersionId: translation.json().translationVersionId,
      kind: 'ai_post_edit', requestId: 'real-post-edit-001' } });
  assert.equal(postEdit.statusCode, 201, postEdit.body);
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie: sessions.student.cookie } });
  const segment = snapshot.json().project.segments.find((item: { id: string }) => item.id === scenario.segmentId);
  assert.equal(segment.currentTranslationId, postEdit.json().translationVersionId);
  assert.equal(segment.translations.find((item: { id: string }) =>
    item.id === postEdit.json().translationVersionId).aiText, 'Structurally revised target.');
}

export async function exerciseFullTranslation(app: FastifyInstance, sessions: SessionSet,
  scenario: Scenario): Promise<void> {
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie: sessions.student.cookie } });
  const payload = { promptVersionId: scenario.promptId, requestId: 'full-translation-001' };
  const first = await app.inject({ method: 'POST', url: `/api/workspaces/${scenario.workspaceId}/ai/execute-full`,
    headers: { cookie: sessions.student.cookie }, payload });
  const retry = await app.inject({ method: 'POST', url: `/api/workspaces/${scenario.workspaceId}/ai/execute-full`,
    headers: { cookie: sessions.student.cookie }, payload });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().translationVersionIds.length, snapshot.json().project.segments.length);
  assert.deepEqual(retry.json().translationVersionIds, first.json().translationVersionIds);
  const refreshed = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie: sessions.student.cookie } });
  const generatedIds = new Set(first.json().translationVersionIds);
  assert.ok(refreshed.json().project.segments.every(
    (segment: { currentTranslationId: string }) => generatedIds.has(segment.currentTranslationId)));
}

export async function exerciseInvalidFullTranslation(app: FastifyInstance, sessions: SessionSet,
  scenario: Scenario, baseUrl: string): Promise<void> {
  const model = await app.inject({ method: 'POST', url: '/api/manage/server-models',
    headers: { cookie: sessions.teacher.cookie }, payload: { name: '无效全文返回测试',
      provider: 'openai_compatible', baseUrl, model: 'invalid-full-model', apiKey: 'test-only-key' } });
  assert.equal(model.statusCode, 201, model.body);
  const before = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie: sessions.student.cookie } });
  const currentIds = before.json().project.segments.map((item: { currentTranslationId: string }) =>
    item.currentTranslationId);
  const failed = await app.inject({ method: 'POST',
    url: `/api/workspaces/${scenario.workspaceId}/ai/execute-full`,
    headers: { cookie: sessions.student.cookie }, payload: { promptVersionId: scenario.promptId,
      modelConfigId: model.json().id, requestId: 'full-translation-invalid-001' } });
  assert.equal(failed.statusCode, 502, failed.body);
  assert.equal(failed.json().code, 'FULL_TRANSLATION_ALIGNMENT_INVALID');
  const after = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie: sessions.student.cookie } });
  assert.deepEqual(after.json().project.segments.map(
    (item: { currentTranslationId: string }) => item.currentTranslationId), currentIds);
}
