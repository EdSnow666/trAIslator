/**
 * 职责: 提供后端集成测试所需的模拟模型及逐句/全文 AI 执行断言
 * 依赖内部: 无
 * 依赖外部: node:assert, node:http, fastify
 * 暴露: startMockModel | AI 执行、班级权限及 Prompt Coach 集成断言
 */

import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { exerciseCoachHistory } from './prompt-coach-history-test-helpers.js';
import { exerciseCoachInstruction } from './coach-instruction-test-helpers.js';

interface SessionSet { student: { cookie: string }; teacher: { cookie: string } }
interface Scenario {
  projectId: string; classId: string; workspaceId: string; segmentId: string; promptId: string;
}

function mockCoachContent(messages: Array<{ content?: string }>): string {
  const payload = JSON.parse(messages[1]?.content || '{}') as
    { coachInstruction?: string; records?: Array<{ recordId: string }> };
  if (payload.coachInstruction === 'TEST_INVALID_EVIDENCE') return JSON.stringify({ rules: [
    { id: 'bad', instruction: 'Invalid evidence', evidenceRecordIds: ['invented-id'] }] });
  if (payload.coachInstruction === 'TEST_INVALID_JSON') return 'not JSON';
  const evidenceRecordIds = (payload.records || []).map((item) => item.recordId);
  if (payload.coachInstruction?.includes('亲近')) return JSON.stringify({ rules: [{
    id: 'warmth', category: 'warmth-and-restraint', title: '亲近而克制', instruction: '让亲近感从具体行动中流露。',
    signal: '单例候选', evidenceRecordIds }] });
  return JSON.stringify({ rules: [{ id: 'finite-clause', title: '明确谓语核心',
    instruction: '优先使用边界明确的有限从句，避免松散的名词化堆叠。',
    signal: '人工修改集中重组了句子谓语与从句边界。', evidenceRecordIds }] });
}

function mockModelContent(messages: Array<{ content?: string }> = []): string {
  const instruction = messages[0]?.content || '';
  if (instruction.includes('编写供“AI Prompt教练”使用的分析指令')) {
    const payload = JSON.parse(messages[1]!.content!) as { currentPrompt: string; records: unknown[] };
    assert.ok(payload.records.length > 0);
    assert.match(payload.currentPrompt, /引语边界/);
    return '根据人工修改中的引语边界、施事与信息顺序提取规则，单段落标为单例候选并引用实际案例。';
  }
  if (instruction.includes('AI prompt coach')) return mockCoachContent(messages);
  if (instruction.includes('preserving paragraph alignment')) {
    const payload = JSON.parse(messages[1]?.content || '{}') as
      { segments?: Array<{ segmentId: string }> };
    const prefix = instruction.includes('post-editor') ? 'Full post-edited' : 'Full translated';
    return JSON.stringify({ translations: (payload.segments || []).map((item, index) =>
      ({ segmentId: item.segmentId, text: `${prefix} paragraph ${index + 1}.` })) });
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
    if (body.model === 'no-channel-model' || body.messages?.[1]?.content?.includes('TEST_HTTP_ERROR')) {
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

async function fullPostEditBases(app: FastifyInstance, sessions: SessionSet, scenario: Scenario) {
  const before = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie: sessions.student.cookie } });
  return new Map(before.json().project.segments.map(
    (item: { id: string; currentTranslationId: string }) => [item.id, item.currentTranslationId]));
}

async function assertFullPostEditSnapshot(app: FastifyInstance, sessions: SessionSet,
  scenario: Scenario, baseIds: Map<unknown, unknown>): Promise<void> {
  const after = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie: sessions.student.cookie } });
  after.json().project.segments.forEach((segment: { id: string; currentTranslationId: string;
    translations: Array<{ id: string; serverVersionKind: string; serverParentVersionId: string }> }) => {
    const current = segment.translations.find((item) => item.id === segment.currentTranslationId)!;
    assert.equal(current.serverVersionKind, 'ai_post_edit');
    assert.equal(current.serverParentVersionId, baseIds.get(segment.id));
  });
}

