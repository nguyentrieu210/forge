CREATE TABLE IF NOT EXISTS marketplace_sync_state (
  tenant_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  stream TEXT NOT NULL,
  connector_key TEXT NOT NULL,
  cursor TEXT,
  checkpoint INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint >= 0),
  state TEXT NOT NULL DEFAULT 'idle' CHECK (state IN ('idle','running','retry_scheduled','succeeded','error','disabled')),
  run_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  started_at TEXT,
  completed_at TEXT,
  next_attempt_at TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, connection_id, stream)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_sync_state_due
  ON marketplace_sync_state (tenant_id, state, next_attempt_at, updated_at);
