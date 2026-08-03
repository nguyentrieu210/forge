-- WS13 durable migration execution journal.
--
-- A source row must keep its resolved target identity and command identity across retries.
-- This journal is separate from the document kernel: authoritative business writes still
-- use mutation_guard/mutation_receipts. The journal links migration intent to those receipts
-- so response loss cannot turn an autonamed create into a second document on retry.

CREATE TABLE IF NOT EXISTS migration_runs (
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  manifest_id TEXT,
  source_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('csv','excel','api','sql','erpnext','misa','odoo','fast','bravo','legacy')),
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint)=64),
  target_doctype TEXT NOT NULL,
  duplicate_policy TEXT NOT NULL CHECK (duplicate_policy IN ('error','skip','update')),
  key_field TEXT,
  mapping_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(mapping_json)),
  state TEXT NOT NULL CHECK (state IN ('draft','validated','applying','applied','reconciling','completed','failed','cancelled')),
  started_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (tenant_id, run_id),
  UNIQUE (tenant_id, plan_id)
);
CREATE INDEX IF NOT EXISTS idx_migration_runs_state
  ON migration_runs(tenant_id, state, modified_at);

CREATE TABLE IF NOT EXISTS migration_row_receipts (
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  row_key TEXT NOT NULL,
  source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
  row_fingerprint TEXT NOT NULL CHECK (length(row_fingerprint)=64),
  target_doctype TEXT NOT NULL,
  target_name TEXT,
  intended_action TEXT NOT NULL CHECK (intended_action IN ('create','update','skip','error')),
  status TEXT NOT NULL CHECK (status IN ('reserved','applying','imported','updated','skipped','failed')),
  command_id TEXT,
  command_payload_hash TEXT CHECK (command_payload_hash IS NULL OR length(command_payload_hash)=64),
  document_json TEXT CHECK (document_json IS NULL OR json_valid(document_json)),
  error_text TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  staging_purged_at TEXT,
  PRIMARY KEY (tenant_id, run_id, row_key),
  UNIQUE (tenant_id, run_id, row_fingerprint),
  UNIQUE (tenant_id, command_id),
  FOREIGN KEY (tenant_id, run_id) REFERENCES migration_runs(tenant_id, run_id) ON DELETE CASCADE,
  CHECK (intended_action NOT IN ('create','update','skip') OR target_name IS NOT NULL),
  CHECK (status NOT IN ('applying','imported','updated') OR command_id IS NOT NULL),
  CHECK (status NOT IN ('imported','updated') OR target_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_migration_rows_status
  ON migration_row_receipts(tenant_id, run_id, status, source_row_number);

CREATE TABLE IF NOT EXISTS migration_checkpoints (
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  adapter TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  cursor TEXT NOT NULL,
  batch_fingerprint TEXT NOT NULL CHECK (length(batch_fingerprint)=64),
  high_watermark TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, run_id, sequence),
  UNIQUE (tenant_id, run_id, batch_fingerprint),
  FOREIGN KEY (tenant_id, run_id) REFERENCES migration_runs(tenant_id, run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS migration_reconciliation_metrics (
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  expected TEXT NOT NULL,
  actual TEXT NOT NULL,
  matches INTEGER NOT NULL CHECK (matches IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, run_id, snapshot_id, metric),
  FOREIGN KEY (tenant_id, run_id) REFERENCES migration_runs(tenant_id, run_id) ON DELETE CASCADE
);