export async function exerciseFullPostEdit(app: FastifyInstance, sessions: SessionSet,
  scenario: Scenario): Promise<void> {
  const baseIds = await fullPostEditBases(app, sessions, scenario);
  const payload = { kind: 'ai_post_edit', requestId: 'full-post-edit-001' };
  const first = await app.inject({ method: 'POST',
    url: `/api/workspaces/${scenario.workspaceId}/ai/execute-full`,
    headers: { cookie: sessions.student.cookie }, payload });
  const retry = await app.inject({ method: 'POST',
    url: `/api/workspaces/${scenario.workspaceId}/ai/execute-full`,
    headers: { cookie: sessions.student.cookie }, payload });
  assert.equal(first.statusCode, 201, first.body);
  assert.deepEqual(retry.json().translationVersionIds, first.json().translationVersionIds);
  await assertFullPostEditSnapshot(app, sessions, scenario, baseIds);
  const auditUrl = `/api/ai/runs/${first.json().runId}/audit`;
  const audit = await app.inject({ method: 'GET', url: auditUrl, headers: { cookie: sessions.student.cookie } });
  assert.equal(audit.statusCode, 200, audit.body);
  assert.deepEqual(audit.json().events.map((e: { type: string }) => e.type), ['request', 'response', 'validation']);
  const body = audit.json().events[0].payload.body;
  const sent = JSON.parse(body.messages[1].content);
  assert.match(body.messages[0].content, /Compare each currentTranslation against its source/);
  assert.equal(sent.segments.length, baseIds.size);
  assert.ok(sent.segments.every((s: { source: string; currentTranslation: string }) => s.source && s.currentTranslation));
  assert.ok('projectBrief' in sent && 'customPrompt' in sent && 'overarchingPrompt' in sent);
  assert.ok(JSON.parse(audit.json().events[1].payload.rawBody).choices[0].message.content);
  assert.doesNotMatch(audit.body, /test-only-key|authorization|Bearer /i);
  const denied = await app.inject({ method: 'GET', url: auditUrl, headers: { cookie: sessions.teacher.cookie } });
  assert.equal(denied.statusCode, 404);
}

export async function exerciseClassPostEditPolicy(app: FastifyInstance, sessions: SessionSet,
  scenario: Scenario): Promise<void> {
  const url = `/api/classes/${scenario.classId}/features`;
  const disabled = await app.inject({ method: 'PATCH', url, headers: { cookie: sessions.teacher.cookie },
    payload: { aiPostEditEnabled: false } });
  assert.equal(disabled.statusCode, 200, disabled.body);
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie: sessions.student.cookie } });
  assert.equal(snapshot.json().project.aiPostEditAllowed, false);
  assert.equal(snapshot.json().project.activePostEditPromptId, null);
  assert.equal(snapshot.json().project.prompts.some(
    (item: { promptKind: string }) => item.promptKind === 'post_edit'), false);
  await assertPostEditInspectorHidden(app, sessions.student.cookie, scenario);
  const denied = await app.inject({ method: 'POST', url: `/api/workspaces/${scenario.workspaceId}/ai/execute`,
    headers: { cookie: sessions.student.cookie }, payload: { segmentId: scenario.segmentId,
      baseVersionId: snapshot.json().project.segments[0].currentTranslationId,
      kind: 'ai_post_edit', requestId: 'blocked-post-edit-001' } });
  assert.equal(denied.statusCode, 403, denied.body);
  const enabled = await app.inject({ method: 'PATCH', url, headers: { cookie: sessions.teacher.cookie },
    payload: { aiPostEditEnabled: true } });
  assert.equal(enabled.statusCode, 200, enabled.body);
}

async function assertPostEditInspectorHidden(app: FastifyInstance, cookie: string,
  scenario: Scenario): Promise<void> {
  const query = `projectId=${scenario.projectId}&workspaceId=${scenario.workspaceId}`;
  const response = await app.inject({ method: 'GET',
    url: `/api/manage/prompt-structures?${query}`, headers: { cookie } });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().operations.some(
    (item: { id: string }) => item.id.includes('post_edit')), false);
  assert.equal('postEdit' in response.json().promptLayers, false);
}

