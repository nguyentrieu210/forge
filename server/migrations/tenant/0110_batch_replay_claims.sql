-- WS09 durable BatchAction replay/idempotency claims.
--
-- One tenant-scoped idempotency key owns exactly one canonical request hash. Commit-capable
-- batch execution must acquire this row before domain writes. Completed rows preserve the
-- deterministic result envelope for replay. `blocked` is intentionally fail-closed: when an
-- execution ends ambiguously after a claim was acquired, automatic retry is refused rather
-- than risking a duplicate authoritative side effect.

CREATE TABLE IF NOT EXISTS batch_replay_claims (
  tenant_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  request_hash TEXT NOT NULL CHECK (length(request_hash) BETWEEN 1 AND 256),
  status TEXT NOT NULL CHECK (status IN ('in_flight','completed','blocked')),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, idempotency_key),
  CHECK ((status='completed' AND result_json IS NOT NULL) OR status<>'completed')
);

CREATE INDEX IF NOT EXISTS idx_batch_replay_claims_status
  ON batch_replay_claims(tenant_id, status, updated_at);
