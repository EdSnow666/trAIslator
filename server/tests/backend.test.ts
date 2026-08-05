/**
 * 职责: 验证账号、文档导入、模板克隆、项目隔离、Prompt 提交及译文事件闭环
 * 依赖内部: ../src/app.ts, ../src/context.ts, ../src/ops, ../src/seed
 * 依赖外部: node:assert, node:fs, node:http, node:os, node:path, node:test, fastify
 * 暴露: 后端集成测试
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/app.js';
import { createAppContext } from '../src/context.js';
import { openDatabase } from '../src/db/database.js';
import { initializeAdmin } from '../src/ops/admin.js';
import { runMigrationDeployment } from '../src/ops/deploy.js';
import { seedDemoTemplates } from '../src/seed/demo-templates.js';
interface Session { cookie: string; user: { mustChangePassword: boolean } }
interface CreatedUser { id: string; password: string }
interface TestSessions { admin: Session; teacher: Session; student: Session; outsider: Session; experiment: Session }
interface ProjectScenario { projectId: string; workspaceId: string; segmentId: string; promptId: string }
function respondMockModel(request: IncomingMessage, response: ServerResponse): void {
  const chunks: Buffer[] = [];
  request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  request.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      model?: string; messages?: Array<{ content?: string }>;
    };
    if (body.model === 'no-channel-model') {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'model_not_found',
        message: 'No available channel for model no-channel-model under group user.' } }));
      return;
    }
    const instruction = body.messages?.[0]?.content || '';
    const postEdit = instruction.includes('post-editor');
    const brief = instruction.includes('cold-start translation brief');
    const fullPrompt = instruction.includes('complete reusable translation prompt');
    const content = brief ? JSON.stringify({ genre: 'academic article', skopos: 'teaching',
      audience: 'students', register: 'formal', strategy: 'preserve explicit sentence structure' })
      : fullPrompt ? 'Translate the full document in a formal academic register.'
        : postEdit ? 'Structurally revised target.' : 'Server generated target.';
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 } }));
  });
}
async function startMockModel(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(respondMockModel);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock model failed to start.');
  return { baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
async function login(app: FastifyInstance, username: string, password: string): Promise<Session> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  assert.equal(response.statusCode, 200, response.body);
  const cookie = String(response.headers['set-cookie']).split(';')[0]!;
  return { cookie, user: response.json().user };
}
async function readySession(app: FastifyInstance, username: string,
  initialPassword: string, newPassword: string): Promise<Session> {
  const initial = await login(app, username, initialPassword);
  if (!initial.user.mustChangePassword) return initial;
  const changed = await app.inject({ method: 'POST', url: '/api/auth/change-password',
    headers: { cookie: initial.cookie }, payload: { currentPassword: initialPassword, newPassword } });
  assert.equal(changed.statusCode, 200, changed.body);
  return login(app, username, newPassword);
}
async function createAccount(app: FastifyInstance, cookie: string, username: string,
  roles: string[]): Promise<CreatedUser> {
  const response = await app.inject({ method: 'POST', url: '/api/admin/users', headers: { cookie },
    payload: { username, displayName: username, roles } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}
async function createClassProject(app: FastifyInstance, cookie: string, templateId: string) {
  const classResponse = await app.inject({ method: 'POST', url: '/api/classes', headers: { cookie },
    payload: { name: '结构翻译课', code: 'STRUCT-01' } });
  assert.equal(classResponse.statusCode, 201, classResponse.body);
  const classId = classResponse.json().id;
  const projectResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: { cookie },
    payload: { name: '模板克隆课', direction: 'EN → ZH', sourceLanguage: 'en',
      targetLanguage: 'zh-CN', sourceTemplateProjectId: templateId } });
  assert.equal(projectResponse.statusCode, 201, projectResponse.body);
  return { classId, projectId: projectResponse.json().id };
}
async function addStudentAndAssign(app: FastifyInstance, cookie: string,
  classId: string, projectId: string, username: string): Promise<string> {
  const member = await app.inject({ method: 'POST', url: `/api/classes/${classId}/members`,
    headers: { cookie }, payload: { username, membershipRole: 'student' } });
  assert.equal(member.statusCode, 200, member.body);
  const assignment = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assignments`,
    headers: { cookie }, payload: { classId } });
  assert.equal(assignment.statusCode, 201, assignment.body);
  return assignment.json().id;
}
async function createStudentPrompt(app: FastifyInstance, cookie: string, projectId: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/prompts`,
    headers: { cookie }, payload: { title: '学生结构规则', content: 'Prefer explicit finite clauses.' } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().id;
}
async function assertPrivatePrompt(app: FastifyInstance, teacher: string, student: string,
  projectId: string, workspaceId: string, promptId: string): Promise<void> {
  const before = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/prompts`,
    headers: { cookie: teacher } });
  assert.equal(before.statusCode, 200, before.body);
  assert.equal(before.json().prompts.some((item: { id: string }) => item.id === promptId), false);
  const active = await app.inject({ method: 'POST',
    url: `/api/workspaces/${workspaceId}/active-prompt`, headers: { cookie: student },
    payload: { promptVersionId: promptId, requestId: 'prompt-active-001' } });
  assert.equal(active.statusCode, 200, active.body);
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${projectId}/snapshot?workspaceId=${workspaceId}`, headers: { cookie: student } });
  const prompt = snapshot.json().project.prompts.find((item: { id: string }) => item.id === promptId);
  assert.equal(snapshot.json().project.activePromptId, promptId);
  assert.equal(prompt.isOwnedByCurrentUser, true);
  assert.equal(prompt.canSubmit, true);
  assert.ok(prompt.version >= 2);
}
async function submitAndPublishPrompt(app: FastifyInstance, teacher: string, student: string,
  projectId: string, workspaceId: string, promptId: string): Promise<void> {
  const submit = await app.inject({ method: 'POST', url: `/api/prompts/${promptId}/submit`,
    headers: { cookie: student } });
  const repeated = await app.inject({ method: 'POST', url: `/api/prompts/${promptId}/submit`,
    headers: { cookie: student } });
  assert.equal(submit.statusCode, 201, submit.body);
  assert.equal(repeated.json().id, submit.json().id);
  const visible = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/prompts`,
    headers: { cookie: teacher } });
  assert.equal(visible.json().prompts.some((item: { id: string }) => item.id === promptId), true);
  const published = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/prompts/publish`,
    headers: { cookie: teacher }, payload: { promptVersionId: promptId } });
  assert.equal(published.statusCode, 201, published.body);
  const republished = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/prompts/publish`,
    headers: { cookie: teacher }, payload: { promptVersionId: promptId } });
  assert.equal(republished.json().id, published.json().id);
  const unpublished = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/prompts/unpublish`,
    headers: { cookie: teacher }, payload: { promptVersionId: promptId } });
  assert.equal(unpublished.statusCode, 200, unpublished.body);
  const publishedAgain = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/prompts/publish`,
    headers: { cookie: teacher }, payload: { promptVersionId: promptId } });
  assert.equal(publishedAgain.statusCode, 201, publishedAgain.body);
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${projectId}/snapshot?workspaceId=${workspaceId}`, headers: { cookie: student } });
  const prompt = snapshot.json().project.prompts.find((item: { id: string }) => item.id === promptId);
  assert.equal(prompt.isPublished, true);
  assert.equal(prompt.submissionStatus, 'accepted');
  const catalog = await app.inject({ method: 'GET', url: '/api/project-resources/catalog', headers: { cookie: student } });
  assert.ok(catalog.json().resources.some((item: { projectId: string; promptVersionId: string }) =>
    item.projectId === projectId && item.promptVersionId === promptId));
}
async function exercisePromptCollaboration(app: FastifyInstance, teacher: string, student: string,
  projectId: string, workspaceId: string, promptId: string): Promise<void> {
  await assertPrivatePrompt(app, teacher, student, projectId, workspaceId, promptId);
  await submitAndPublishPrompt(app, teacher, student, projectId, workspaceId, promptId);
}
async function exercisePostEdit(app: FastifyInstance, cookie: string, workspaceId: string,
  segmentId: string, baseId: string, promptId: string): Promise<{ aiId: string; humanId: string }> {
  const generated = await app.inject({ method: 'POST',
    url: `/api/workspaces/${workspaceId}/generated-translations`, headers: { cookie },
    payload: { segmentId, content: 'AI revised sentence.', baseVersionId: baseId,
      promptVersionId: promptId, kind: 'ai_post_edit', requestId: 'ai-edit-001',
      provider: 'mock', model: 'mock' } });
  assert.equal(generated.statusCode, 201, generated.body);
  const payload = { segmentId, content: 'Human revised sentence.', parentVersionId: generated.json().id,
    baseVersionId: baseId, requestId: 'human-edit-001' };
  const first = await app.inject({ method: 'POST', url: `/api/workspaces/${workspaceId}/post-edits`,
    headers: { cookie }, payload });
  const repeated = await app.inject({ method: 'POST', url: `/api/workspaces/${workspaceId}/post-edits`,
    headers: { cookie }, payload });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(repeated.json().id, first.json().id);
  const second = await app.inject({ method: 'POST', url: `/api/workspaces/${workspaceId}/post-edits`,
    headers: { cookie }, payload: { ...payload, content: 'Human revised sentence again.',
      parentVersionId: generated.json().id, requestId: 'human-edit-002' } });
  assert.notEqual(second.json().id, first.json().id);
  await assertPostEditPersistence(app, cookie, workspaceId, first.json().id);
  return { aiId: generated.json().id, humanId: second.json().id };
}
async function assertPostEditPersistence(app: FastifyInstance, cookie: string,
  workspaceId: string, versionId: string): Promise<void> {
  const response = await app.inject({ method: 'GET', url: `/api/workspaces/${workspaceId}/translations`,
    headers: { cookie } });
  const original = response.json().translations.find((item: { id: string }) => item.id === versionId);
  assert.equal(original.content, 'Human revised sentence.');
}
async function exerciseProjectSnapshot(app: FastifyInstance, cookie: string, projectId: string,
  workspaceId: string, segmentId: string, ids: { aiId: string; humanId: string }): Promise<void> {
  const decision = await app.inject({ method: 'POST', url: `/api/workspaces/${workspaceId}/ai-decisions`,
    headers: { cookie }, payload: { aiVersionId: ids.aiId, changeId: 'change-1',
      decision: 'accepted', requestId: 'decision-001' } });
  assert.equal(decision.statusCode, 200, decision.body);
  const response = await app.inject({ method: 'GET',
    url: `/api/projects/${projectId}/snapshot?workspaceId=${workspaceId}`, headers: { cookie } });
  assert.equal(response.statusCode, 200, response.body);
  const segment = response.json().project.segments.find((item: { id: string }) => item.id === segmentId);
  assert.equal(segment.currentTranslationId, ids.humanId);
  const aiVersion = segment.translations.find((item: { id: string }) => item.id === ids.aiId);
  assert.equal(aiVersion.serverVersionKind, 'ai_post_edit');
  assert.equal(aiVersion.aiPostEdit.decisions['change-1'], 'accepted');
  const humanVersion = segment.translations.find((item: { id: string }) => item.id === ids.humanId);
  assert.equal(humanVersion.postEditText, 'Human revised sentence again.');
  assert.equal(humanVersion.serverBaselineKind, 'ai_post_edit');
}
async function exercisePersonalKey(app: FastifyInstance, cookie: string): Promise<void> {
  const saved = await app.inject({ method: 'POST', url: '/api/me/api-keys', headers: { cookie },
    payload: { provider: 'openai-compatible', label: '个人测试', apiKey: 'secret-test-value' } });
  assert.equal(saved.statusCode, 201, saved.body);
  const listed = await app.inject({ method: 'GET', url: '/api/me/api-keys', headers: { cookie } });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.body.includes('secret-test-value'), false);
  const disabled = await app.inject({ method: 'DELETE',
    url: `/api/me/api-keys/${saved.json().id}`, headers: { cookie } });
  assert.equal(disabled.statusCode, 200, disabled.body);
}
function verifyDatabaseState(databasePath: string, projectId: string): void {
  const db = openDatabase(databasePath);
  const project = db.prepare('SELECT source_template_project_id FROM projects WHERE id = ?')
    .get(projectId) as { source_template_project_id: string };
  assert.ok(project.source_template_project_id);
  const count = db.prepare('SELECT COUNT(*) AS count FROM activity_events WHERE project_id = ?')
    .get(projectId) as { count: number };
  assert.ok(count.count >= 6);
  const key = db.prepare('SELECT ciphertext FROM user_api_keys LIMIT 1')
    .get() as { ciphertext: string };
  assert.notEqual(key.ciphertext, 'secret-test-value');
  const serverKey = db.prepare('SELECT ciphertext FROM server_model_configs LIMIT 1')
    .get() as { ciphertext: string };
  assert.notEqual(serverKey.ciphertext, 'server-secret-key');
  const realRun = db.prepare(`SELECT status, model_config_id AS modelConfigId, attempt_count AS attempts
    FROM ai_runs WHERE request_id = 'real-post-edit-001'`).get() as
    { status: string; modelConfigId: string; attempts: number };
  assert.deepEqual({ status: realRun.status, configured: Boolean(realRun.modelConfigId), attempts: realRun.attempts },
    { status: 'succeeded', configured: true, attempts: 1 });
  assert.deepEqual(db.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
  assert.equal((db.pragma('foreign_key_check') as unknown[]).length, 0);
  db.close();
}
async function prepareDatabase(databasePath: string): Promise<string> {
  const context = createAppContext(databasePath);
  const admin = await initializeAdmin(context, 'root-admin', '系统管理员');
  const seeded = await seedDemoTemplates(context);
  assert.deepEqual(seeded, { inserted: 4, skipped: 0 });
  context.db.close();
  return admin.password;
}
async function provisionSessions(app: FastifyInstance, adminPassword: string) {
  const admin = await readySession(app, 'root-admin', adminPassword, 'Admin-Secure-2026!');
  const teacherAccount = await createAccount(app, admin.cookie, 'teacher-a', ['teacher']);
  const studentAccount = await createAccount(app, admin.cookie, 'student-a', ['student']);
  const outsiderAccount = await createAccount(app, admin.cookie, 'student-b', ['student']);
  const experimentAccount = await createAccount(app, admin.cookie, 'participant-a', ['experiment_user']);
  const teacher = await readySession(app, 'teacher-a', teacherAccount.password, 'Teacher-Secure-2026!');
  const student = await readySession(app, 'student-a', studentAccount.password, 'Student-Secure-2026!');
  const outsider = await readySession(app, 'student-b', outsiderAccount.password, 'Outsider-Secure-2026!');
  const experiment = await readySession(app, 'participant-a', experimentAccount.password, 'Experiment-Secure-2026!');
  return { admin, teacher, student, outsider, experiment };
}
async function assertClassVisibility(app: FastifyInstance, sessions: TestSessions,
  classId: string): Promise<void> {
  const detail = await app.inject({ method: 'GET', url: `/api/classes/${classId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().class.members.some(
    (item: { username: string }) => item.username === 'student-a'), true);
  assert.equal(detail.json().class.projects.some((item: { id: string }) => item.id), true);
  const studentDenied = await app.inject({ method: 'GET', url: `/api/classes/${classId}`,
    headers: { cookie: sessions.student.cookie } });
  assert.equal(studentDenied.statusCode, 403);
  const usersDenied = await app.inject({ method: 'GET', url: '/api/admin/users',
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(usersDenied.statusCode, 403);
}
async function exerciseMemberManagement(app: FastifyInstance, sessions: TestSessions,
  classId: string): Promise<void> {
  const wrongRole = await app.inject({ method: 'POST', url: `/api/classes/${classId}/members`,
    headers: { cookie: sessions.teacher.cookie },
    payload: { username: 'student-a', membershipRole: 'teacher' } });
  assert.equal(wrongRole.statusCode, 404);
  const added = await app.inject({ method: 'POST', url: `/api/classes/${classId}/members`,
    headers: { cookie: sessions.teacher.cookie },
    payload: { username: 'student-b', membershipRole: 'student' } });
  assert.equal(added.statusCode, 200, added.body);
  const detail = await app.inject({ method: 'GET', url: `/api/classes/${classId}`,
    headers: { cookie: sessions.teacher.cookie } });
  const outsider = detail.json().class.members.find((item: { username: string }) => item.username === 'student-b');
  const removed = await app.inject({ method: 'DELETE',
    url: `/api/classes/${classId}/members/${outsider.id}/student`, headers: { cookie: sessions.teacher.cookie } });
  assert.equal(removed.statusCode, 200, removed.body);
}
async function assertForeignClassDenied(app: FastifyInstance, sessions: TestSessions,
  projectId: string): Promise<void> {
  const created = await app.inject({ method: 'POST', url: '/api/classes',
    headers: { cookie: sessions.admin.cookie }, payload: { name: '管理端班级', code: 'ADMIN-ONLY' } });
  assert.equal(created.statusCode, 201, created.body);
  const denied = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assignments`,
    headers: { cookie: sessions.teacher.cookie }, payload: { classId: created.json().id } });
  assert.equal(denied.statusCode, 403);
}
async function exerciseTeachingManagement(app: FastifyInstance, sessions: TestSessions,
  classId: string, projectId: string, assignmentId: string): Promise<void> {
  await assertClassVisibility(app, sessions, classId);
  await exerciseMemberManagement(app, sessions, classId);
  await assertForeignClassDenied(app, sessions, projectId);
  const repeated = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assignments`,
    headers: { cookie: sessions.teacher.cookie }, payload: { classId } });
  assert.equal(repeated.statusCode, 201, repeated.body);
  assert.equal(repeated.json().id, assignmentId);
}
async function createExperimentSetup(app: FastifyInstance, teacherCookie: string) {
  const created = await app.inject({ method: 'POST', url: '/api/experiments',
    headers: { cookie: teacherCookie }, payload: { name: '句法优化实验', description: '只观察句子结构。' } });
  assert.equal(created.statusCode, 201, created.body);
  const stage = await app.inject({ method: 'POST', url: `/api/experiments/${created.json().id}/stages`,
    headers: { cookie: teacherCookie }, payload: { name: '初次译后编辑', stageOrder: 1 } });
  assert.equal(stage.statusCode, 201, stage.body);
  const duplicate = await app.inject({ method: 'POST', url: `/api/experiments/${created.json().id}/stages`,
    headers: { cookie: teacherCookie }, payload: { name: '重复阶段', stageOrder: 1 } });
  assert.equal(duplicate.statusCode, 409);
  return { experimentId: created.json().id, stageId: stage.json().id };
}
async function assertExperimentListing(app: FastifyInstance, sessions: TestSessions,
  experimentId: string): Promise<void> {
  for (const session of [sessions.teacher, sessions.admin]) {
    const listed = await app.inject({ method: 'GET', url: '/api/experiments',
      headers: { cookie: session.cookie } });
    assert.ok(listed.json().experiments.some((item: { id: string }) => item.id === experimentId));
  }
  const denied = await app.inject({ method: 'GET', url: '/api/experiments',
    headers: { cookie: sessions.student.cookie } });
  assert.equal(denied.statusCode, 403);
}
async function enrollExperimentUser(app: FastifyInstance, sessions: TestSessions,
  experimentId: string): Promise<void> {
  const payload = { username: 'participant-a', participantCode: 'P001' };
  const enrolled = await app.inject({ method: 'POST', url: `/api/experiments/${experimentId}/participants`,
    headers: { cookie: sessions.teacher.cookie }, payload });
  const repeated = await app.inject({ method: 'POST', url: `/api/experiments/${experimentId}/participants`,
    headers: { cookie: sessions.teacher.cookie }, payload });
  assert.equal(enrolled.statusCode, 200, enrolled.body);
  assert.equal(repeated.statusCode, 200, repeated.body);
}
async function assertExperimentDetail(app: FastifyInstance, sessions: TestSessions,
  experimentId: string): Promise<string> {
  const detail = await app.inject({ method: 'GET', url: `/api/experiments/${experimentId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().experiment.stages.length, 1);
  assert.equal(detail.json().experiment.participants[0].participantCode, 'P001');
  const denied = await app.inject({ method: 'GET', url: `/api/experiments/${experimentId}`,
    headers: { cookie: sessions.student.cookie } });
  assert.equal(denied.statusCode, 403);
  return detail.json().experiment.participants[0].id;
}
async function assertExperimentAudit(app: FastifyInstance, sessions: TestSessions,
  experimentId: string): Promise<void> {
  const audit = await app.inject({ method: 'GET', url: '/api/activity/managed?eventPrefix=experiment.',
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(audit.statusCode, 200, audit.body);
  assert.ok(audit.json().events.some((item: { metadata: { experimentId?: string } }) =>
    item.metadata.experimentId === experimentId));
  const denied = await app.inject({ method: 'GET', url: '/api/activity/managed',
    headers: { cookie: sessions.student.cookie } });
  assert.equal(denied.statusCode, 403);
}

async function exerciseExperimentManagement(app: FastifyInstance, sessions: TestSessions,
  projectId: string): Promise<void> {
  const setup = await createExperimentSetup(app, sessions.teacher.cookie);
  await assertExperimentListing(app, sessions, setup.experimentId);
  await enrollExperimentUser(app, sessions, setup.experimentId);
  const participantId = await assertExperimentDetail(app, sessions, setup.experimentId);
  const assigned = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assignments`,
    headers: { cookie: sessions.teacher.cookie }, payload: { experimentStageId: setup.stageId } });
  assert.equal(assigned.statusCode, 201, assigned.body);
  const projects = await app.inject({ method: 'GET', url: '/api/projects',
    headers: { cookie: sessions.experiment.cookie } });
  assert.ok(projects.json().projects.some((item: { id: string }) => item.id === projectId));
  const activated = await app.inject({ method: 'POST', url: `/api/experiments/${setup.experimentId}/status`,
    headers: { cookie: sessions.teacher.cookie }, payload: { status: 'active' } });
  assert.equal(activated.statusCode, 200, activated.body);
  const invalid = await app.inject({ method: 'POST', url: `/api/experiments/${setup.experimentId}/status`,
    headers: { cookie: sessions.teacher.cookie }, payload: { status: 'unknown' } });
  assert.equal(invalid.statusCode, 400);
  await assertExperimentAudit(app, sessions, setup.experimentId);
  const withdrawn = await app.inject({ method: 'DELETE',
    url: `/api/experiments/${setup.experimentId}/participants/${participantId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(withdrawn.statusCode, 200, withdrawn.body);
}
function multipartBody(filename: string, content: string) {
  const boundary = '----translation-aiducator-test';
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { boundary, payload: Buffer.concat([head, Buffer.from(content), tail]) };
}

async function exerciseDocumentImport(app: FastifyInstance, sessions: TestSessions): Promise<void> {
  const upload = multipartBody('paragraphs.txt', 'One. Two.\n\nThree.');
  const headers = { cookie: sessions.student.cookie,
    'content-type': `multipart/form-data; boundary=${upload.boundary}` };
  const response = await app.inject({ method: 'POST', url: '/api/import/extract',
    headers, payload: upload.payload });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().paragraphCount, 2);
  assert.equal(response.json().text, 'One. Two.\n\nThree.');
  const events = await app.inject({ method: 'GET',
    url: '/api/admin/activity?eventType=document.text_extracted',
    headers: { cookie: sessions.admin.cookie } });
  assert.equal(events.statusCode, 200, events.body);
  assert.equal(events.json().events.length, 1);
}

async function exerciseServerModelConfig(app: FastifyInstance, sessions: TestSessions,
  baseUrl: string): Promise<string> {
  const saved = await app.inject({ method: 'POST', url: '/api/manage/server-models',
    headers: { cookie: sessions.teacher.cookie }, payload: { name: '课堂统一模型',
      provider: 'openai_compatible', baseUrl, model: 'mock-translation-model',
      apiKey: 'server-secret-key', isDefault: true, requestTimeoutMs: 10000, maxRetries: 1 } });
  assert.equal(saved.statusCode, 201, saved.body);
  for (const session of [sessions.teacher, sessions.admin]) {
    const listed = await app.inject({ method: 'GET', url: '/api/manage/server-models',
      headers: { cookie: session.cookie } });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.equal(listed.body.includes('server-secret-key'), false);
    assert.equal(listed.json().models[0].isDefault, 1);
  }
  for (const session of [sessions.student, sessions.experiment]) {
    const denied = await app.inject({ method: 'GET', url: '/api/manage/server-models',
      headers: { cookie: session.cookie } });
    assert.equal(denied.statusCode, 403);
  }
  const capability = await app.inject({ method: 'GET', url: '/api/ai/capabilities',
    headers: { cookie: sessions.student.cookie } });
  assert.equal(capability.json().serverModelAvailable, true);
  const tested = await app.inject({ method: 'POST',
    url: `/api/manage/server-models/${saved.json().id}/test`, headers: { cookie: sessions.teacher.cookie } });
  assert.equal(tested.statusCode, 200, tested.body);
  assert.equal(tested.json().ok, true);
  return saved.json().id;
}

async function exerciseProviderErrorDetail(app: FastifyInstance, sessions: TestSessions,
  baseUrl: string): Promise<void> {
  const saved = await app.inject({ method: 'POST', url: '/api/manage/server-models',
    headers: { cookie: sessions.teacher.cookie }, payload: { name: '上游无通道模型',
      provider: 'openai_compatible', baseUrl, model: 'no-channel-model', apiKey: 'test-key',
      isDefault: false, requestTimeoutMs: 10000, maxRetries: 0 } });
  assert.equal(saved.statusCode, 201, saved.body);
  const tested = await app.inject({ method: 'POST',
    url: `/api/manage/server-models/${saved.json().id}/test`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(tested.statusCode, 502, tested.body);
  assert.equal(tested.json().code, 'PROVIDER_HTTP_503');
  assert.match(tested.json().message, /No available channel for model no-channel-model/);
}
async function exerciseRealAiExecution(app: FastifyInstance, sessions: TestSessions,
  scenario: ProjectScenario): Promise<void> {
  const translation = await app.inject({ method: 'POST',
    url: `/api/workspaces/${scenario.workspaceId}/ai/execute`, headers: { cookie: sessions.student.cookie },
    payload: { segmentId: scenario.segmentId, promptVersionId: scenario.promptId,
      kind: 'ai_translation', requestId: 'real-translation-001' } });
  assert.equal(translation.statusCode, 201, translation.body);
  const repeatedTranslation = await app.inject({ method: 'POST',
    url: `/api/workspaces/${scenario.workspaceId}/ai/execute`, headers: { cookie: sessions.student.cookie },
    payload: { segmentId: scenario.segmentId, promptVersionId: scenario.promptId,
      kind: 'ai_translation', requestId: 'real-translation-001' } });
  assert.equal(repeatedTranslation.json().translationVersionId, translation.json().translationVersionId);
  const postEdit = await app.inject({ method: 'POST',
    url: `/api/workspaces/${scenario.workspaceId}/ai/execute`, headers: { cookie: sessions.student.cookie },
    payload: { segmentId: scenario.segmentId, promptVersionId: scenario.promptId,
      baseVersionId: translation.json().translationVersionId,
      kind: 'ai_post_edit', requestId: 'real-post-edit-001' } });
  assert.equal(postEdit.statusCode, 201, postEdit.body);
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${scenario.projectId}/snapshot?workspaceId=${scenario.workspaceId}`,
    headers: { cookie: sessions.student.cookie } });
  const segment = snapshot.json().project.segments.find((item: { id: string }) => item.id === scenario.segmentId);
  assert.equal(segment.currentTranslationId, postEdit.json().translationVersionId);
  assert.equal(segment.translations.find((item: { id: string }) => item.id === postEdit.json().translationVersionId).aiText,
    'Structurally revised target.');
}

async function exerciseNoModelProjectCreation(app: FastifyInstance, sessions: TestSessions): Promise<string> {
  const catalog = await app.inject({ method: 'GET', url: '/api/project-resources/catalog',
    headers: { cookie: sessions.teacher.cookie } });
  const templates = catalog.json().resources.filter((item: { projectId: string }) => item.projectId.startsWith('demo-') || item.projectId === 'a24-s1-sr1-20260803');
  assert.equal(templates.filter((item: { briefVersionId: string | null }) => item.briefVersionId).length, 4);
  const created = await app.inject({ method: 'POST', url: '/api/projects',
    headers: { cookie: sessions.teacher.cookie }, payload: { name: '待生成资源项目', direction: 'EN → ZH',
      sourceLanguage: 'en', targetLanguage: 'zh-CN', sourceText: 'First paragraph.\n\nSecond paragraph.',
      setup: { briefMode: 'auto', promptMode: 'auto' } } });
  assert.equal(created.statusCode, 201, created.body);
  const projectId = created.json().id;
  const projects = await app.inject({ method: 'GET', url: '/api/projects',
    headers: { cookie: sessions.teacher.cookie } });
  const project = projects.json().projects.find((item: { id: string }) => item.id === projectId);
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${projectId}/snapshot?workspaceId=${project.workspaceId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(snapshot.json().project.briefPendingGeneration, true);
  assert.ok(snapshot.json().project.prompts.some((item: { title: string }) => item.title === '待生成全文 Prompt'));
  const inherited = await app.inject({ method: 'POST', url: `/api/workspaces/${project.workspaceId}/active-prompt`,
    headers: { cookie: sessions.teacher.cookie }, payload: { promptVersionId: templates[0].promptVersionId } });
  assert.equal(inherited.statusCode, 200, inherited.body);
  const inheritedSnapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${projectId}/snapshot?workspaceId=${project.workspaceId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.ok(inheritedSnapshot.json().project.prompts.some((item: { title: string }) => item.title.startsWith('继承：')));
  return projectId;
}

async function exerciseEditedResourceInheritance(app: FastifyInstance,
  sessions: TestSessions): Promise<void> {
  const catalog = await app.inject({ method: 'GET', url: '/api/project-resources/catalog',
    headers: { cookie: sessions.teacher.cookie } });
  const source = catalog.json().resources.find(
    (item: { briefVersionId?: string; promptVersionId?: string }) => item.briefVersionId && item.promptVersionId,
  );
  assert.ok(source);
  const created = await app.inject({ method: 'POST', url: '/api/projects',
    headers: { cookie: sessions.teacher.cookie }, payload: { name: '编辑继承资源项目', direction: 'EN → ZH',
      sourceLanguage: 'en', targetLanguage: 'zh-CN', sourceText: 'Inherited resource source.', setup: {
        briefMode: 'inherit', briefVersionId: source.briefVersionId,
        briefContent: { strategy: 'Edited inherited strategy' },
        promptMode: 'inherit', promptVersionId: source.promptVersionId,
        promptContent: 'Edited inherited prompt',
      } } });
  assert.equal(created.statusCode, 201, created.body);
  const projects = await app.inject({ method: 'GET', url: '/api/projects',
    headers: { cookie: sessions.teacher.cookie } });
  const project = projects.json().projects.find((item: { id: string }) => item.id === created.json().id);
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${project.id}/snapshot?workspaceId=${project.workspaceId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(snapshot.json().project.brief.strategy, 'Edited inherited strategy');
  assert.ok(snapshot.json().project.brief.genre);
  const inheritedPrompt = snapshot.json().project.prompts.find(
    (item: { content: string }) => item.content === 'Edited inherited prompt');
  assert.equal(inheritedPrompt.parentPromptId, source.promptVersionId);
  assert.ok(inheritedPrompt.parentProjectName);
}
async function exerciseDeferredGeneration(app: FastifyInstance, sessions: TestSessions,
  projectId: string): Promise<void> {
  for (const resource of ['brief', 'prompt']) {
    const generated = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/${resource}/generate`,
      headers: { cookie: sessions.teacher.cookie }, payload: {} });
    assert.equal(generated.statusCode, 201, generated.body);
  }
  const projects = await app.inject({ method: 'GET', url: '/api/projects',
    headers: { cookie: sessions.teacher.cookie } });
  const project = projects.json().projects.find((item: { id: string }) => item.id === projectId);
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${projectId}/snapshot?workspaceId=${project.workspaceId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(snapshot.json().project.briefPendingGeneration, false);
  assert.ok(snapshot.json().project.prompts.some((item: { title: string }) => item.title === 'AI 生成全文 Prompt'));
}

async function exerciseUnavailableModelFallback(app: FastifyInstance, sessions: TestSessions,
  workingId: string, workingBaseUrl: string): Promise<void> {
  const bad = await app.inject({ method: 'POST', url: '/api/manage/server-models',
    headers: { cookie: sessions.teacher.cookie }, payload: { name: '不可用模型', provider: 'openai_compatible',
      baseUrl: 'http://127.0.0.1:1/v1', model: 'offline-model', apiKey: 'offline-key',
      isDefault: true, requestTimeoutMs: 5000, maxRetries: 0 } });
  assert.equal(bad.statusCode, 201, bad.body);
  const created = await app.inject({ method: 'POST', url: '/api/projects',
    headers: { cookie: sessions.teacher.cookie }, payload: { name: '模型失败降级项目', direction: 'EN → ZH',
      sourceLanguage: 'en', targetLanguage: 'zh-CN', sourceText: 'Fallback source.',
      setup: { briefMode: 'auto', promptMode: 'auto' } } });
  assert.equal(created.statusCode, 201, created.body);
  const projects = await app.inject({ method: 'GET', url: '/api/projects',
    headers: { cookie: sessions.teacher.cookie } });
  const project = projects.json().projects.find((item: { id: string }) => item.id === created.json().id);
  const snapshot = await app.inject({ method: 'GET',
    url: `/api/projects/${project.id}/snapshot?workspaceId=${project.workspaceId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(snapshot.json().project.briefPendingGeneration, true);
  assert.ok(snapshot.json().project.prompts.some((item: { title: string }) => item.title === '待生成全文 Prompt'));
  const restored = await app.inject({ method: 'POST', url: '/api/manage/server-models',
    headers: { cookie: sessions.teacher.cookie }, payload: { id: workingId, name: '课堂统一模型',
      provider: 'openai_compatible', baseUrl: workingBaseUrl, model: 'mock-translation-model', isDefault: true } });
  assert.equal(restored.statusCode, 201, restored.body);
}

async function exerciseProjectLifecycle(app: FastifyInstance, sessions: TestSessions,
  projectId: string, classId: string): Promise<void> {
  const unpublished = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/unpublish`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(unpublished.statusCode, 200, unpublished.body);
  const draftList = await app.inject({ method: 'GET', url: '/api/projects', headers: { cookie: sessions.teacher.cookie } });
  const draft = draftList.json().projects.find((item: { id: string }) => item.id === projectId);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.teachingAssignmentCount, 0);
  await app.inject({ method: 'POST', url: `/api/projects/${projectId}/publish`, headers: { cookie: sessions.teacher.cookie } });
  await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assignments`,
    headers: { cookie: sessions.teacher.cookie }, payload: { classId } });
  const removed = await app.inject({ method: 'DELETE', url: `/api/projects/${projectId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(removed.statusCode, 200, removed.body);
  const afterDelete = await app.inject({ method: 'GET', url: '/api/projects', headers: { cookie: sessions.teacher.cookie } });
  assert.equal(afterDelete.json().projects.some((item: { id: string }) => item.id === projectId), false);
}
async function exerciseLocalProjectSetup(app: FastifyInstance, sessions: TestSessions): Promise<void> {
  const sourceText = Array.from({ length: 12 }, (_, index) => `Source paragraph ${index + 1}.`).join('\n\n');
  const created = await app.inject({ method: 'POST', url: '/api/projects',
    headers: { cookie: sessions.teacher.cookie }, payload: { name: '本地双路径项目', direction: 'EN → ZH',
      sourceLanguage: 'en', targetLanguage: 'zh-CN', sourceText, setup: {
        briefMode: 'auto', promptMode: 'auto',
      } } });
  assert.equal(created.statusCode, 201, created.body);
  const projectId = created.json().id;
  const projects = await app.inject({ method: 'GET', url: '/api/projects',
    headers: { cookie: sessions.teacher.cookie } });
  const local = projects.json().projects.find((item: { id: string }) => item.id === projectId);
  assert.equal(local.isLocal, true);
  assert.equal(local.editable, true);
  assert.deepEqual(local.classTags, []);
  const snapshot = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/snapshot?workspaceId=${local.workspaceId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(snapshot.json().project.segments.length, 12);
  assert.equal(snapshot.json().project.brief.genre, 'academic article');
  assert.equal(snapshot.json().project.prompts.at(-1).content,
    'Translate the full document in a formal academic register.');
  const revised = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/briefs`,
    headers: { cookie: sessions.teacher.cookie }, payload: { content: {
      ...snapshot.json().project.brief, strategy: 'Teacher revised strategy',
    } } });
  assert.equal(revised.statusCode, 201, revised.body);
  const targetClass = await app.inject({ method: 'POST', url: '/api/classes',
    headers: { cookie: sessions.teacher.cookie }, payload: { name: '双路径班级', code: 'DUAL-01' } });
  await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assignments`,
    headers: { cookie: sessions.teacher.cookie }, payload: { classId: targetClass.json().id } });
  const assigned = await app.inject({ method: 'GET', url: '/api/projects',
    headers: { cookie: sessions.teacher.cookie } });
  const tagged = assigned.json().projects.find((item: { id: string }) => item.id === projectId);
  assert.equal(tagged.teachingAssignmentCount, 1);
  assert.deepEqual(tagged.classTags, ['双路径班级']);
  await exerciseProjectLifecycle(app, sessions, projectId, targetClass.json().id);
}
async function exerciseAdminAccountManagement(app: FastifyInstance,
  sessions: TestSessions): Promise<void> {
  const users = await app.inject({ method: 'GET', url: '/api/admin/users',
    headers: { cookie: sessions.admin.cookie } });
  assert.equal(users.statusCode, 200, users.body);
  const outsider = users.json().users.find((item: { username: string }) => item.username === 'student-b');
  assert.deepEqual(outsider.roles, ['student']);
  const reset = await app.inject({ method: 'POST', url: `/api/admin/users/${outsider.id}/reset-password`,
    headers: { cookie: sessions.admin.cookie } });
  assert.equal(reset.statusCode, 200, reset.body);
  assert.equal(reset.json().mustChangePassword, true);
  const revoked = await app.inject({ method: 'GET', url: '/api/auth/me',
    headers: { cookie: sessions.outsider.cookie } });
  assert.equal(revoked.statusCode, 401);
}
async function prepareStudentWorkspace(app: FastifyInstance, sessions: TestSessions) {
  const projects = await app.inject({ method: 'GET', url: '/api/projects',
    headers: { cookie: sessions.teacher.cookie } });
  const template = projects.json().projects.find(
    (item: { projectKind: string }) => item.projectKind === 'system_template',
  );
  assert.ok(template);
  const created = await createClassProject(app, sessions.teacher.cookie, template.id);
  const assignmentId = await addStudentAndAssign(app, sessions.teacher.cookie,
    created.classId, created.projectId, 'student-a');
  await exerciseTeachingManagement(app, sessions, created.classId, created.projectId, assignmentId);
  const workspace = await app.inject({ method: 'POST', url: `/api/assignments/${assignmentId}/workspaces`,
    headers: { cookie: sessions.student.cookie } });
  assert.equal(workspace.statusCode, 201, workspace.body);
  const opened = await app.inject({ method: 'POST', url: `/api/projects/${created.projectId}/workspace`,
    headers: { cookie: sessions.student.cookie } });
  assert.equal(opened.json().id, workspace.json().id);
  const denied = await app.inject({ method: 'GET', url: `/api/projects/${created.projectId}`,
    headers: { cookie: sessions.outsider.cookie } });
  assert.equal(denied.statusCode, 403);
  return { created, workspaceId: workspace.json().id };
}
async function runProjectScenario(app: FastifyInstance, sessions: TestSessions): Promise<ProjectScenario> {
  const setup = await prepareStudentWorkspace(app, sessions);
  const detail = await app.inject({ method: 'GET', url: `/api/projects/${setup.created.projectId}`,
    headers: { cookie: sessions.student.cookie } });
  const promptId = await createStudentPrompt(app, sessions.student.cookie, setup.created.projectId);
  await exercisePromptCollaboration(app, sessions.teacher.cookie, sessions.student.cookie,
    setup.created.projectId, setup.workspaceId, promptId);
  const translations = await app.inject({ method: 'GET',
    url: `/api/workspaces/${setup.workspaceId}/translations`, headers: { cookie: sessions.student.cookie } });
  const base = translations.json().translations.find(
    (item: { version_kind: string }) => item.version_kind === 'ai_translation',
  );
  assert.ok(base);
  const segmentId = detail.json().segments[0].id;
  const ids = await exercisePostEdit(app, sessions.student.cookie, setup.workspaceId,
    segmentId, base.id, promptId);
  await exerciseProjectSnapshot(app, sessions.student.cookie, setup.created.projectId,
    setup.workspaceId, segmentId, ids);
  return { projectId: setup.created.projectId, workspaceId: setup.workspaceId, segmentId, promptId };
}

function verifySessionLifetime(databasePath: string): void {
  const db = openDatabase(databasePath);
  try {
    const rows = db.prepare(`SELECT created_at, expires_at FROM sessions
      WHERE revoked_at IS NULL`).all() as Array<{ created_at: string; expires_at: string }>;
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 24 * 60 * 60 * 1000);
    }
  } finally { db.close(); }
}

function expireSessionsAndReadAdminHash(databasePath: string): string {
  const db = openDatabase(databasePath);
  try {
    const row = db.prepare(`SELECT password_hash AS hash FROM users
      WHERE username = 'root-admin'`).get() as { hash: string };
    db.prepare(`UPDATE sessions SET expires_at = ? WHERE revoked_at IS NULL`)
      .run(new Date(Date.now() - 60_000).toISOString());
    return row.hash;
  } finally { db.close(); }
}

function adminHash(databasePath: string): string {
  const db = openDatabase(databasePath);
  try { return (db.prepare("SELECT password_hash AS hash FROM users WHERE username = 'root-admin'").get() as { hash: string }).hash; }
  finally { db.close(); }
}
async function exerciseMigrationSafety(databasePath: string, backupDir: string): Promise<void> {
  const before = openDatabase(databasePath);
  const userCount = (before.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
  before.prepare(`INSERT INTO schema_migrations
    (id, name, checksum, release_version, applied_at) VALUES ('9999', 'future.sql', 'future', '9.9.9', ?)`)
    .run(new Date().toISOString());
  before.close();
  await assert.rejects(() => buildServer(databasePath, false), /数据库版本高于当前程序.*未知 migration 9999/);
  await assert.rejects(() => runMigrationDeployment(databasePath, backupDir),
    /数据库版本高于当前程序.*已从 .* 自动恢复/);
  const restored = openDatabase(databasePath);
  try {
    const unknown = restored.prepare("SELECT id FROM schema_migrations WHERE id = '9999'").get();
    const restoredUsers = (restored.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
    assert.ok(unknown);
    assert.equal(restoredUsers, userCount);
    assert.deepEqual(restored.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
    restored.prepare("DELETE FROM schema_migrations WHERE id = '9999'").run();
  } finally { restored.close(); }
}
async function exercisePromptInspector(app: FastifyInstance, sessions: TestSessions,
  scenario: ProjectScenario): Promise<void> {
  const url = `/api/manage/prompt-structures?projectId=${scenario.projectId}&workspaceId=${scenario.workspaceId}&segmentId=${scenario.segmentId}`;
  const result = await app.inject({ method: 'GET', url, headers: { cookie: sessions.admin.cookie } });
  assert.equal(result.statusCode, 200, result.body);
  const operation = result.json().operations.find((item: { id: string }) => item.id === 'translation');
  const payload = JSON.parse(operation.messages[1].content);
  assert.equal(typeof payload.overarchingPrompt, 'string');
  assert.ok(Array.isArray(payload.terminology) && Array.isArray(payload.translationMemory));
  const forbidden = await app.inject({ method: 'GET', url, headers: { cookie: sessions.teacher.cookie } });
  assert.equal(forbidden.statusCode, 403, forbidden.body);
}
test('发布版后端完成身份、隔离、模型调用和版本事件闭环', async () => {
  const mockModel = await startMockModel();
  const root = mkdtempSync(join(tmpdir(), 'translation-aiducator-test-'));
  delete process.env.PERSONAL_KEY_MASTER_KEY;
  process.env.SERVER_MODEL_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
  const databasePath = join(root, 'business.db');
  const backupDir = join(root, 'backups');
  try {
    const adminPassword = await prepareDatabase(databasePath);
    const app = await buildServer(databasePath, false);
    const sessions = await provisionSessions(app, adminPassword);
    verifySessionLifetime(databasePath);
    const scenario = await runProjectScenario(app, sessions);
    await exercisePromptInspector(app, sessions, scenario);
    const pendingProjectId = await exerciseNoModelProjectCreation(app, sessions);
    await exerciseEditedResourceInheritance(app, sessions);
    const serverModelId = await exerciseServerModelConfig(app, sessions, mockModel.baseUrl);
    await exerciseProviderErrorDetail(app, sessions, mockModel.baseUrl);
    await exerciseDeferredGeneration(app, sessions, pendingProjectId);
    await exerciseUnavailableModelFallback(app, sessions, serverModelId, mockModel.baseUrl);
    await exerciseLocalProjectSetup(app, sessions);
    await exerciseRealAiExecution(app, sessions, scenario);
    await exerciseDocumentImport(app, sessions);
    await exerciseExperimentManagement(app, sessions, scenario.projectId);
    await exercisePersonalKey(app, sessions.student.cookie);
    await exerciseAdminAccountManagement(app, sessions);
    await app.close();
    verifyDatabaseState(databasePath, scenario.projectId);
    const passwordHash = expireSessionsAndReadAdminHash(databasePath);
    const deployed = await runMigrationDeployment(databasePath, backupDir);
    assert.ok(existsSync(deployed.backupPath));
    assert.equal(adminHash(databasePath), passwordHash);
    await exerciseMigrationSafety(databasePath, backupDir);
  } finally { await mockModel.close(); }
});
