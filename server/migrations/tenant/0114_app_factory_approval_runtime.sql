-- RC4-A7 App Factory approval runtime.
--
-- These tables persist process-control state only. They are not a document, ledger or
-- business-record authority: target documents continue to mutate exclusively through the
-- canonical document kernel. The process snapshot makes an approval decision reproducible
-- even after a later App Factory Definition version is activated.

CREATE TABLE IF NOT EXISTS app_factory_approval_processes (
  tenant_id TEXT NOT NULL,
  process_id TEXT NOT NULL,
  definition_name TEXT NOT NULL,
  definition_key TEXT NOT NULL,
  definition_version INTEGER NOT NULL CHECK (definition_version > 0),
  target_doctype TEXT NOT NULL,
  target_name TEXT NOT NULL,
  target_version INTEGER NOT NULL CHECK (target_version > 0),
  approval_plan_json TEXT NOT NULL CHECK (json_valid(approval_plan_json)),
  timer_plan_json TEXT CHECK (timer_plan_json IS NULL OR json_valid(timer_plan_json)),
  stage_opened_json TEXT NOT NULL CHECK (json_valid(stage_opened_json)),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  open_stage TEXT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  started_by TEXT NOT NULL,
  started_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, process_id)
);

-- One live approval graph per definition/target. Different definitions may intentionally
-- govern the same target, and completed/rejected history remains append-only.
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_factory_approval_pending_target
  ON app_factory_approval_processes(tenant_id, definition_key, target_doctype, target_name)
  WHERE status='pending';

CREATE INDEX IF NOT EXISTS idx_app_factory_approval_target_history
  ON app_factory_approval_processes(tenant_id, target_doctype, target_name, started_at DESC);

CREATE TABLE IF NOT EXISTS app_factory_approval_decisions (
  tenant_id TEXT NOT NULL,
  process_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  process_revision INTEGER NOT NULL CHECK (process_revision > 1),
  stage_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve','reject')),
  matched_approver TEXT NOT NULL,
  delegation_id TEXT,
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, process_id, decision_id),
  UNIQUE (tenant_id, process_id, stage_key, actor_id),
  FOREIGN KEY (tenant_id, process_id)
    REFERENCES app_factory_approval_processes(tenant_id, process_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_app_factory_approval_decision_order
  ON app_factory_approval_decisions(tenant_id, process_id, process_revision, decision_id);

-- Command receipts give this sidecar the same fail-closed retry semantics expected from a
-- write boundary. A retry with the same command id is replayable only when actor, payload
-- hash and process id are byte-equivalent; runtime code rejects any mismatch.
CREATE TABLE IF NOT EXISTS app_factory_approval_commands (
  tenant_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  process_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK (length(payload_hash)=64),
  aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  committed_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, command_id)
);

CREATE INDEX IF NOT EXISTS idx_app_factory_approval_command_process
  ON app_factory_approval_commands(tenant_id, process_id, committed_at DESC);