async function confirmWorkspace(app: FastifyInstance, cookie: string,
  workspaceId: string): Promise<void> {
  const response = await app.inject({ method: 'POST',
    url: `/api/workspaces/${workspaceId}/translations/confirm`, headers: { cookie },
    payload: { requestId: 'coach-confirm-all-001' } });
  assert.equal(response.statusCode, 200, response.body);
}

export async function exercisePromptCoach(app: FastifyInstance, sessions: SessionSet,
  scenario: Scenario): Promise<void> {
  const personalUrl = `/api/workspaces/${scenario.workspaceId}/prompt-coach`;
  const pendingState = await app.inject({ method: 'POST',
    url: `/api/workspaces/${scenario.workspaceId}/current-version`,
    headers: { cookie: sessions.student.cookie }, payload: { segmentId: scenario.segmentId,
      translationVersionId: await currentVersionId(app, sessions.student.cookie, scenario),
      requestId: 'coach-mark-pending-001' } });
  assert.equal(pendingState.statusCode, 200, pendingState.body);
  const pending = await app.inject({ method: 'POST', url: personalUrl,
    headers: { cookie: sessions.student.cookie }, payload: { requestId: 'coach-before-confirm-001' } });
  assert.equal(pending.statusCode, 409, pending.body);
  await confirmWorkspace(app, sessions.student.cookie, scenario.workspaceId);
  const personal = await app.inject({ method: 'POST', url: personalUrl,
    headers: { cookie: sessions.student.cookie }, payload: { requestId: 'coach-personal-001' } });
  assert.equal(personal.statusCode, 201, personal.body);
  assert.ok(personal.json().rules[0].supportCount >= 1);
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie: sessions.student.cookie } });
  assert.equal(snapshot.statusCode, 200, snapshot.body);
  for (const evidence of personal.json().rules[0].evidence) {
    const segment = snapshot.json().project.segments.find((item: { id: string }) => item.id === evidence.segmentId);
    const human = segment.translations.find((item: { id: string }) => item.id === evidence.recordId);
    assert.equal(human.serverVersionKind, 'human_post_edit');
    assert.equal(human.aiText, evidence.aiText);
    assert.equal(human.postEditText, evidence.postEditText);
    assert.ok(segment.translations.some((item: { id: string }) => item.id === human.serverComparisonVersionId));
    assert.notEqual(evidence.aiText, evidence.postEditText);
    assert.ok(evidence.diff.length > 0);
  }
  assert.equal(personal.json().schema, 'translation-aiducator.prompt-coach.v3');
  assert.equal(personal.json().coachSpecVersion, 'example-backed-style-2026-10-22.v1');
  const inactiveCancel = await app.inject({ method: 'POST', url: `${personalUrl}/cancel`,
    headers: { cookie: sessions.student.cookie }, payload: { requestId: 'coach-personal-001' } });
  assert.equal(inactiveCancel.statusCode, 200, inactiveCancel.body);
  assert.equal(inactiveCancel.json().cancelled, false);
  const settings = await app.inject({ method: 'GET', url: '/api/prompt-coach/settings',
    headers: { cookie: sessions.student.cookie } });
  assert.equal(settings.statusCode, 200, settings.body);
  assert.equal(settings.json().customPrompt, null);
  const multi = await app.inject({ method: 'POST', url: '/api/prompt-coach/projects',
    headers: { cookie: sessions.student.cookie }, payload: { projectIds: [scenario.projectId],
      coachPrompt: '只总结亲近、克制的风格，不分析句法。', requestId: 'coach-projects-001' } });
  assert.equal(multi.statusCode, 201, multi.body);
  assert.equal(multi.json().scope.type, 'projects');
  assert.equal(multi.json().coachPromptSource, 'custom');
  assert.equal(multi.json().rules[0].category, 'warmth-and-restraint');
  const savedSettings = await app.inject({ method: 'GET', url: '/api/prompt-coach/settings',
    headers: { cookie: sessions.student.cookie } });
  assert.equal(savedSettings.json().customPrompt, '只总结亲近、克制的风格，不分析句法。');
  const wholeClass = await app.inject({ method: 'POST', url: `/api/classes/${scenario.classId}/prompt-coach`,
    headers: { cookie: sessions.teacher.cookie }, payload: { requestId: 'coach-class-001' } });
  assert.equal(wholeClass.statusCode, 201, wholeClass.body);
  assert.ok(wholeClass.json().summary.studentCount >= 1);
  await exerciseCoachHistory(app, sessions, scenario);
  await exerciseCoachInstruction(app, sessions, scenario.projectId);
  const submissions = await app.inject({ method: 'GET', url: '/api/teaching/submissions',
    headers: { cookie: sessions.teacher.cookie } });
  assert.ok(submissions.json().translations.some(
    (item: { modificationTrace: unknown[] }) => item.modificationTrace.length >= 3));
  assert.ok(submissions.json().translations.every(
    (item: { submittedById: string }) => typeof item.submittedById === 'string'));
}

