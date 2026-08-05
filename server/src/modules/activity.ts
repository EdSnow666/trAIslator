/**
 * 职责: 追加记录有业务意义的用户和系统活动事件
 * 依赖内部: ../context.ts, ../shared.ts
 * 依赖外部: 无
 * 暴露: recordActivity | ActivityInput
 */

import type { AppContext } from '../context.js';
import { jsonText, newId, nowIso } from '../shared.js';

export interface ActivityInput {
  eventType: string;
  actorKind?: 'user' | 'system';
  actorUserId?: string | null;
  actorSessionId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  segmentId?: string | null;
  promptVersionId?: string | null;
  translationVersionId?: string | null;
  requestId?: string | null | undefined;
  correlationId?: string | null;
  metadata?: unknown;
}

export function recordActivity(context: AppContext, input: ActivityInput): string {
  const id = newId();
  context.db.prepare(`INSERT INTO activity_events (
    id, event_type, actor_kind, actor_user_id, actor_session_id, project_id, workspace_id,
    segment_id, prompt_version_id, translation_version_id, request_id, correlation_id,
    event_schema_version, metadata_json, origin_instance_id, occurred_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
    .run(id, input.eventType, input.actorKind || 'user', input.actorUserId || null,
      input.actorSessionId || null, input.projectId || null, input.workspaceId || null,
      input.segmentId || null, input.promptVersionId || null, input.translationVersionId || null,
      input.requestId || null, input.correlationId || null, jsonText(input.metadata),
      context.instanceId, nowIso());
  return id;
}