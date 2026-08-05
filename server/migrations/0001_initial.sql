CREATE TABLE app_instances (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('development', 'test', 'production')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'archived')),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  password_changed_at TEXT NOT NULL,
  origin_instance_id TEXT NOT NULL REFERENCES app_instances(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE TABLE roles (
  code TEXT PRIMARY KEY CHECK (code IN ('admin', 'teacher', 'student', 'experiment_user')),
  label TEXT NOT NULL
) STRICT;

INSERT INTO roles (code, label) VALUES
  ('admin', '管理员'),
  ('teacher', '教师'),
  ('student', '学生'),
  ('experiment_user', '实验用户');

CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL REFERENCES roles(code),
  assigned_by TEXT REFERENCES users(id),
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (user_id, role_code)
) WITHOUT ROWID;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  revoke_reason TEXT,
  user_agent TEXT,
  ip_hash TEXT
) STRICT;

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  username_normalized TEXT NOT NULL,
  succeeded INTEGER NOT NULL CHECK (succeeded IN (0, 1)),
  failure_reason TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  occurred_at TEXT NOT NULL
) STRICT;

CREATE TABLE user_api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, provider, label)
) STRICT;

CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  origin_instance_id TEXT NOT NULL REFERENCES app_instances(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE TABLE class_memberships (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_role TEXT NOT NULL CHECK (membership_role IN ('teacher', 'student')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  added_by TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (class_id, user_id, membership_role)
) WITHOUT ROWID;

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  project_kind TEXT NOT NULL CHECK (project_kind IN ('system_template', 'class_project', 'experiment_project')),
  source_template_project_id TEXT REFERENCES projects(id),
  name TEXT NOT NULL,
  direction TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by TEXT REFERENCES users(id),
  published_by TEXT REFERENCES users(id),
  published_at TEXT,
  origin_instance_id TEXT NOT NULL REFERENCES app_instances(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE TABLE project_managers (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by TEXT REFERENCES users(id),
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
) WITHOUT ROWID;

CREATE TABLE experiments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  settings_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings_json)),
  created_by TEXT NOT NULL REFERENCES users(id),
  origin_instance_id TEXT NOT NULL REFERENCES app_instances(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE TABLE experiment_stages (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  stage_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings_json)),
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (experiment_id, stage_order)
) STRICT;

CREATE TABLE experiment_participants (
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'completed')),
  enrolled_by TEXT NOT NULL REFERENCES users(id),
  enrolled_at TEXT NOT NULL,
  PRIMARY KEY (experiment_id, user_id),
  UNIQUE (experiment_id, participant_code)
) WITHOUT ROWID;

CREATE TABLE project_assignments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  experiment_stage_id TEXT REFERENCES experiment_stages(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  CHECK ((class_id IS NOT NULL) <> (experiment_stage_id IS NOT NULL))
) STRICT;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_order INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL,
  UNIQUE (project_id, document_order)
) STRICT;

CREATE TABLE segments (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  segment_key TEXT NOT NULL,
  segment_order INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL,
  UNIQUE (document_id, segment_key),
  UNIQUE (document_id, segment_order)
) STRICT;

CREATE TABLE project_workspaces (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assignment_id TEXT NOT NULL REFERENCES project_assignments(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'archived')),
  origin_instance_id TEXT NOT NULL REFERENCES app_instances(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (assignment_id, owner_user_id)
) STRICT;

CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('prompt_generate', 'translation_generate', 'ai_post_edit', 'prompt_coach', 'style_identify')),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES project_workspaces(id) ON DELETE SET NULL,
  segment_id TEXT REFERENCES segments(id) ON DELETE SET NULL,
  prompt_version_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  input_hash TEXT NOT NULL,
  context_manifest_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(context_manifest_json)),
  output_text TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  error_code TEXT,
  token_usage_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(token_usage_json)),
  latency_ms INTEGER,
  retry_of_run_id TEXT REFERENCES ai_runs(id),
  started_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;

