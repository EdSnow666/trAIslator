ALTER TABLE translation_versions
ADD COLUMN root_translation_version_id TEXT REFERENCES translation_versions(id);

ALTER TABLE translation_versions
ADD COLUMN comparison_version_id TEXT REFERENCES translation_versions(id);

DROP TRIGGER translation_versions_no_update;

WITH RECURSIVE ancestry(child_id, ancestor_id, parent_id, depth) AS (
  SELECT id, id, parent_version_id, 0 FROM translation_versions
  UNION ALL
  SELECT ancestry.child_id, parent.id, parent.parent_version_id, ancestry.depth + 1
  FROM ancestry JOIN translation_versions parent ON parent.id = ancestry.parent_id
)
UPDATE translation_versions
SET root_translation_version_id = (
  SELECT ancestor_id FROM ancestry
  WHERE child_id = translation_versions.id
  ORDER BY depth DESC LIMIT 1
);

UPDATE translation_versions
SET root_translation_version_id = COALESCE((
  SELECT base.root_translation_version_id FROM translation_versions base
  WHERE base.id = translation_versions.base_translation_version_id
), root_translation_version_id)
WHERE version_kind IN ('ai_post_edit', 'human_post_edit')
  AND parent_version_id IS NULL AND base_translation_version_id IS NOT NULL;

WITH RECURSIVE machine_ancestry(child_id, ancestor_id, parent_id, version_kind, depth) AS (
  SELECT id, id, parent_version_id, version_kind, 0 FROM translation_versions
  UNION ALL
  SELECT machine_ancestry.child_id, parent.id, parent.parent_version_id,
    parent.version_kind, machine_ancestry.depth + 1
  FROM machine_ancestry JOIN translation_versions parent ON parent.id = machine_ancestry.parent_id
)
UPDATE translation_versions
SET comparison_version_id = CASE
  WHEN version_kind = 'human_post_edit' THEN (
    SELECT id FROM (
      SELECT ancestor_id AS id, depth FROM machine_ancestry
      WHERE child_id = translation_versions.id AND depth > 0
        AND version_kind IN ('ai_translation', 'ai_post_edit')
      UNION ALL
      SELECT base.id, 999999 FROM translation_versions base
      WHERE base.id = translation_versions.base_translation_version_id
        AND base.version_kind IN ('ai_translation', 'ai_post_edit')
    ) ORDER BY depth ASC LIMIT 1
  )
  WHEN version_kind = 'ai_post_edit' THEN COALESCE(parent_version_id, base_translation_version_id)
  ELSE NULL
END,
base_translation_version_id = CASE
  WHEN version_kind IN ('ai_post_edit', 'human_post_edit')
    THEN root_translation_version_id
  ELSE base_translation_version_id
END;

CREATE TRIGGER translation_versions_no_update
BEFORE UPDATE ON translation_versions BEGIN
  SELECT RAISE(ABORT, 'translation_versions are immutable');
END;

CREATE TABLE translation_diff_artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES project_workspaces(id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  from_version_id TEXT NOT NULL REFERENCES translation_versions(id),
  to_version_id TEXT NOT NULL REFERENCES translation_versions(id),
  diff_kind TEXT NOT NULL CHECK (diff_kind IN ('ai_to_ai_edit', 'machine_to_human', 'parent_to_child')),
  algorithm_name TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  language TEXT NOT NULL,
  diff_json TEXT NOT NULL CHECK (json_valid(diff_json)),
  stats_json TEXT NOT NULL CHECK (json_valid(stats_json)),
  from_content_hash TEXT NOT NULL,
  to_content_hash TEXT NOT NULL,
  origin_instance_id TEXT NOT NULL REFERENCES app_instances(id),
  created_at TEXT NOT NULL,
  UNIQUE (from_version_id, to_version_id, diff_kind, algorithm_version)
) STRICT;

CREATE TABLE translation_workflow_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  translation_version_id TEXT NOT NULL REFERENCES translation_versions(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('current_selected', 'confirmed', 'submitted', 'withdrawn')),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  request_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  origin_instance_id TEXT NOT NULL REFERENCES app_instances(id),
  occurred_at TEXT NOT NULL,
  UNIQUE (actor_user_id, event_type, request_id, segment_id)
) STRICT;

