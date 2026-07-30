-- Production rollout gate for the Purchase Receipt allocation engine.
--
-- The schema and code may be deployed before legacy PO/Receipt history has been
-- backfilled. Absence of a row, or enabled=0, keeps the legacy controller behavior.
-- Enabling requires a reviewed backfill checksum so activation cannot happen by an
-- accidental boolean update that nobody can later explain.

CREATE TABLE IF NOT EXISTS purchase_allocation_rollout_state (
  tenant_id TEXT NOT NULL PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  backfill_checksum TEXT,
  resolved_count INTEGER NOT NULL DEFAULT 0 CHECK (resolved_count >= 0),
  unresolved_count INTEGER NOT NULL DEFAULT 0 CHECK (unresolved_count >= 0),
  enabled_at TEXT,
  enabled_by TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (enabled=0)
    OR (
      backfill_checksum IS NOT NULL AND length(trim(backfill_checksum)) >= 32
      AND unresolved_count=0
      AND enabled_at IS NOT NULL
      AND enabled_by IS NOT NULL
    )
  )
);

CREATE TRIGGER IF NOT EXISTS purchase_allocation_rollout_no_disable
BEFORE UPDATE OF enabled ON purchase_allocation_rollout_state
WHEN OLD.enabled=1 AND NEW.enabled=0
BEGIN
  SELECT RAISE(ABORT,'PURCHASE_ALLOCATION_ROLLOUT_CANNOT_DISABLE');
END;
