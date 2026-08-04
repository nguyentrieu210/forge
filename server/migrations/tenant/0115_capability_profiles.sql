-- R5-01 canonical package capability contracts and tenant capability-profile history.
--
-- Package installation remains authoritative in installed_apps/app_objects. These tables
-- only persist capability composition metadata and immutable profile revisions. Disabling
-- a capability never deletes package metadata or business/customer data.

CREATE TABLE IF NOT EXISTS app_capability_contracts (
  tenant_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  app_version TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash)=64),
  contract_json TEXT NOT NULL CHECK (json_valid(contract_json)),
  registered_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, app_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_app_capability_contract_version
  ON app_capability_contracts(tenant_id, app_id, app_version, registered_at DESC);

CREATE TABLE IF NOT EXISTS capability_profile_revisions (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  proposal_json TEXT NOT NULL CHECK (json_valid(proposal_json)),
  resolution_json TEXT NOT NULL CHECK (json_valid(resolution_json)),
  content_hash TEXT NOT NULL CHECK (length(content_hash)=64),
  applied_by TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, profile_id, version),
  UNIQUE (tenant_id, profile_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_capability_profile_revision_time
  ON capability_profile_revisions(tenant_id, profile_id, applied_at DESC);

CREATE TABLE IF NOT EXISTS capability_profile_active (
  tenant_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  modified_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, profile_id, version)
    REFERENCES capability_profile_revisions(tenant_id, profile_id, version)
    ON DELETE RESTRICT
);
