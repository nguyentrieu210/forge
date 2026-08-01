-- Immutable daily detailed ledger snapshots, freezes and append-only adjustments.
--
-- Each update run produces an immutable snapshot identified by context + source
-- fingerprint. Re-running the same input is idempotent through the unique key.
-- A freeze selects one immutable snapshot for a context. Post-freeze corrections
-- are append-only adjustments and never rewrite the source snapshot.

CREATE TABLE IF NOT EXISTS daily_ledger_snapshots (
  tenant_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  context_key TEXT NOT NULL,
  ledger_date TEXT NOT NULL CHECK (date(ledger_date) IS NOT NULL AND ledger_date=date(ledger_date)),
  company TEXT NOT NULL,
  warehouse TEXT NOT NULL DEFAULT '',
  customer TEXT NOT NULL DEFAULT '',
  sales_order TEXT NOT NULL DEFAULT '',
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint)=64),
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, snapshot_id),
  UNIQUE (tenant_id, context_key, source_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_daily_ledger_snapshot_context
  ON daily_ledger_snapshots(tenant_id, ledger_date, company, warehouse, customer, sales_order, generated_at DESC);

CREATE TABLE IF NOT EXISTS daily_ledger_snapshot_lines (
  tenant_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  line_key TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('Sales','Purchase','Inventory','Manufacturing','Finance')),
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  metric TEXT NOT NULL,
  quantity_micros INTEGER NOT NULL DEFAULT 0,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  PRIMARY KEY (tenant_id, snapshot_id, line_key),
  FOREIGN KEY (tenant_id, snapshot_id)
    REFERENCES daily_ledger_snapshots(tenant_id, snapshot_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_daily_ledger_lines_domain_source
  ON daily_ledger_snapshot_lines(tenant_id, snapshot_id, domain, source_type, source_ref);

CREATE TABLE IF NOT EXISTS daily_ledger_freezes (
  tenant_id TEXT NOT NULL,
  context_key TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  frozen_by TEXT NOT NULL,
  frozen_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, context_key),
  UNIQUE (tenant_id, snapshot_id),
  FOREIGN KEY (tenant_id, snapshot_id)
    REFERENCES daily_ledger_snapshots(tenant_id, snapshot_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS daily_ledger_adjustments (
  tenant_id TEXT NOT NULL,
  adjustment_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  line_key TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason))>0),
  actor_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delta_quantity_micros INTEGER NOT NULL DEFAULT 0,
  delta_amount_minor INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  PRIMARY KEY (tenant_id, adjustment_id),
  FOREIGN KEY (tenant_id, snapshot_id, line_key)
    REFERENCES daily_ledger_snapshot_lines(tenant_id, snapshot_id, line_key)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_daily_ledger_adjustments_snapshot
  ON daily_ledger_adjustments(tenant_id, snapshot_id, line_key, created_at);

CREATE TRIGGER IF NOT EXISTS daily_ledger_freeze_context_guard
BEFORE INSERT ON daily_ledger_freezes
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM daily_ledger_snapshots s
      WHERE s.tenant_id=NEW.tenant_id
        AND s.snapshot_id=NEW.snapshot_id
        AND s.context_key=NEW.context_key
    ) THEN RAISE(ABORT, 'DAILY_LEDGER_FREEZE_CONTEXT_MISMATCH')
  END;
END;

CREATE TRIGGER IF NOT EXISTS daily_ledger_adjustment_freeze_guard
BEFORE INSERT ON daily_ledger_adjustments
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM daily_ledger_freezes f
      WHERE f.tenant_id=NEW.tenant_id
        AND f.snapshot_id=NEW.snapshot_id
    ) THEN RAISE(ABORT, 'DAILY_LEDGER_NOT_FROZEN')
  END;
END;

CREATE TRIGGER IF NOT EXISTS daily_ledger_snapshot_no_update
BEFORE UPDATE ON daily_ledger_snapshots
BEGIN SELECT RAISE(ABORT, 'DAILY_LEDGER_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS daily_ledger_snapshot_no_delete
BEFORE DELETE ON daily_ledger_snapshots
BEGIN SELECT RAISE(ABORT, 'DAILY_LEDGER_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS daily_ledger_line_no_update
BEFORE UPDATE ON daily_ledger_snapshot_lines
BEGIN SELECT RAISE(ABORT, 'DAILY_LEDGER_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS daily_ledger_line_no_delete
BEFORE DELETE ON daily_ledger_snapshot_lines
BEGIN SELECT RAISE(ABORT, 'DAILY_LEDGER_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS daily_ledger_freeze_no_update
BEFORE UPDATE ON daily_ledger_freezes
BEGIN SELECT RAISE(ABORT, 'DAILY_LEDGER_FREEZE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS daily_ledger_freeze_no_delete
BEFORE DELETE ON daily_ledger_freezes
BEGIN SELECT RAISE(ABORT, 'DAILY_LEDGER_FREEZE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS daily_ledger_adjustment_no_update
BEFORE UPDATE ON daily_ledger_adjustments
BEGIN SELECT RAISE(ABORT, 'DAILY_LEDGER_ADJUSTMENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS daily_ledger_adjustment_no_delete
BEFORE DELETE ON daily_ledger_adjustments
BEGIN SELECT RAISE(ABORT, 'DAILY_LEDGER_ADJUSTMENT_IMMUTABLE'); END;

CREATE VIEW IF NOT EXISTS daily_detailed_ledger_report AS
SELECT
  s.tenant_id,
  s.snapshot_id,
  s.context_key,
  s.ledger_date,
  s.company,
  s.warehouse,
  s.customer,
  s.sales_order,
  s.source_fingerprint,
  s.generated_by,
  s.generated_at,
  f.frozen_by,
  f.frozen_at,
  l.line_key,
  l.domain,
  l.source_type,
  l.source_ref,
  l.metric,
  l.quantity_micros AS snapshot_quantity_micros,
  l.amount_minor AS snapshot_amount_minor,
  l.quantity_micros + COALESCE(SUM(a.delta_quantity_micros),0) AS adjusted_quantity_micros,
  l.amount_minor + COALESCE(SUM(a.delta_amount_minor),0) AS adjusted_amount_minor,
  l.currency,
  COUNT(a.adjustment_id) AS adjustment_count,
  l.details_json
FROM daily_ledger_snapshots s
JOIN daily_ledger_snapshot_lines l
  ON l.tenant_id=s.tenant_id AND l.snapshot_id=s.snapshot_id
LEFT JOIN daily_ledger_freezes f
  ON f.tenant_id=s.tenant_id AND f.snapshot_id=s.snapshot_id
LEFT JOIN daily_ledger_adjustments a
  ON a.tenant_id=l.tenant_id AND a.snapshot_id=l.snapshot_id AND a.line_key=l.line_key
GROUP BY
  s.tenant_id,s.snapshot_id,s.context_key,s.ledger_date,s.company,s.warehouse,s.customer,s.sales_order,
  s.source_fingerprint,s.generated_by,s.generated_at,f.frozen_by,f.frozen_at,
  l.line_key,l.domain,l.source_type,l.source_ref,l.metric,l.quantity_micros,l.amount_minor,l.currency,l.details_json;
