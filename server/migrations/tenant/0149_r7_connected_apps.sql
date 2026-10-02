-- OAuth state and tokens are tenant/user/app bound. Only ciphertext enters D1.
CREATE TABLE IF NOT EXISTS connected_app_connections (
  tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, app_id TEXT NOT NULL,
  token_ciphertext TEXT, expires_at INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  refresh_lease TEXT, refresh_lease_until INTEGER,
  PRIMARY KEY (tenant_id, user_id, app_id)
);
CREATE TABLE IF NOT EXISTS connected_app_states (
  state_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, app_id TEXT NOT NULL,
  verifier_ciphertext TEXT NOT NULL, expires_at INTEGER NOT NULL,
  connection_version INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS connected_app_states_expiry ON connected_app_states(expires_at);
