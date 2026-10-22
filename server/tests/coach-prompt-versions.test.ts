/**
 * 职责: 验证旧教练指令恢复、不可变版本、切换与账号隔离
 * 依赖内部: ../src/modules/coach-prompt-versions.ts, ../migrations/0015_coach_prompt_versions.sql
 * 依赖外部: node:assert, node:test, node:fs, better-sqlite3
 * 暴露: 教练 Prompt 版本与迁移回归测试
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { normalizedRules, getPromptCoachSettings } from '../src/modules/prompt-coach.js';
import { COACH_BASELINE_ID, DEFAULT_COACH_PROMPT, COACH_HARNESS } from '../src/modules/coach-baseline.js';
import { appendCoachAudit, coachAuditEvents } from '../src/modules/coach-audit.js';
import { appendAiRunAudit, readAiRunAudit } from '../src/modules/ai-run-audit.js';
import { activeCoachPrompt, coachPromptVersions, saveCoachPromptVersion,
  activateCoachPromptVersion } from '../src/modules/coach-prompt-versions.js';

function legacyDatabase() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY);
    INSERT INTO users VALUES ('u1'),('u2');
    CREATE TABLE prompt_coach_preferences (user_id TEXT PRIMARY KEY,custom_prompt TEXT,updated_at TEXT);
    CREATE TABLE prompt_coach_runs (id TEXT PRIMARY KEY,actor_user_id TEXT,coach_prompt_source TEXT,
      coach_prompt_text TEXT,created_at TEXT,result_json TEXT);
    CREATE TRIGGER prompt_coach_runs_no_update BEFORE UPDATE ON prompt_coach_runs BEGIN
      SELECT RAISE(ABORT, 'append only'); END;`);
  db.prepare('INSERT INTO prompt_coach_preferences VALUES (?,?,?)').run('u1', '当前尚未运行的指令', '2026-10-20');
  const insert = db.prepare('INSERT INTO prompt_coach_runs VALUES (?,?,?,?,?,?)');
  insert.run('r1', 'u1', 'custom', '早期教练指令', '2026-10-18', '{"rules":[]}');
  insert.run('r2', 'u1', 'custom', '早期教练指令', '2026-10-19', '{"rules":[]}');
  insert.run('r3', 'u1', 'default', '系统指令', '2026-10-19', '{"rules":[]}');
  const migration = readFileSync('server/migrations/0015_coach_prompt_versions.sql', 'utf8');
  db.transaction(() => db.exec(migration))();
  return { db, instanceId: 'test' };
}

test('带示例基线与实测提取 Prompt、系统输出契约逐字一致，升级不覆盖私有版本', () => {
  assert.equal(COACH_BASELINE_ID, 'example-backed-style-2026-10-22.v1');
  assert.equal(createHash('sha256').update(DEFAULT_COACH_PROMPT).digest('hex'),
    'c5e50f118128539b1509a9be890cf83ee60acf9ba56b89f58fc4c3bb5b932965');
  assert.equal(createHash('sha256').update(COACH_HARNESS).digest('hex'),
    '3c1752a7a2a76bb00569659183c532e767213a4977c095ba490582ea10ac1768');
  const context = legacyDatabase();
  try {
    const before = coachPromptVersions(context, 'u1');
    const custom = getPromptCoachSettings(context, 'u1') as any;
    assert.equal(custom.effectivePrompt, '当前尚未运行的指令');
    assert.equal(custom.defaultPrompt, DEFAULT_COACH_PROMPT);
    assert.equal(custom.baselineId, COACH_BASELINE_ID);
    const defaults = getPromptCoachSettings(context, 'u2') as any;
    assert.equal(defaults.effectivePrompt, DEFAULT_COACH_PROMPT);
    assert.equal(defaults.activeVersionId, 'default');
    assert.deepEqual(coachPromptVersions(context, 'u1'), before);
  } finally { context.db.close(); }
});

test('带示例输出结构保持兼容，示例原文不裁剪，按独立支持记录数排序', () => {
  const records = ['r1', 'r2'].map((recordId) => ({ recordId, projectId: 'p', projectName: '项目',
    workspaceId: 'w', segmentId: recordId, sourceText: 'She said, “Hello.”',
    aiText: '“你好，”她说道。', postEditText: '她说：“你好。”', diff: [{ type: 'same', value: '你好' }] }));
  const instruction = '引语较长时先交代说话者。\nAI 原译：“你好，”她说道。\n人工改写：她说：“你好。”\n先明确归属，再展开引语。';
  const rules = normalizedRules(JSON.stringify({ rules: [
    { id: 'one', category: '口吻', title: '单例', instruction, signal: '单例候选', evidenceRecordIds: ['r1'] },
    { id: 'two', category: '口吻', title: '重复', instruction, signal: '重复案例', evidenceRecordIds: ['r1', 'r2', 'r2'] },
  ] }), records);
  assert.deepEqual(rules.map((rule) => rule.id), ['two', 'one']);
  assert.deepEqual(rules.map((rule) => rule.supportCount), [2, 1]);
  assert.deepEqual(rules.map((rule) => rule.supportTier), ['repeated', 'candidate']);
  assert.equal(rules[0]!.instruction, instruction);
  assert.deepEqual(Object.keys(rules[0]!).sort(),
    ['id', 'category', 'title', 'instruction', 'supportCount', 'supportTier', 'evidence'].sort());
  assert.equal(rules[1]!.evidence[0]!.signal, '单例候选');
});

test('迁移同时恢复历史指令与当前草稿，保留原运行内容和绑定', () => {
  const context = legacyDatabase();
  try {
    const versions = coachPromptVersions(context, 'u1');
    assert.equal(versions.length, 2);
    assert.equal(activeCoachPrompt(context, 'u1')?.content, '当前尚未运行的指令');
    const runs = context.db.prepare('SELECT coach_prompt_version_id AS id,result_json FROM prompt_coach_runs ORDER BY prompt_coach_runs.id').all() as Array<{ id: string | null; result_json: string }>;
    assert.equal(runs[0]!.id, runs[1]!.id);
    assert.ok(runs[0]!.id);
    assert.equal(runs[2]!.id, null);
    assert.ok(runs.every((run) => run.result_json === '{"rules":[]}'));
    assert.throws(() => context.db.exec("UPDATE coach_prompt_versions SET title='overwrite'"), /append only/);
    assert.throws(() => context.db.exec('DELETE FROM coach_prompt_versions'), /append only/);
  } finally { context.db.close(); }
});

test('切换旧版本后继续编辑仍递增编号，其他账号不能选择或继承', () => {
  const context = legacyDatabase();
  try {
    const old = coachPromptVersions(context, 'u1').at(-1)!;
    activateCoachPromptVersion(context, 'u1', old.id);
    const nextId = saveCoachPromptVersion(context, 'u1', '修改后的新指令', { title: '引语优化', parentVersionId: old.id });
    assert.equal(activeCoachPrompt(context, 'u1')?.version, 3);
    assert.equal(activeCoachPrompt(context, 'u1')?.parentVersionId, old.id);
    assert.equal(saveCoachPromptVersion(context, 'u1', '修改后的新指令'), nextId);
    assert.equal(coachPromptVersions(context, 'u1').length, 3);
    assert.throws(() => activateCoachPromptVersion(context, 'u2', old.id), /不存在/);
    assert.throws(() => saveCoachPromptVersion(context, 'u2', '指令', { parentVersionId: old.id }), /不存在/);
    activateCoachPromptVersion(context, 'u1', 'default');
    assert.equal(activeCoachPrompt(context, 'u1'), null);
    assert.equal(coachPromptVersions(context, 'u1').length, 3);
    activateCoachPromptVersion(context, 'u1', nextId);
    assert.equal(activeCoachPrompt(context, 'u1')?.title, '引语优化');
  } finally { context.db.close(); }
});

test('风格类别不受句法枚举限制，过滤记录保留无效证据和原因', () => {
  const records = [{ recordId: 'r', projectId: 'p', projectName: '项目', workspaceId: 'w',
    segmentId: 's', sourceText: 'Source', aiText: 'AI', postEditText: 'Human', diff: [] }];
  let audit: any;
  const rules = normalizedRules(JSON.stringify({ rules: [
    { id: 'warm', category: 'warmth-and-rhythm', instruction: '让情感从动作中流露', evidenceRecordIds: ['r', 'fake', 'r'] },
    { id: 'bad', instruction: '无效证据', evidenceRecordIds: ['fake'] },
    { id: 'empty', instruction: ' ', evidenceRecordIds: ['r'] }, null,
  ] }), records, (value) => { audit = value; });
  assert.equal(rules.length, 1);
  assert.equal(rules[0]!.category, 'warmth-and-rhythm');
  assert.equal(rules[0]!.supportCount, 1);
  assert.deepEqual(audit.rules[0].invalidEvidenceIds, ['fake']);
  assert.deepEqual(audit.rules[0].retainedEvidenceIds, ['r']);
  assert.deepEqual(audit.rules[1].reasons, ['no_valid_evidence']);
  assert.ok(audit.rules[2].reasons.includes('missing_instruction'));
  assert.equal(audit.rules[3].accepted, false);
  assert.deepEqual(normalizedRules('{"rules":[]}', records), []);
  assert.throws(() => normalizedRules('not JSON', records, (v) => { audit = v; }), /有效 JSON/);
  assert.equal(audit.formatValid, false);
});

test('教练审计追加不可变，按账号隔离且不改动旧历史', () => {
  const context = legacyDatabase();
  try {
    context.db.exec(readFileSync('server/migrations/0016_coach_audit_events.sql', 'utf8'));
    appendCoachAudit(context, 'u1', 'req', 'request', { body: { model: 'demo', messages: [] } });
    appendCoachAudit(context, 'u1', 'req', 'response', { rawBody: 'not JSON', status: 200 });
    assert.equal(coachAuditEvents(context, 'u1', 'req').length, 2);
    assert.deepEqual(coachAuditEvents(context, 'u2', 'req'), []);
    assert.throws(() => context.db.exec("UPDATE prompt_coach_audit_events SET request_id='other'"), /append only/);
    assert.throws(() => context.db.exec('DELETE FROM prompt_coach_audit_events'), /append only/);
    assert.equal((context.db.prepare('SELECT COUNT(*) AS n FROM prompt_coach_runs').get() as { n: number }).n, 3);
  } finally { context.db.close(); }
});

test('全文运行审计不可变、独立于原版本且按运行所有者隔离', () => {
  const context = legacyDatabase();
  try {
    context.db.exec(`CREATE TABLE ai_runs(id TEXT PRIMARY KEY,actor_user_id TEXT,operation_type TEXT,
      status TEXT,model TEXT,request_id TEXT,started_at TEXT);
      INSERT INTO ai_runs VALUES('run','u1','ai_post_edit','succeeded','mock','request','2026-10-22');`);
    context.db.exec(readFileSync('server/migrations/0017_ai_run_audit_events.sql', 'utf8'));
    appendAiRunAudit(context, 'run', 'request', { body: { messages: [] } });
    appendAiRunAudit(context, 'run', 'response', { status: 200, rawBody: '{"choices":[]}' });
    const user = { id: 'u1', username: 'u1', displayName: '用户', roles: [] as [], mustChangePassword: false };
    const audit = readAiRunAudit(context, user, 'run') as { events: unknown[] };
    assert.equal(audit.events.length, 2);
    assert.throws(() => readAiRunAudit(context, { ...user, id: 'u2' }, 'run'), /不存在/);
    assert.throws(() => context.db.exec("UPDATE ai_run_audit_events SET event_type='error'"), /append only/);
    assert.throws(() => context.db.exec('DELETE FROM ai_run_audit_events'), /append only/);
    assert.deepEqual(context.db.pragma('foreign_key_check'), []);
  } finally { context.db.close(); }
});
