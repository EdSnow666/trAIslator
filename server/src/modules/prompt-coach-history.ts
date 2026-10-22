/**
 * 职责: 读取当前账号持久化的教练历史、完整结果及项目最近结果
 * 依赖内部: ../context.ts, ../auth/types.ts, ../errors.ts, ./coach-audit.ts
 * 依赖外部: 无
 * 暴露: listCoachHistory | coachHistoryDetail | latestProjectCoachResult | coachAttemptDetail
 */

import type { AppContext } from '../context.js';
import type { AuthUser } from '../auth/types.js';
import { AppError } from '../errors.js';
import { coachAuditEvents } from './coach-audit.js';

const projectMatch = `(r.project_id = ? OR EXISTS (
  SELECT 1 FROM json_each(r.selected_project_ids_json) WHERE value = ?)
  OR EXISTS (SELECT 1 FROM json_each(r.input_snapshot_json)
    WHERE json_extract(value, '$.projectId') = ?))`;

export function latestProjectCoachResult(context: AppContext, userId: string,
  projectId: string): unknown | null {
  const row = context.db.prepare(`SELECT r.result_json FROM prompt_coach_runs r
    WHERE r.actor_user_id = ? AND ${projectMatch}
    ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1`)
    .get(userId, projectId, projectId, projectId) as { result_json: string } | undefined;
  return row ? JSON.parse(row.result_json) : null;
}

function pageOffset(value: unknown): number {
  const offset = Number(value || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new AppError(400, 'COACH_HISTORY_OFFSET_INVALID', '历史记录分页参数无效。');
  }
  return offset;
}

export function listCoachHistory(context: AppContext, user: AuthUser,
  projectId?: string, offsetValue?: unknown): unknown {
  const offset = pageOffset(offsetValue);
  const args = projectId ? [user.id, projectId, projectId, projectId] : [user.id];
  const filter = `r.actor_user_id = ?${projectId ? ` AND ${projectMatch}` : ''}`;
  const runs = context.db.prepare(`SELECT r.id, r.scope_type AS scopeType,
    r.created_at AS createdAt, r.input_record_count AS inputRecordCount,
    json_array_length(r.result_json, '$.rules') AS ruleCount,
    json_extract(r.result_json, '$.model') AS model,
    COALESCE(p.name, c.name) AS scopeName
    FROM prompt_coach_runs r LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN classes c ON r.scope_type = 'class' AND c.id = r.scope_id
    WHERE ${filter} ORDER BY r.created_at DESC, r.rowid DESC LIMIT 50 OFFSET ?`)
    .all(...args, offset);
  const total = context.db.prepare(`SELECT count(*) AS total FROM prompt_coach_runs r
    WHERE ${filter}`).get(...args) as { total: number };
  const failures = context.db.prepare(`SELECT a.request_id AS requestId,MAX(a.created_at) AS createdAt
    FROM prompt_coach_audit_events a WHERE a.actor_user_id=? AND a.event_type='error'
    AND NOT EXISTS (SELECT 1 FROM prompt_coach_runs r WHERE r.actor_user_id=a.actor_user_id AND r.request_id=a.request_id)
    ${projectId ? `AND EXISTS (SELECT 1 FROM prompt_coach_audit_events req,json_each(req.payload_json,'$.projectIds') p
      WHERE req.actor_user_id=a.actor_user_id AND req.request_id=a.request_id AND req.event_type IN ('request','error') AND p.value=?)` : ''}
    GROUP BY a.request_id ORDER BY createdAt DESC LIMIT 50`).all(user.id, ...(projectId ? [projectId] : []));
  return { runs, failedAttempts: failures, total: total.total, offset, pageSize: 50 };
}

export function coachHistoryDetail(context: AppContext, user: AuthUser, id: string): unknown {
  const row = context.db.prepare(`SELECT id, request_id AS requestId, created_at AS createdAt,
    coach_prompt_version_id AS coachPromptVersionId,
    coach_prompt_text AS coachPrompt, input_snapshot_json AS inputSnapshot,
    result_json AS result FROM prompt_coach_runs WHERE id = ? AND actor_user_id = ?`)
    .get(id, user.id) as { id: string; requestId: string; createdAt: string; coachPrompt: string | null;
      inputSnapshot: string; result: string } | undefined;
  if (!row) throw new AppError(404, 'COACH_HISTORY_NOT_FOUND', '教练运行记录不存在。');
  const version = context.db.prepare(`SELECT version_number AS version,title FROM coach_prompt_versions
    WHERE id=(SELECT coach_prompt_version_id FROM prompt_coach_runs WHERE id=?)`)
    .get(id) as { version: number; title: string } | undefined;
  return { ...row, coachPromptVersion: version || null,
    audit: coachAuditEvents(context, user.id, row.requestId),
    inputSnapshot: JSON.parse(row.inputSnapshot), result: JSON.parse(row.result) };
}

export function coachAttemptDetail(context: AppContext, user: AuthUser, requestId: string): unknown {
  const audit = coachAuditEvents(context, user.id, requestId);
  if (!audit.length) throw new AppError(404, 'COACH_AUDIT_NOT_FOUND', '教练审计记录不存在。');
  return { id: requestId, requestId, result: null, audit };
}
