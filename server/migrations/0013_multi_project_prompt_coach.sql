CREATE TABLE prompt_coach_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  custom_prompt TEXT,
  updated_at TEXT NOT NULL
) STRICT;

ALTER TABLE prompt_coach_runs RENAME TO prompt_coach_runs_legacy;

CREATE TABLE prompt_coach_runs (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('workspace', 'class', 'projects')),
  scope_id TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  model_config_id TEXT REFERENCES server_model_configs(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  input_record_count INTEGER NOT NULL CHECK (input_record_count >= 0),
  input_snapshot_json TEXT NOT NULL CHECK (json_valid(input_snapshot_json)),
  selected_project_ids_json TEXT CHECK (
    selected_project_ids_json IS NULL OR json_valid(selected_project_ids_json)
  ),
  coach_prompt_text TEXT,
  coach_prompt_source TEXT CHECK (
    coach_prompt_source IS NULL OR coach_prompt_source IN ('default', 'custom')
  ),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  created_at TEXT NOT NULL,
  UNIQUE (actor_user_id, request_id)
) STRICT;

INSERT INTO prompt_coach_runs (
  id, scope_type, scope_id, project_id, actor_user_id, model_config_id,
  request_id, input_record_count, input_snapshot_json, result_json, created_at
)
SELECT id, scope_type, scope_id, project_id, actor_user_id, model_config_id,
  request_id, input_record_count, input_snapshot_json, result_json, created_at
FROM prompt_coach_runs_legacy;

DROP TABLE prompt_coach_runs_legacy;

CREATE INDEX idx_prompt_coach_runs_scope
ON prompt_coach_runs(scope_type, scope_id, created_at DESC);

CREATE TRIGGER prompt_coach_runs_no_update
BEFORE UPDATE ON prompt_coach_runs BEGIN
  SELECT RAISE(ABORT, 'prompt_coach_runs are append only');
END;

CREATE TRIGGER prompt_coach_runs_no_delete
BEFORE DELETE ON prompt_coach_runs BEGIN
  SELECT RAISE(ABORT, 'prompt_coach_runs are append only');
END;
