-- 将翻译 Prompt 与译后编辑 Prompt 拆成两套可独立发布、选择和归档的谱系。
ALTER TABLE prompt_lineages
ADD COLUMN prompt_kind TEXT NOT NULL DEFAULT 'translation'
  CHECK (prompt_kind IN ('translation', 'post_edit'));

ALTER TABLE project_workspaces
ADD COLUMN active_post_edit_prompt_version_id TEXT REFERENCES prompt_versions(id);

ALTER TABLE project_prompt_publications
ADD COLUMN prompt_kind TEXT NOT NULL DEFAULT 'translation'
  CHECK (prompt_kind IN ('translation', 'post_edit'));

DROP INDEX idx_current_project_prompt;
CREATE UNIQUE INDEX idx_current_project_prompt
ON project_prompt_publications(project_id, prompt_kind)
WHERE retired_at IS NULL;

CREATE INDEX idx_workspaces_active_post_edit_prompt
ON project_workspaces(active_post_edit_prompt_version_id)
WHERE active_post_edit_prompt_version_id IS NOT NULL;

INSERT INTO prompt_lineages (id, project_id, owner_user_id, name, created_at, prompt_kind)
SELECT 'post-edit-lineage-' || id, id, NULL, '项目译后编辑 Prompt', created_at, 'post_edit'
FROM projects WHERE deleted_at IS NULL;

INSERT INTO prompt_versions (id, lineage_id, parent_version_id, created_by, ai_run_id,
  version_number, title, note, content, content_hash, source_type, created_at)
SELECT 'post-edit-v1-' || id, 'post-edit-lineage-' || id, NULL, NULL, NULL,
  1, '基础译后编辑 Prompt', '系统初始化的项目译后编辑规则',
  '在不改变原意的前提下，对当前译文进行句法、衔接和表达层面的译后编辑。忽略术语替换；只输出编辑后的完整译文。',
  '', 'human', created_at
FROM projects WHERE deleted_at IS NULL;

INSERT INTO project_prompt_publications (id, project_id, prompt_version_id, published_by,
  published_at, retired_at, prompt_kind)
SELECT 'post-edit-publication-' || id, id, 'post-edit-v1-' || id, NULL,
  created_at, NULL, 'post_edit'
FROM projects WHERE deleted_at IS NULL;

UPDATE project_workspaces
SET active_post_edit_prompt_version_id = 'post-edit-v1-' || project_id
WHERE active_post_edit_prompt_version_id IS NULL
  AND EXISTS (SELECT 1 FROM prompt_versions pv
    WHERE pv.id = 'post-edit-v1-' || project_workspaces.project_id);
