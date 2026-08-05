CREATE UNIQUE INDEX idx_activity_request_idempotency
ON activity_events(event_type, actor_user_id, request_id)
WHERE request_id IS NOT NULL AND actor_user_id IS NOT NULL;

CREATE INDEX idx_prompt_publications_version
ON project_prompt_publications(prompt_version_id, published_at);

CREATE INDEX idx_transfer_conflicts_job
ON data_transfer_conflicts(transfer_job_id, entity_type);