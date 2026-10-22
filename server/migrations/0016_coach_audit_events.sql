CREATE TABLE prompt_coach_audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('request', 'response', 'validation', 'error')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_coach_audit_request ON prompt_coach_audit_events(actor_user_id, request_id, created_at);
CREATE TRIGGER coach_audit_no_update BEFORE UPDATE ON prompt_coach_audit_events BEGIN
  SELECT RAISE(ABORT, 'coach audit events are append only');
END;
CREATE TRIGGER coach_audit_no_delete BEFORE DELETE ON prompt_coach_audit_events BEGIN
  SELECT RAISE(ABORT, 'coach audit events are append only');
END;
