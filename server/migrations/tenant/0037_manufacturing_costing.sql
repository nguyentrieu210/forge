-- Manufacturing cost sheets are immutable read-model snapshots over the real source
-- documents: Work Order + Stock Ledger + Job Card + Manufacturing Cost Rate.
--
-- A frozen Work Order selects exactly one source fingerprint. Corrections after close
-- are append-only adjustments; the source snapshot is never rewritten.

CREATE TABLE IF NOT EXISTS manufacturing_cost_snapshots (
  tenant_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  work_order TEXT NOT NULL,
  company TEXT NOT NULL,
  currency TEXT NOT NULL,
  currency_scale INTEGER NOT NULL CHECK (currency_scale BETWEEN 0 AND 6),
  target_qty_micros INTEGER NOT NULL CHECK (target_qty_micros > 0),
  produced_qty_micros INTEGER NOT NULL CHECK (produced_qty_micros >= 0 AND produced_qty_micros <= target_qty_micros),
  standard_total_cost_minor INTEGER NOT NULL CHECK (standard_total_cost_minor >= 0),
  actual_total_cost_minor INTEGER NOT NULL CHECK (actual_total_cost_minor >= 0),
  estimated_wip_cost_minor INTEGER NOT NULL CHECK (estimated_wip_cost_minor >= 0),
  valuation_adjustment_minor INTEGER NOT NULL,
  total_variance_minor INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint)=64),
  sheet_json TEXT NOT NULL CHECK (json_valid(sheet_json)),
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, snapshot_id),
  UNIQUE (tenant_id, work_order, source_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_manufacturing_cost_snapshot_work_order
  ON manufacturing_cost_snapshots(tenant_id, work_order, generated_at DESC);

CREATE TABLE IF NOT EXISTS manufacturing_cost_freezes (
  tenant_id TEXT NOT NULL,
  work_order TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  frozen_by TEXT NOT NULL,
  frozen_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, work_order),
  UNIQUE (tenant_id, snapshot_id),
  FOREIGN KEY (tenant_id, snapshot_id)
    REFERENCES manufacturing_cost_snapshots(tenant_id, snapshot_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS manufacturing_cost_adjustments (
  tenant_id TEXT NOT NULL,
  adjustment_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Material','Labor','Machine','Energy','Consumable','Overhead','Other')),
  delta_amount_minor INTEGER NOT NULL CHECK (delta_amount_minor <> 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  actor_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  PRIMARY KEY (tenant_id, adjustment_id),
  FOREIGN KEY (tenant_id, snapshot_id)
    REFERENCES manufacturing_cost_snapshots(tenant_id, snapshot_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_manufacturing_cost_adjustment_snapshot
  ON manufacturing_cost_adjustments(tenant_id, snapshot_id, created_at, adjustment_id);

CREATE TRIGGER IF NOT EXISTS manufacturing_cost_freeze_snapshot_guard
BEFORE INSERT ON manufacturing_cost_freezes
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM manufacturing_cost_snapshots s
      WHERE s.tenant_id=NEW.tenant_id
        AND s.snapshot_id=NEW.snapshot_id
        AND s.work_order=NEW.work_order
    ) THEN RAISE(ABORT, 'MANUFACTURING_COST_FREEZE_MISMATCH')
  END;
END;

CREATE TRIGGER IF NOT EXISTS manufacturing_cost_adjustment_freeze_guard
BEFORE INSERT ON manufacturing_cost_adjustments
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM manufacturing_cost_freezes f
      WHERE f.tenant_id=NEW.tenant_id
        AND f.snapshot_id=NEW.snapshot_id
    ) THEN RAISE(ABORT, 'MANUFACTURING_COST_NOT_FROZEN')
  END;
END;

-- Application-side checks make the common error readable, but the invariant belongs in
-- storage as well: two concurrent negative adjustments must not both pass a stale read and
-- drive actual production cost below zero.
CREATE TRIGGER IF NOT EXISTS manufacturing_cost_adjustment_nonnegative_total_guard
BEFORE INSERT ON manufacturing_cost_adjustments
BEGIN
  SELECT CASE
    WHEN (
      COALESCE((
        SELECT s.actual_total_cost_minor
        FROM manufacturing_cost_snapshots s
        WHERE s.tenant_id=NEW.tenant_id AND s.snapshot_id=NEW.snapshot_id
      ),0)
      + COALESCE((
        SELECT SUM(a.delta_amount_minor)
        FROM manufacturing_cost_adjustments a
        WHERE a.tenant_id=NEW.tenant_id AND a.snapshot_id=NEW.snapshot_id
      ),0)
      + NEW.delta_amount_minor
    ) < 0 THEN RAISE(ABORT, 'MANUFACTURING_COST_NEGATIVE_TOTAL')
  END;
END;

CREATE TRIGGER IF NOT EXISTS manufacturing_cost_snapshot_no_update
BEFORE UPDATE ON manufacturing_cost_snapshots
BEGIN SELECT RAISE(ABORT, 'MANUFACTURING_COST_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS manufacturing_cost_snapshot_no_delete
BEFORE DELETE ON manufacturing_cost_snapshots
BEGIN SELECT RAISE(ABORT, 'MANUFACTURING_COST_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS manufacturing_cost_freeze_no_update
BEFORE UPDATE ON manufacturing_cost_freezes
BEGIN SELECT RAISE(ABORT, 'MANUFACTURING_COST_FREEZE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS manufacturing_cost_freeze_no_delete
BEFORE DELETE ON manufacturing_cost_freezes
BEGIN SELECT RAISE(ABORT, 'MANUFACTURING_COST_FREEZE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS manufacturing_cost_adjustment_no_update
BEFORE UPDATE ON manufacturing_cost_adjustments
BEGIN SELECT RAISE(ABORT, 'MANUFACTURING_COST_ADJUSTMENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS manufacturing_cost_adjustment_no_delete
BEFORE DELETE ON manufacturing_cost_adjustments
BEGIN SELECT RAISE(ABORT, 'MANUFACTURING_COST_ADJUSTMENT_IMMUTABLE'); END;

CREATE VIEW IF NOT EXISTS manufacturing_cost_report AS
SELECT
  s.tenant_id,
  s.snapshot_id,
  s.work_order,
  s.company,
  s.currency,
  s.currency_scale,
  s.target_qty_micros,
  s.produced_qty_micros,
  s.standard_total_cost_minor,
  s.actual_total_cost_minor,
  s.actual_total_cost_minor + COALESCE(SUM(a.delta_amount_minor),0) AS adjusted_actual_total_cost_minor,
  s.estimated_wip_cost_minor,
  s.valuation_adjustment_minor,
  s.total_variance_minor,
  s.total_variance_minor + COALESCE(SUM(a.delta_amount_minor),0) AS adjusted_total_variance_minor,
  s.source_fingerprint,
  s.generated_by,
  s.generated_at,
  f.frozen_by,
  f.frozen_at,
  f.reason AS freeze_reason,
  COUNT(a.adjustment_id) AS adjustment_count,
  s.sheet_json
FROM manufacturing_cost_snapshots s
LEFT JOIN manufacturing_cost_freezes f
  ON f.tenant_id=s.tenant_id AND f.snapshot_id=s.snapshot_id
LEFT JOIN manufacturing_cost_adjustments a
  ON a.tenant_id=s.tenant_id AND a.snapshot_id=s.snapshot_id
GROUP BY
  s.tenant_id,s.snapshot_id,s.work_order,s.company,s.currency,s.currency_scale,
  s.target_qty_micros,s.produced_qty_micros,s.standard_total_cost_minor,s.actual_total_cost_minor,
  s.estimated_wip_cost_minor,s.valuation_adjustment_minor,s.total_variance_minor,s.source_fingerprint,
  s.generated_by,s.generated_at,f.frozen_by,f.frozen_at,f.reason,s.sheet_json;
