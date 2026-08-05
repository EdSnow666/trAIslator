/**
 * 职责: 在无网页登录态时初始化或恢复管理员账号
 * 依赖内部: ../context.ts, ../modules/activity.ts, ../modules/users.ts
 * 依赖外部: 无
 * 暴露: initializeAdmin | resetAdminPassword
 */

import type { AppContext } from '../context.js';
import { recordActivity } from '../modules/activity.js';
import { createUser, resetPassword } from '../modules/users.js';
import { normalizeUsername } from '../auth/repository.js';

function adminCount(context: AppContext): number {
  const row = context.db.prepare(`SELECT COUNT(*) AS count FROM user_roles WHERE role_code = 'admin'`).get() as { count: number };
  return row.count;
}

export async function initializeAdmin(context: AppContext, username: string, displayName: string): Promise<{ username: string; password: string }> {
  if (adminCount(context)) throw new Error('管理员已存在，请使用 admin:reset-password。');
  const result = await createUser(context, { username, displayName, roles: ['admin'], assignedBy: null });
  recordActivity(context, { eventType: 'admin.initialized', actorKind: 'system',
    metadata: { userId: result.id, username } });
  return { username, password: result.password };
}

export async function resetAdminPassword(context: AppContext, username: string): Promise<{ username: string; password: string }> {
  const row = context.db.prepare(`SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id
    WHERE u.username_normalized = ? AND r.role_code = 'admin' AND u.deleted_at IS NULL`)
    .get(normalizeUsername(username)) as { id: string } | undefined;
  if (!row) throw new Error('管理员账号不存在。');
  const password = await resetPassword(context, row.id);
  recordActivity(context, { eventType: 'admin.password_reset_offline', actorKind: 'system',
    metadata: { userId: row.id, username } });
  return { username, password };
}