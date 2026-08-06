CREATE TABLE IF NOT EXISTS marketplace_provider_order_state (
  tenant_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('shopee','lazada','tiktok_shop')),
  latest_external_status TEXT NOT NULL,
  latest_occurred_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 1 CHECK (event_count >= 1),
  stale_event_count INTEGER NOT NULL DEFAULT 0 CHECK (stale_event_count >= 0),
  duplicate_event_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_event_count >= 0),
  conflict_event_count INTEGER NOT NULL DEFAULT 0 CHECK (conflict_event_count >= 0),
  PRIMARY KEY (tenant_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_provider_order_state_recent
  ON marketplace_provider_order_state (tenant_id, provider, latest_occurred_at DESC);