CREATE TABLE prompt_lineages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE prompt_versions (
  id TEXT PRIMARY KEY,
  lineage_id TEXT NOT NULL REFERENCES prompt_lineages(id) ON DELETE CASCADE,
  parent_version_id TEXT REFERENCES prompt_versions(id),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ai_run_id TEXT REFERENCES ai_runs(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('human', 'ai_generated', 'imported')),
  created_at TEXT NOT NULL,
  UNIQUE (lineage_id, version_number)
) STRICT;

CREATE TABLE prompt_submissions (
  id TEXT PRIMARY KEY,
  prompt_version_id TEXT NOT NULL REFERENCES prompt_versions(id) ON DELETE CASCADE,
  submitted_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('submitted', 'withdrawn', 'accepted', 'rejected')),
  submitted_at TEXT NOT NULL,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  review_note TEXT,
  UNIQUE (prompt_version_id, submitted_by)
) STRICT;

CREATE TABLE project_prompt_publications (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt_version_id TEXT NOT NULL REFERENCES prompt_versions(id),
  published_by TEXT REFERENCES users(id),
  published_at TEXT NOT NULL,
  retired_at TEXT
) STRICT;

CREATE TABLE translation_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES project_workspaces(id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  parent_version_id TEXT REFERENCES translation_versions(id),
  base_translation_version_id TEXT REFERENCES translation_versions(id),
  prompt_version_id TEXT REFERENCES prompt_versions(id),
  ai_run_id TEXT REFERENCES ai_runs(id) ON DELETE SET NULL,
  version_kind TEXT NOT NULL CHECK (version_kind IN ('ai_translation', 'ai_post_edit', 'human_post_edit', 'manual_reference')),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('project', 'workspace')),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  origin_instance_id TEXT NOT NULL REFERENCES app_instances(id),
  created_at TEXT NOT NULL,
  CHECK ((scope_type = 'project' AND workspace_id IS NULL) OR (scope_type = 'workspace' AND workspace_id IS NOT NULL)),
  CHECK ((version_kind = 'manual_reference' AND prompt_version_id IS NULL) OR version_kind <> 'manual_reference')
) STRICT;

CREATE TABLE workspace_segment_states (
  workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  current_translation_version_id TEXT REFERENCES translation_versions(id),
  status TEXT NOT NULL DEFAULT 'untranslated' CHECK (status IN ('untranslated', 'translated', 'ai_edited', 'human_edited', 'confirmed')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, segment_id)
) WITHOUT ROWID;

CREATE TABLE ai_change_decisions (
  id TEXT PRIMARY KEY,
  ai_edit_version_id TEXT NOT NULL REFERENCES translation_versions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
  change_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  decided_by TEXT NOT NULL REFERENCES users(id),
  decided_at TEXT NOT NULL,
  UNIQUE (ai_edit_version_id, change_id, decided_by)
) STRICT;

CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_kind TEXT NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user', 'system')),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES project_workspaces(id) ON DELETE SET NULL,
  segment_id TEXT REFERENCES segments(id) ON DELETE SET NULL,
  prompt_version_id TEXT REFERENCES prompt_versions(id) ON DELETE SET NULL,
  translation_version_id TEXT REFERENCES translation_versions(id) ON DELETE SET NULL,
  request_id TEXT,
  correlation_id TEXT,
  event_schema_version INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  origin_instance_id TEXT NOT NULL REFERENCES app_instances(id),
  occurred_at TEXT NOT NULL
) STRICT;

