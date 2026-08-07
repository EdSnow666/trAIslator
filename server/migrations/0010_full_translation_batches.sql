CREATE TABLE full_translation_batches (
  id TEXT PRIMARY KEY,
  ai_run_id TEXT NOT NULL UNIQUE REFERENCES ai_runs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
  expected_segment_count INTEGER NOT NULL CHECK (expected_segment_count > 0),
  response_segment_count INTEGER NOT NULL CHECK (response_segment_count >= 0),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('valid', 'invalid')),
  segment_ids_json TEXT NOT NULL CHECK (json_valid(segment_ids_json)),
  response_hash TEXT NOT NULL,
  validation_error TEXT,
  origin_instance_id TEXT NOT NULL REFERENCES app_instances(id),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_full_translation_batches_workspace
ON full_translation_batches(workspace_id, created_at);

CREATE TRIGGER full_translation_batches_no_update
BEFORE UPDATE ON full_translation_batches BEGIN
  SELECT RAISE(ABORT, 'full_translation_batches are append only');
END;

CREATE TRIGGER full_translation_batches_no_delete
BEFORE DELETE ON full_translation_batches BEGIN
  SELECT RAISE(ABORT, 'full_translation_batches are append only');
END;
