-- Extend the existing control-plane OAuth transaction authority to marketplace sellers.
--
-- D1/SQLite cannot alter a CHECK constraint in place, so rebuild the table while
-- preserving every Facebook/TikTok transaction and the columns added by 0003.
-- Marketplace seller access/refresh tokens are NEVER stored here; only the opaque
-- connection binding needed to route a single-use callback back to the tenant vault.

CREATE TABLE oauth_transactions_next (
  state_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('facebook','tiktok','shopee','lazada','tiktok_shop')),
  redirect_uri TEXT NOT NULL,
  pkce_verifier_ciphertext TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  worker_name TEXT,
  return_url TEXT,
  actor_id TEXT,
  connection_id TEXT
);

INSERT INTO oauth_transactions_next(
  state_hash,tenant_id,provider,redirect_uri,pkce_verifier_ciphertext,
  expires_at,consumed_at,created_at,worker_name,return_url,actor_id,connection_id
)
SELECT
  state_hash,tenant_id,provider,redirect_uri,pkce_verifier_ciphertext,
  expires_at,consumed_at,created_at,worker_name,return_url,actor_id,NULL
FROM oauth_transactions;

DROP TABLE oauth_transactions;
ALTER TABLE oauth_transactions_next RENAME TO oauth_transactions;

CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expiry
  ON oauth_transactions(expires_at, consumed_at);
CREATE INDEX IF NOT EXISTS idx_oauth_transactions_tenant
  ON oauth_transactions(tenant_id, provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_transactions_marketplace_connection
  ON oauth_transactions(tenant_id, connection_id, provider, created_at DESC)
  WHERE connection_id IS NOT NULL;
