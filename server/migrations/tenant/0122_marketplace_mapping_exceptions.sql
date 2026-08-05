CREATE TABLE IF NOT EXISTS marketplace_mapping_exceptions (
  tenant_id TEXT NOT NULL,
  channel_profile TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('shopee','lazada','tiktok_shop')),
  external_sku TEXT NOT NULL,
  external_variant_key TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN ('missing','disabled','channel_mismatch','sku_mismatch','variant_mismatch')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  resolved_at TEXT,
  PRIMARY KEY (tenant_id, channel_profile, provider, external_sku, external_variant_key)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_mapping_exceptions_open
  ON marketplace_mapping_exceptions (tenant_id, resolved_at, last_seen_at DESC);