CREATE TABLE term_bases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE terms (
  id TEXT PRIMARY KEY,
  term_base_id TEXT NOT NULL REFERENCES term_bases(id) ON DELETE CASCADE,
  source_term TEXT NOT NULL,
  target_term TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('candidate', 'approved', 'deprecated')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE translation_memory_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL,
  target_text TEXT NOT NULL,
  source_translation_version_id TEXT REFERENCES translation_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('candidate', 'approved', 'deprecated')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE backup_records (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'restored')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE deployment_runs (
  id TEXT PRIMARY KEY,
  release_version TEXT NOT NULL,
  runner_identity TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'rolled_back')),
  schema_before TEXT,
  schema_after TEXT,
  backup_record_id TEXT REFERENCES backup_records(id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_text TEXT
) STRICT;

CREATE TABLE data_transfer_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('export', 'import')),
  source_instance_id TEXT REFERENCES app_instances(id),
  target_instance_id TEXT REFERENCES app_instances(id),
  schema_version TEXT NOT NULL,
  manifest_checksum TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'conflicted')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(summary_json))
) STRICT;

CREATE TABLE data_transfer_conflicts (
  id TEXT PRIMARY KEY,
  transfer_job_id TEXT NOT NULL REFERENCES data_transfer_jobs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_hash TEXT,
  incoming_hash TEXT,
  resolution TEXT CHECK (resolution IN ('keep_local', 'accept_incoming', 'manual')),
  resolved_at TEXT
) STRICT;

CREATE UNIQUE INDEX idx_current_project_prompt ON project_prompt_publications(project_id) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX idx_ai_decision_current ON ai_change_decisions(ai_edit_version_id, change_id, decided_by);
CREATE INDEX idx_sessions_user_active ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_class_members_user ON class_memberships(user_id, status);
CREATE INDEX idx_project_managers_user ON project_managers(user_id);
CREATE INDEX idx_project_assignments_class ON project_assignments(class_id) WHERE class_id IS NOT NULL;
CREATE INDEX idx_project_assignments_stage ON project_assignments(experiment_stage_id) WHERE experiment_stage_id IS NOT NULL;
CREATE INDEX idx_workspaces_owner ON project_workspaces(owner_user_id, project_id);
CREATE INDEX idx_segments_document_order ON segments(document_id, segment_order);
CREATE INDEX idx_prompt_lineage_project ON prompt_lineages(project_id, owner_user_id);
CREATE INDEX idx_prompt_submissions_status ON prompt_submissions(status, submitted_at);
CREATE INDEX idx_translations_workspace_segment ON translation_versions(workspace_id, segment_id, created_at);
CREATE INDEX idx_translations_project_segment ON translation_versions(project_id, segment_id, created_at);
CREATE INDEX idx_activity_actor_time ON activity_events(actor_user_id, occurred_at);
CREATE INDEX idx_activity_project_time ON activity_events(project_id, occurred_at);
CREATE INDEX idx_activity_event_time ON activity_events(event_type, occurred_at);
CREATE INDEX idx_ai_runs_project_time ON ai_runs(project_id, started_at);

CREATE TRIGGER prompt_versions_no_update
BEFORE UPDATE ON prompt_versions BEGIN
  SELECT RAISE(ABORT, 'prompt_versions are immutable');
END;

CREATE TRIGGER prompt_versions_no_delete
BEFORE DELETE ON prompt_versions BEGIN
  SELECT RAISE(ABORT, 'prompt_versions are immutable');
END;

CREATE TRIGGER translation_versions_no_update
BEFORE UPDATE ON translation_versions BEGIN
  SELECT RAISE(ABORT, 'translation_versions are immutable');
END;

CREATE TRIGGER translation_versions_no_delete
BEFORE DELETE ON translation_versions BEGIN
  SELECT RAISE(ABORT, 'translation_versions are immutable');
END;

CREATE TRIGGER activity_events_no_update
BEFORE UPDATE ON activity_events BEGIN
  SELECT RAISE(ABORT, 'activity_events are append only');
END;

CREATE TRIGGER activity_events_no_delete
BEFORE DELETE ON activity_events BEGIN
  SELECT RAISE(ABORT, 'activity_events are append only');
END;