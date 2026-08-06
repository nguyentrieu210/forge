ALTER TABLE marketplace_provider_order_state ADD COLUMN channel_profile TEXT;

CREATE INDEX IF NOT EXISTS idx_marketplace_provider_order_state_channel
  ON marketplace_provider_order_state (tenant_id, channel_profile, latest_occurred_at DESC);
