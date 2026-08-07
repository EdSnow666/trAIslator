-- Prompt 版本保持不可变；“删除”通过归档表实现，以保留旧译文的追溯关系。
CREATE TABLE prompt_version_archives (
  prompt_version_id TEXT PRIMARY KEY REFERENCES prompt_versions(id) ON DELETE CASCADE,
  archived_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  archived_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE INDEX idx_prompt_archives_time ON prompt_version_archives(archived_at);