CREATE TABLE ai_change_decision_events (
  id TEXT PRIMARY KEY,
  ai_edit_version_id TEXT NOT NULL REFERENCES translation_versions(id),
  diff_artifact_id TEXT REFERENCES translation_diff_artifacts(id),
  workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
  change_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  request_id TEXT,
  origin_instance_id TEXT NOT NULL REFERENCES app_instances(id),
  decided_at TEXT NOT NULL,
  UNIQUE (decided_by, request_id)
) STRICT;

CREATE INDEX idx_diff_artifacts_to_version
ON translation_diff_artifacts(to_version_id, diff_kind, created_at);

CREATE INDEX idx_workflow_events_workspace_segment
ON translation_workflow_events(workspace_id, segment_id, occurred_at);

CREATE INDEX idx_decision_events_version
ON ai_change_decision_events(ai_edit_version_id, change_id, decided_at);

CREATE TRIGGER translation_diff_artifacts_no_update
BEFORE UPDATE ON translation_diff_artifacts BEGIN
  SELECT RAISE(ABORT, 'translation_diff_artifacts are append only');
END;

CREATE TRIGGER translation_diff_artifacts_no_delete
BEFORE DELETE ON translation_diff_artifacts BEGIN
  SELECT RAISE(ABORT, 'translation_diff_artifacts are append only');
END;

CREATE TRIGGER translation_workflow_events_no_update
BEFORE UPDATE ON translation_workflow_events BEGIN
  SELECT RAISE(ABORT, 'translation_workflow_events are append only');
END;

CREATE TRIGGER translation_workflow_events_no_delete
BEFORE DELETE ON translation_workflow_events BEGIN
  SELECT RAISE(ABORT, 'translation_workflow_events are append only');
END;

CREATE TRIGGER ai_change_decision_events_no_update
BEFORE UPDATE ON ai_change_decision_events BEGIN
  SELECT RAISE(ABORT, 'ai_change_decision_events are append only');
END;

CREATE TRIGGER ai_change_decision_events_no_delete
BEFORE DELETE ON ai_change_decision_events BEGIN
  SELECT RAISE(ABORT, 'ai_change_decision_events are append only');
END;

CREATE TRIGGER translation_versions_validate_trace_insert
BEFORE INSERT ON translation_versions BEGIN
  SELECT CASE WHEN NEW.root_translation_version_id IS NULL
    THEN RAISE(ABORT, 'translation root version is required') END;
  SELECT CASE WHEN NEW.version_kind IN ('ai_post_edit', 'human_post_edit')
      AND NEW.comparison_version_id IS NULL
    THEN RAISE(ABORT, 'translation comparison version is required') END;
  SELECT CASE WHEN NEW.parent_version_id = NEW.id
    THEN RAISE(ABORT, 'translation version cannot parent itself') END;
  SELECT CASE WHEN NEW.parent_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM translation_versions parent
    WHERE parent.id = NEW.parent_version_id AND parent.project_id = NEW.project_id
      AND parent.segment_id = NEW.segment_id
      AND (parent.workspace_id = NEW.workspace_id OR parent.scope_type = 'project')
  ) THEN RAISE(ABORT, 'translation parent version mismatch') END;
  SELECT CASE WHEN NEW.root_translation_version_id <> NEW.id AND NOT EXISTS (
    SELECT 1 FROM translation_versions root
    WHERE root.id = NEW.root_translation_version_id AND root.project_id = NEW.project_id
      AND root.segment_id = NEW.segment_id
      AND (root.workspace_id = NEW.workspace_id OR root.scope_type = 'project')
  ) THEN RAISE(ABORT, 'translation root version mismatch') END;
  SELECT CASE WHEN NEW.comparison_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM translation_versions comparison
    WHERE comparison.id = NEW.comparison_version_id AND comparison.project_id = NEW.project_id
      AND comparison.segment_id = NEW.segment_id
      AND (comparison.workspace_id = NEW.workspace_id OR comparison.scope_type = 'project')
  ) THEN RAISE(ABORT, 'translation comparison version mismatch') END;
END;
