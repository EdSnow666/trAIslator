/**
 * 职责: 验证班级解散与管理员账号管理生命周期
 * 依赖内部: 无
 * 依赖外部: node:assert, fastify
 * 暴露: exerciseClassDissolveWithAssignment | exerciseAdminAccountManagement
 */

import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

interface Session { cookie: string }
interface SessionSet { admin: Session; teacher: Session; outsider: Session }

export async function exerciseAdminAccountManagement(app: FastifyInstance,
  sessions: SessionSet): Promise<void> {
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

export async function exerciseClassDissolveWithAssignment(app: FastifyInstance,
  sessions: SessionSet, projectId: string): Promise<void> {
  const created = await app.inject({ method: 'POST', url: '/api/classes',
    headers: { cookie: sessions.teacher.cookie }, payload: { name: '待解散班级', code: 'CLOSE-01' } });
  assert.equal(created.statusCode, 201, created.body);
  const classId = created.json().id;
  const assigned = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assignments`,
    headers: { cookie: sessions.teacher.cookie }, payload: { classId } });
  assert.equal(assigned.statusCode, 201, assigned.body);
  const dissolved = await app.inject({ method: 'DELETE', url: `/api/classes/${classId}`,
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(dissolved.statusCode, 200, dissolved.body);
  const classes = await app.inject({ method: 'GET', url: '/api/classes',
    headers: { cookie: sessions.teacher.cookie } });
  assert.equal(classes.json().classes.some((item: { id: string }) => item.id === classId), false);
}
