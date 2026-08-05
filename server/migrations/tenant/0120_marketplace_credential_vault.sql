CREATE TABLE IF NOT EXISTS marketplace_credential_vault (
  tenant_id TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('shopee','lazada','tiktok_shop')),
  envelope_json TEXT NOT NULL,
  vault_status TEXT NOT NULL DEFAULT 'active' CHECK (vault_status IN ('active','revoked')),
  created_by TEXT NOT NULL,
  modified_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, secret_ref),
  UNIQUE (tenant_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_credential_vault_connection
  ON marketplace_credential_vault (tenant_id, connection_id, provider, vault_status);
