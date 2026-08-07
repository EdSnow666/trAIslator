CREATE TABLE translation_submissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  translation_version_id TEXT NOT NULL REFERENCES translation_versions(id) ON DELETE CASCADE,
  submitted_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'withdrawn')),
  submitted_at TEXT NOT NULL,
  UNIQUE (workspace_id, segment_id, translation_version_id)
) STRICT;

CREATE INDEX idx_translation_submissions_project
  ON translation_submissions(project_id, status, submitted_at);
