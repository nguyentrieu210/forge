CREATE TABLE IF NOT EXISTS oauth_transactions (
  state_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('facebook','tiktok')),
  redirect_uri TEXT NOT NULL,
  pkce_verifier_ciphertext TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expiry
  ON oauth_transactions(expires_at, consumed_at);

-- Public ingress resolves only an HMAC of the provider page id. Provider ids,
-- tokens and customer content remain in the tenant database.
CREATE TABLE IF NOT EXISTS social_page_routes (
  page_key_hmac TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('facebook','tiktok')),
  status TEXT NOT NULL CHECK(status IN ('active','paused','revoked')),
  routing_version INTEGER NOT NULL DEFAULT 1,
  modified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_social_page_routes_tenant
  ON social_page_routes(tenant_id, provider, status);
