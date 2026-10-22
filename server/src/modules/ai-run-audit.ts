/**
 * 职责: 保存全文 AI 运行实际请求、原始响应及校验轨迹，隔离读取本人记录
 * 依赖内部: ../context.ts, ../auth/types.ts, ../errors.ts, ../shared.ts
 * 依赖外部: 无
 * 暴露: appendAiRunAudit | readAiRunAudit | listAiRunAudits
 */
import type { AppContext } from '../context.js';
import type { AuthUser } from '../auth/types.js';
import { AppError } from '../errors.js';
import { newId, nowIso, jsonText } from '../shared.js';

export function appendAiRunAudit(context: AppContext, runId: string,
  type: 'request' | 'response' | 'validation' | 'error', payload: unknown): void {
  context.db.prepare(`INSERT INTO ai_run_audit_events
    (id,ai_run_id,event_type,payload_json,created_at) VALUES (?,?,?,?,?)`)
    .run(newId(), runId, type, jsonText(payload), nowIso());
}

export function readAiRunAudit(context: AppContext, user: AuthUser, runId: string): unknown {
  const run = context.db.prepare(`SELECT id,operation_type AS kind,status,model,
    request_id AS requestId,started_at AS startedAt FROM ai_runs WHERE id=? AND actor_user_id=?`)
    .get(runId, user.id);
  if (!run) throw new AppError(404, 'AI_RUN_NOT_FOUND', 'AI 运行记录不存在。');
  const rows = context.db.prepare(`SELECT event_type AS type,payload_json AS payload,created_at AS createdAt
    FROM ai_run_audit_events WHERE ai_run_id=? ORDER BY rowid`).all(runId) as
    Array<{ type: string; payload: string; createdAt: string }>;
  return { run, events: rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) })) };
}

export function listAiRunAudits(context: AppContext, user: AuthUser, projectId?: string): unknown {
  const runs = context.db.prepare(`SELECT id,operation_type AS kind,status,model,
    request_id AS requestId,started_at AS startedAt FROM ai_runs r WHERE actor_user_id=?
    AND EXISTS (SELECT 1 FROM ai_run_audit_events e WHERE e.ai_run_id=r.id)
    ${projectId ? 'AND project_id=?' : ''} ORDER BY started_at DESC,r.rowid DESC LIMIT 50`)
    .all(user.id, ...(projectId ? [projectId] : []));
  return { runs };
}
