/**
 * 职责: 管理账号私有、不可变的教练 Prompt 版本和当前使用指针
 * 依赖内部: ../context.ts, ../errors.ts, ../shared.ts
 * 依赖外部: 无
 * 暴露: coachPromptVersions | activeCoachPrompt | saveCoachPromptVersion | activateCoachPromptVersion
 */

import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { newId, nowIso } from '../shared.js';

export interface CoachPromptVersion {
  id: string; version: number; title: string; content: string;
  parentVersionId: string | null; createdAt: string;
}
export interface CoachVersionInput { title?: string; parentVersionId?: string | null }

export function coachPromptVersions(context: AppContext, userId: string): CoachPromptVersion[] {
  return context.db.prepare(`SELECT id,version_number AS version,title,content,
    parent_version_id AS parentVersionId,created_at AS createdAt FROM coach_prompt_versions
    WHERE owner_user_id=? ORDER BY version_number DESC`).all(userId) as CoachPromptVersion[];
}

export function activeCoachPrompt(context: AppContext, userId: string): CoachPromptVersion | null {
  return context.db.prepare(`SELECT v.id,v.version_number AS version,v.title,v.content,
    v.parent_version_id AS parentVersionId,v.created_at AS createdAt FROM prompt_coach_preferences p
    JOIN coach_prompt_versions v ON v.id=p.active_version_id AND v.owner_user_id=p.user_id
    WHERE p.user_id=?`).get(userId) as CoachPromptVersion | undefined || null;
}

function ownedVersion(context: AppContext, userId: string, id: string): void {
  if (!context.db.prepare('SELECT 1 FROM coach_prompt_versions WHERE id=? AND owner_user_id=?').get(id, userId)) {
    throw new AppError(404, 'COACH_PROMPT_VERSION_NOT_FOUND', '教练 Prompt 版本不存在。');
  }
}

function writeCurrent(context: AppContext, userId: string, id: string | null, content: string | null): void {
  context.db.prepare(`INSERT INTO prompt_coach_preferences (user_id,custom_prompt,active_version_id,updated_at)
    VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET custom_prompt=excluded.custom_prompt,
      active_version_id=excluded.active_version_id,updated_at=excluded.updated_at`)
    .run(userId, content, id, nowIso());
}

export function activateCoachPromptVersion(context: AppContext, userId: string, id: string): void {
  if (id === 'default') { writeCurrent(context, userId, null, null); return; }
  ownedVersion(context, userId, id);
  const row = context.db.prepare('SELECT content FROM coach_prompt_versions WHERE id=?').get(id) as { content: string };
  writeCurrent(context, userId, id, row.content);
}

export function saveCoachPromptVersion(context: AppContext, userId: string,
  content: string, input: CoachVersionInput = {}): string {
  if (input.title !== undefined && typeof input.title !== 'string') {
    throw new AppError(400, 'COACH_PROMPT_TITLE_INVALID', '版本名称必须是文本。');
  }
  if (input.parentVersionId != null && typeof input.parentVersionId !== 'string') {
    throw new AppError(400, 'COACH_PROMPT_PARENT_INVALID', '基础版本无效。');
  }
  const title = input.title?.trim() || '';
  if (title.length > 120) throw new AppError(400, 'COACH_PROMPT_TITLE_TOO_LONG', '版本名称不能超过120字符。');
  return context.db.transaction(() => {
    const current = activeCoachPrompt(context, userId);
    const parent = input.parentVersionId === 'default' ? null : input.parentVersionId || current?.id || null;
    if (parent) ownedVersion(context, userId, parent);
    if (current?.content === content && (!title || title === current.title)) return current.id;
    const next = context.db.prepare(`SELECT COALESCE(MAX(version_number),0)+1 AS n
      FROM coach_prompt_versions WHERE owner_user_id=?`).get(userId) as { n: number };
    const id = newId();
    context.db.prepare(`INSERT INTO coach_prompt_versions
      (id,owner_user_id,version_number,title,content,parent_version_id,created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(id, userId, next.n, title || `教练 Prompt v${next.n}`, content, parent, nowIso());
    writeCurrent(context, userId, id, content);
    return id;
  }).immediate();
}
