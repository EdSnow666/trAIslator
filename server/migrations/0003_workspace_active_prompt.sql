ALTER TABLE project_workspaces
ADD COLUMN active_prompt_version_id TEXT REFERENCES prompt_versions(id);

CREATE INDEX idx_workspaces_active_prompt
ON project_workspaces(active_prompt_version_id)
WHERE active_prompt_version_id IS NOT NULL;