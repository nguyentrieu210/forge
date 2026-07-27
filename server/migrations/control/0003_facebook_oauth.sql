ALTER TABLE oauth_transactions ADD COLUMN worker_name TEXT;
ALTER TABLE oauth_transactions ADD COLUMN return_url TEXT;
ALTER TABLE oauth_transactions ADD COLUMN actor_id TEXT;

CREATE INDEX IF NOT EXISTS idx_oauth_transactions_tenant
  ON oauth_transactions(tenant_id, provider, created_at DESC);
