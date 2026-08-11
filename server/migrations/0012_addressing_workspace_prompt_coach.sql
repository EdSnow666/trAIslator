INSERT OR IGNORE INTO workspace_segment_states
  (workspace_id, segment_id, current_translation_version_id, status, updated_at)
SELECT workspace.id, version.segment_id, version.id, 'confirmed',
  '2026-08-10T00:00:00.000Z'
FROM translation_versions version
JOIN project_workspaces workspace
  ON workspace.project_id = version.project_id
  AND workspace.owner_user_id = version.created_by
  AND workspace.deleted_at IS NULL
WHERE version.project_id = 'demo-a36-violence-against-children'
  AND version.version_kind = 'human_post_edit'
  AND version.id LIKE '%:human-edit-recovered';
