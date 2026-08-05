/**
 * 职责: 创建、查询和重置用户账号及其多角色关系
 * 依赖内部: ../auth/password.ts, ../auth/repository.ts, ../auth/types.ts, ../context.ts, ../errors.ts, ../shared.ts
 * 依赖外部: 无
 * 暴露: createUser | listUsers | resetPassword | UserCreateInput
 */

import { hashPassword, randomInitialPassword } from '../auth/password.js';
import { normalizeUsername } from '../auth/repository.js';
import type { RoleCode } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { newId, nowIso } from '../shared.js';

export interface UserCreateInput {
  username: string;
  displayName: string;
  roles: RoleCode[];
  password?: string;
  assignedBy?: string | null;
}

interface UserListRow {
  id: string;
  username: string;
  displayName: string;
  status: string;
  mustChangePassword: number;
  createdAt: string;
  rolesJson: string;
}

function validateRoles(roles: RoleCode[]): RoleCode[] {
  const allowed = new Set<RoleCode>(['admin', 'teacher', 'student', 'experiment_user']);
  const unique = [...new Set(roles)];
  if (!unique.length || unique.some((role) => !allowed.has(role))) throw new AppError(400, 'INVALID_ROLE', '角色无效。');
  return unique;
}

function validateUserFields(input: UserCreateInput): void {
  if (!input.username.trim() || !input.displayName.trim()) {
    throw new AppError(400, 'USER_FIELDS_REQUIRED', '用户名和显示名称不能为空。');
  }
}

function insertRoles(context: AppContext, userId: string, roles: RoleCode[],
  assignedBy: string | null, time: string): void {
  const insert = context.db.prepare(`INSERT INTO user_roles
    (user_id, role_code, assigned_by, assigned_at) VALUES (?, ?, ?, ?)`);
  roles.forEach((role) => insert.run(userId, role, assignedBy, time));
}

export async function createUser(context: AppContext, input: UserCreateInput): Promise<{ id: string; password: string }> {
  validateUserFields(input);
  const password = input.password || randomInitialPassword();
  const passwordHash = await hashPassword(password);
  const roles = validateRoles(input.roles);
  const id = newId();
  const time = nowIso();
  context.db.transaction(() => {
    context.db.prepare(`INSERT INTO users (id, username, username_normalized, display_name,
      password_hash, must_change_password, password_changed_at, origin_instance_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .run(id, input.username.trim(), normalizeUsername(input.username), input.displayName.trim(),
        passwordHash, time, context.instanceId, time, time);
    insertRoles(context, id, roles, input.assignedBy || null, time);
  }).immediate();
  return { id, password };
}

export function listUsers(context: AppContext): unknown[] {
  const rows = context.db.prepare(`SELECT u.id, u.username, u.display_name AS displayName, u.status,
      u.must_change_password AS mustChangePassword, u.created_at AS createdAt,
      json_group_array(ur.role_code) AS rolesJson
    FROM users u JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.deleted_at IS NULL GROUP BY u.id ORDER BY u.created_at`).all() as UserListRow[];
  return rows.map(({ rolesJson, mustChangePassword, ...row }) => ({ ...row,
    mustChangePassword: Boolean(mustChangePassword), roles: JSON.parse(rolesJson) as RoleCode[] }));
}

export async function resetPassword(context: AppContext, userId: string): Promise<string> {
  const password = randomInitialPassword();
  const passwordHash = await hashPassword(password);
  const time = nowIso();
  context.db.transaction(() => {
    const result = context.db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 1,
      password_changed_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ? AND deleted_at IS NULL`)
      .run(passwordHash, time, time, userId);
    if (!result.changes) throw new AppError(404, 'USER_NOT_FOUND', '用户不存在。');
    context.db.prepare(`UPDATE sessions SET revoked_at = ?, revoke_reason = 'password_reset'
      WHERE user_id = ? AND revoked_at IS NULL`).run(time, userId);
  }).immediate();
  return password;
}