async function currentVersionId(app: FastifyInstance, cookie: string,
  scenario: Scenario): Promise<string> {
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie } });
  return snapshot.json().project.segments.find(
    (item: { id: string }) => item.id === scenario.segmentId).currentTranslationId;
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
  const runs = await app.inject({ method: 'GET', url: `/api/ai/runs?projectId=${scenario.projectId}`,
    headers: { cookie: sessions.student.cookie } });
  const failedRun = runs.json().runs.find((r: { requestId: string }) => r.requestId === 'full-translation-invalid-001');
  assert.equal(failedRun.status, 'failed');
  const audit = await app.inject({ method: 'GET', url: `/api/ai/runs/${failedRun.id}/audit`,
    headers: { cookie: sessions.student.cookie } });
  assert.deepEqual(audit.json().events.map((e: { type: string }) => e.type), ['request', 'response', 'validation', 'error']);
  assert.equal(audit.json().events[2].payload.valid, false);
  const after = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie: sessions.student.cookie } });
  assert.deepEqual(after.json().project.segments.map(
    (item: { currentTranslationId: string }) => item.currentTranslationId), currentIds);
  await app.inject({ method: 'POST', url: '/api/manage/server-models', headers: { cookie: sessions.teacher.cookie },
    payload: { id: model.json().id, name: '全文HTTP重试审计', provider: 'openai_compatible', baseUrl,
      model: 'no-channel-model', maxRetries: 1, isDefault: false } });
  const httpFailed = await app.inject({ method: 'POST', url: `/api/workspaces/${scenario.workspaceId}/ai/execute-full`,
    headers: { cookie: sessions.student.cookie }, payload: { kind: 'ai_post_edit',
      modelConfigId: model.json().id, requestId: 'full-post-edit-http-failure' } });
  assert.equal(httpFailed.statusCode, 502, httpFailed.body);
  const httpRuns = await app.inject({ method: 'GET', url: '/api/ai/runs', headers: { cookie: sessions.student.cookie } });
  const httpRun = httpRuns.json().runs.find((r: { requestId: string }) => r.requestId === 'full-post-edit-http-failure');
  const httpAudit = await app.inject({ method: 'GET', url: `/api/ai/runs/${httpRun.id}/audit`,
    headers: { cookie: sessions.student.cookie } });
  assert.deepEqual(httpAudit.json().events.map((e: { type: string }) => e.type), ['request', 'response', 'request', 'response', 'error']);
  assert.equal(httpAudit.json().events[1].payload.status, 503);
  assert.equal(httpRun.status, 'failed');
  const disabled = await app.inject({ method: 'DELETE',
    url: `/api/manage/server-models/${model.json().id}`, headers: { cookie: sessions.teacher.cookie } });
  assert.equal(disabled.statusCode, 200, disabled.body);
}
