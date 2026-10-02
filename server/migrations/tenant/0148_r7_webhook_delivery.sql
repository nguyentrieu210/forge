-- Provider-neutral delivery intent, immutable snapshot, fenced claims and bounded audit.
CREATE TABLE IF NOT EXISTS integration_webhook_fanouts (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  tasks_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);
CREATE TABLE IF NOT EXISTS integration_webhook_deliveries (
  tenant_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  task_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued','in_flight','retry_scheduled','delivered','dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  replay_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  claim_token TEXT,
  claimed_at TEXT,
  http_status INTEGER,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, delivery_id),
  UNIQUE (tenant_id, subscription_id, event_id)
);
CREATE INDEX IF NOT EXISTS integration_webhook_due
  ON integration_webhook_deliveries (tenant_id, state, next_attempt_at);
CREATE TABLE IF NOT EXISTS integration_webhook_audit (
  tenant_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  claim_token TEXT NOT NULL,
  action TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  http_status INTEGER,
  reason TEXT,
  actor_id TEXT,
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, delivery_id, claim_token, action)
);
