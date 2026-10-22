CREATE TABLE ai_run_audit_events (
  id TEXT PRIMARY KEY,
  ai_run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('request', 'response', 'validation', 'error')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_ai_run_audit ON ai_run_audit_events(ai_run_id, created_at);
CREATE TRIGGER ai_run_audit_no_update BEFORE UPDATE ON ai_run_audit_events BEGIN
  SELECT RAISE(ABORT, 'AI run audit events are append only');
END;
CREATE TRIGGER ai_run_audit_no_delete BEFORE DELETE ON ai_run_audit_events BEGIN
  SELECT RAISE(ABORT, 'AI run audit events are append only');
END;
