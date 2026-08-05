CREATE TABLE IF NOT EXISTS provider_authority (
  authority_key TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  modified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_security_profiles (
  tenant_id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL CHECK(generation IN (1, 2)),
  key_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  source_sha TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_security_profiles_worker
  ON tenant_security_profiles(worker_name);

CREATE TABLE IF NOT EXISTS tenant_security_profile_audit_events (
  event_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  action TEXT NOT NULL,
  generation INTEGER NOT NULL,
  key_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  source_sha TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_security_profile_audit_tenant_time
  ON tenant_security_profile_audit_events(tenant_id, created_at DESC);
