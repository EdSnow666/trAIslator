/**
 * 职责: 追加教练实际请求、原始响应及过滤轨迹，隔离读取当前账号审计
 * 依赖内部: ../context.ts, ../shared.ts
 * 依赖外部: 无
 * 暴露: appendCoachAudit | coachAuditEvents
 */
import type { AppContext } from '../context.js';
import { newId, nowIso, jsonText } from '../shared.js';

export function appendCoachAudit(context: AppContext, userId: string, requestId: string,
  type: 'request' | 'response' | 'validation' | 'error', payload: unknown): void {
  context.db.prepare(`INSERT INTO prompt_coach_audit_events
    (id,actor_user_id,request_id,event_type,payload_json,created_at) VALUES (?,?,?,?,?,?)`)
    .run(newId(), userId, requestId, type, jsonText(payload), nowIso());
}

export function coachAuditEvents(context: AppContext, userId: string, requestId: string): unknown[] {
  const rows = context.db.prepare(`SELECT event_type AS type,payload_json AS payload,created_at AS createdAt
    FROM prompt_coach_audit_events WHERE actor_user_id=? AND request_id=? ORDER BY rowid`)
    .all(userId, requestId) as Array<{ type: string; payload: string; createdAt: string }>;
  return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
}
