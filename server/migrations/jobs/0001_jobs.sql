
CREATE TABLE IF NOT EXISTS processed_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);
