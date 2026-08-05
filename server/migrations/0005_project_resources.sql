-- 项目创建来源、可版本化冷启动任务书，以及本地项目/班级分配兼容信息。
ALTER TABLE projects ADD COLUMN creation_source TEXT NOT NULL DEFAULT 'local'
  CHECK (creation_source IN ('local', 'template', 'imported'));

ALTER TABLE classes ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0
  CHECK (is_personal IN (0, 1));

CREATE TABLE project_brief_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_version_id TEXT REFERENCES project_brief_versions(id),
  source_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('human', 'ai_generated', 'inherited')),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  sample_manifest_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(sample_manifest_json)),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE project_brief_states (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  current_version_id TEXT NOT NULL REFERENCES project_brief_versions(id)
) WITHOUT ROWID;

CREATE INDEX idx_project_briefs_project_time
  ON project_brief_versions(project_id, created_at);
