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
