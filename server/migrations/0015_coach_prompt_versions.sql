CREATE TABLE coach_prompt_versions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 8000),
  parent_version_id TEXT REFERENCES coach_prompt_versions(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE (owner_user_id, version_number)
) STRICT;

-- 将历史运行实际使用的自定义指令恢复为版本，保留原始时间和内容。
INSERT INTO coach_prompt_versions (id, owner_user_id, version_number, title, content, created_at)
SELECT 'coach-run:' || first_id, actor_user_id,
  ROW_NUMBER() OVER (PARTITION BY actor_user_id ORDER BY first_at, first_id),
  '历史教练 Prompt', coach_prompt_text, first_at
FROM (SELECT actor_user_id, coach_prompt_text, MIN(id) AS first_id, MIN(created_at) AS first_at
  FROM prompt_coach_runs WHERE coach_prompt_source = 'custom'
    AND length(trim(coach_prompt_text)) > 0 GROUP BY actor_user_id, coach_prompt_text);

-- 当前偏好中尚未出现在运行记录里的草稿同样保留。
INSERT INTO coach_prompt_versions (id, owner_user_id, version_number, title, content, created_at)
SELECT 'coach-preference:' || p.user_id, p.user_id,
  COALESCE((SELECT MAX(v.version_number) FROM coach_prompt_versions v WHERE v.owner_user_id = p.user_id), 0) + 1,
  '原自定义教练 Prompt', p.custom_prompt, p.updated_at
FROM prompt_coach_preferences p WHERE length(trim(p.custom_prompt)) > 0
  AND NOT EXISTS (SELECT 1 FROM coach_prompt_versions v
    WHERE v.owner_user_id = p.user_id AND v.content = p.custom_prompt);

ALTER TABLE prompt_coach_preferences ADD COLUMN active_version_id TEXT
  REFERENCES coach_prompt_versions(id) ON DELETE RESTRICT;
UPDATE prompt_coach_preferences SET active_version_id = (SELECT v.id FROM coach_prompt_versions v
  WHERE v.owner_user_id = prompt_coach_preferences.user_id AND v.content = prompt_coach_preferences.custom_prompt
  ORDER BY version_number DESC LIMIT 1);

ALTER TABLE prompt_coach_runs ADD COLUMN coach_prompt_version_id TEXT
  REFERENCES coach_prompt_versions(id) ON DELETE RESTRICT;
DROP TRIGGER prompt_coach_runs_no_update;
UPDATE prompt_coach_runs SET coach_prompt_version_id = (SELECT v.id FROM coach_prompt_versions v
  WHERE v.owner_user_id = prompt_coach_runs.actor_user_id AND v.content = prompt_coach_runs.coach_prompt_text
  ORDER BY v.version_number LIMIT 1) WHERE coach_prompt_source = 'custom';
CREATE TRIGGER prompt_coach_runs_no_update BEFORE UPDATE ON prompt_coach_runs BEGIN
  SELECT RAISE(ABORT, 'prompt_coach_runs are append only');
END;

CREATE TRIGGER coach_prompt_versions_no_update BEFORE UPDATE ON coach_prompt_versions BEGIN
  SELECT RAISE(ABORT, 'coach_prompt_versions are append only');
END;
CREATE TRIGGER coach_prompt_versions_no_delete BEFORE DELETE ON coach_prompt_versions BEGIN
  SELECT RAISE(ABORT, 'coach_prompt_versions are append only');
END;
