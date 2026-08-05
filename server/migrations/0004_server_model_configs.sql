CREATE TABLE server_model_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('openai_compatible')),
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  request_timeout_ms INTEGER NOT NULL DEFAULT 60000 CHECK (request_timeout_ms BETWEEN 5000 AND 300000),
  max_retries INTEGER NOT NULL DEFAULT 1 CHECK (max_retries BETWEEN 0 AND 5),
  last_used_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX uq_server_model_default
  ON server_model_configs(is_default) WHERE is_default = 1;
CREATE INDEX idx_server_model_status ON server_model_configs(status, updated_at);

ALTER TABLE ai_runs ADD COLUMN model_config_id TEXT REFERENCES server_model_configs(id);
ALTER TABLE ai_runs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1;