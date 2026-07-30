-- Immutable Purchase Receipt -> Purchase Order allocation foundation.
--
-- Queue rows identify one supplier/material obligation stream. Settlement windows
-- snapshot tolerance for a finite business reconciliation period. Every business
-- movement below is append-only; cancellation writes a signed reversal instead of
-- rewriting history.

CREATE TABLE IF NOT EXISTS purchase_obligation_queues (
  tenant_id TEXT NOT NULL,
  queue_key TEXT NOT NULL CHECK (length(queue_key)=64),
  company TEXT NOT NULL,
  supplier TEXT NOT NULL,
  material_match_key TEXT NOT NULL CHECK (length(material_match_key)=64),
  material_schema_version INTEGER NOT NULL CHECK (material_schema_version > 0),
  material_snapshot_json TEXT NOT NULL CHECK (json_valid(material_snapshot_json)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, queue_key),
  UNIQUE (tenant_id, company, supplier, material_match_key)
);
CREATE INDEX IF NOT EXISTS idx_purchase_queues_supplier
  ON purchase_obligation_queues(tenant_id, company, supplier, modified_at);

CREATE TABLE IF NOT EXISTS purchase_settlement_windows (
  tenant_id TEXT NOT NULL,
  window_id TEXT NOT NULL,
  queue_key TEXT NOT NULL,
  window_sequence INTEGER NOT NULL CHECK (window_sequence > 0),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Settled','Reversed')),
  tolerance_bps INTEGER NOT NULL CHECK (tolerance_bps BETWEEN 0 AND 10000),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  opened_at TEXT NOT NULL,
  settled_at TEXT,
  settled_by TEXT,
  settlement_reason TEXT,
  PRIMARY KEY (tenant_id, window_id),
  UNIQUE (tenant_id, queue_key, window_sequence),
  FOREIGN KEY (tenant_id, queue_key)
    REFERENCES purchase_obligation_queues(tenant_id, queue_key),
  CHECK (
    (status='Open' AND settled_at IS NULL AND settled_by IS NULL AND settlement_reason IS NULL)
    OR
    (status IN ('Settled','Reversed') AND settled_at IS NOT NULL AND settled_by IS NOT NULL AND length(trim(settlement_reason)) > 0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_window_open
  ON purchase_settlement_windows(tenant_id, queue_key)
  WHERE status='Open';
CREATE INDEX IF NOT EXISTS idx_purchase_windows_queue
  ON purchase_settlement_windows(tenant_id, queue_key, window_sequence);

CREATE TABLE IF NOT EXISTS purchase_window_obligation_entries (
  tenant_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  queue_key TEXT NOT NULL,
  window_id TEXT NOT NULL,
  voucher_type TEXT NOT NULL CHECK (voucher_type='Purchase Order'),
  voucher_no TEXT NOT NULL,
  voucher_revision INTEGER NOT NULL CHECK (voucher_revision > 0),
  line_key TEXT NOT NULL,
  purchase_order TEXT NOT NULL,
  purchase_order_item_row_id TEXT,
  entry_kind TEXT NOT NULL CHECK (entry_kind IN ('open','cancel','legacy')),
  qty_micros INTEGER NOT NULL CHECK (qty_micros != 0),
  transaction_date TEXT NOT NULL,
  purchase_order_created_at TEXT NOT NULL,
  item_idx INTEGER NOT NULL CHECK (item_idx > 0),
  committed_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  command_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live','legacy')),
  resolution TEXT NOT NULL CHECK (resolution IN ('resolved','legacy_unresolved')),
  PRIMARY KEY (tenant_id, entry_id),
  UNIQUE (tenant_id, voucher_type, voucher_no, voucher_revision, line_key),
  FOREIGN KEY (tenant_id, queue_key)
    REFERENCES purchase_obligation_queues(tenant_id, queue_key),
  FOREIGN KEY (tenant_id, window_id)
    REFERENCES purchase_settlement_windows(tenant_id, window_id),
  CHECK (purchase_order=voucher_no),
  CHECK (
    (entry_kind IN ('open','legacy') AND qty_micros > 0)
    OR (entry_kind='cancel' AND qty_micros < 0)
  ),
  CHECK (
    (source='live' AND resolution='resolved' AND purchase_order_item_row_id IS NOT NULL)
    OR source='legacy'
  ),
  CHECK (resolution!='legacy_unresolved' OR source='legacy')
);
CREATE INDEX IF NOT EXISTS idx_purchase_obligation_fifo
  ON purchase_window_obligation_entries(
    tenant_id, queue_key, window_id, transaction_date,
    purchase_order_created_at, purchase_order, item_idx, purchase_order_item_row_id
  );
CREATE INDEX IF NOT EXISTS idx_purchase_obligation_po_row
  ON purchase_window_obligation_entries(tenant_id, purchase_order, purchase_order_item_row_id, committed_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_live_obligation_open
  ON purchase_window_obligation_entries(tenant_id, purchase_order, purchase_order_item_row_id)
  WHERE source='live' AND entry_kind='open';
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_live_obligation_cancel
  ON purchase_window_obligation_entries(tenant_id, purchase_order, purchase_order_item_row_id)
  WHERE source='live' AND entry_kind='cancel';

CREATE TABLE IF NOT EXISTS purchase_receipt_allocation_entries (
  tenant_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  queue_key TEXT NOT NULL,
  window_id TEXT NOT NULL,
  voucher_type TEXT NOT NULL CHECK (voucher_type='Purchase Receipt'),
  voucher_no TEXT NOT NULL,
  voucher_revision INTEGER NOT NULL CHECK (voucher_revision > 0),
  line_key TEXT NOT NULL,
  receipt_item_row_id TEXT,
  purchase_order TEXT NOT NULL,
  purchase_order_item_row_id TEXT,
  entry_kind TEXT NOT NULL CHECK (entry_kind IN ('allocate','reverse','manual_allocate','apply_unapplied','legacy')),
  qty_micros INTEGER NOT NULL CHECK (qty_micros != 0),
  barem_weight_micros INTEGER NOT NULL DEFAULT 0,
  projected_actual_weight_micros INTEGER,
  projection_version INTEGER,
  allocation_sequence INTEGER NOT NULL CHECK (allocation_sequence > 0),
  posting_at TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  command_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live','legacy')),
  resolution TEXT NOT NULL CHECK (resolution IN ('resolved','legacy_unresolved')),
  reversal_of_entry_id TEXT,
  PRIMARY KEY (tenant_id, entry_id),
  UNIQUE (tenant_id, voucher_type, voucher_no, voucher_revision, line_key),
  FOREIGN KEY (tenant_id, queue_key)
    REFERENCES purchase_obligation_queues(tenant_id, queue_key),
  FOREIGN KEY (tenant_id, window_id)
    REFERENCES purchase_settlement_windows(tenant_id, window_id),
  FOREIGN KEY (tenant_id, reversal_of_entry_id)
    REFERENCES purchase_receipt_allocation_entries(tenant_id, entry_id),
  CHECK (
    (entry_kind='reverse' AND qty_micros < 0 AND reversal_of_entry_id IS NOT NULL)
    OR
    (entry_kind!='reverse' AND qty_micros > 0 AND reversal_of_entry_id IS NULL)
  ),
  CHECK (
    (qty_micros > 0 AND barem_weight_micros >= 0)
    OR (qty_micros < 0 AND barem_weight_micros <= 0)
  ),
  CHECK (
    projected_actual_weight_micros IS NULL
    OR (qty_micros > 0 AND projected_actual_weight_micros >= 0)
    OR (qty_micros < 0 AND projected_actual_weight_micros <= 0)
  ),
  CHECK ((projected_actual_weight_micros IS NULL) = (projection_version IS NULL)),
  CHECK (
    (source='live' AND resolution='resolved' AND receipt_item_row_id IS NOT NULL AND purchase_order_item_row_id IS NOT NULL)
    OR source='legacy'
  ),
  CHECK (resolution!='legacy_unresolved' OR source='legacy'),
  CHECK (entry_kind!='manual_allocate' OR length(trim(reason)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_purchase_alloc_receipt
  ON purchase_receipt_allocation_entries(tenant_id, voucher_no, receipt_item_row_id, allocation_sequence);
CREATE INDEX IF NOT EXISTS idx_purchase_alloc_po_row
  ON purchase_receipt_allocation_entries(tenant_id, purchase_order, purchase_order_item_row_id, committed_at);
CREATE INDEX IF NOT EXISTS idx_purchase_alloc_window
  ON purchase_receipt_allocation_entries(tenant_id, window_id, committed_at);

CREATE TABLE IF NOT EXISTS purchase_unapplied_receipt_entries (
  tenant_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  queue_key TEXT NOT NULL,
  window_id TEXT NOT NULL,
  voucher_type TEXT NOT NULL CHECK (voucher_type='Purchase Receipt'),
  voucher_no TEXT NOT NULL,
  voucher_revision INTEGER NOT NULL CHECK (voucher_revision > 0),
  line_key TEXT NOT NULL,
  receipt_item_row_id TEXT NOT NULL,
  entry_kind TEXT NOT NULL CHECK (entry_kind IN ('receive','apply','reverse','settle')),
  qty_micros INTEGER NOT NULL CHECK (qty_micros != 0),
  source_entry_id TEXT,
  allocation_entry_id TEXT,
  posting_at TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  command_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, entry_id),
  UNIQUE (tenant_id, voucher_type, voucher_no, voucher_revision, line_key),
  FOREIGN KEY (tenant_id, queue_key)
    REFERENCES purchase_obligation_queues(tenant_id, queue_key),
  FOREIGN KEY (tenant_id, window_id)
    REFERENCES purchase_settlement_windows(tenant_id, window_id),
  FOREIGN KEY (tenant_id, source_entry_id)
    REFERENCES purchase_unapplied_receipt_entries(tenant_id, entry_id),
  FOREIGN KEY (tenant_id, allocation_entry_id)
    REFERENCES purchase_receipt_allocation_entries(tenant_id, entry_id),
  CHECK (
    (entry_kind='receive' AND qty_micros > 0 AND source_entry_id IS NULL)
    OR
    (entry_kind IN ('apply','reverse','settle') AND qty_micros < 0 AND source_entry_id IS NOT NULL)
  ),
  CHECK ((entry_kind='apply' AND allocation_entry_id IS NOT NULL) OR (entry_kind!='apply' AND allocation_entry_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_purchase_unapplied_source
  ON purchase_unapplied_receipt_entries(tenant_id, source_entry_id, committed_at);
CREATE INDEX IF NOT EXISTS idx_purchase_unapplied_window
  ON purchase_unapplied_receipt_entries(tenant_id, window_id, committed_at);

CREATE TABLE IF NOT EXISTS purchase_settlement_entries (
  tenant_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  queue_key TEXT NOT NULL,
  window_id TEXT NOT NULL,
  entry_kind TEXT NOT NULL CHECK (entry_kind IN ('close','reverse')),
  nominal_qty_micros INTEGER NOT NULL CHECK (nominal_qty_micros >= 0),
  received_qty_micros INTEGER NOT NULL CHECK (received_qty_micros >= 0),
  minimum_qty_micros INTEGER NOT NULL CHECK (minimum_qty_micros >= 0),
  maximum_qty_micros INTEGER NOT NULL CHECK (maximum_qty_micros >= minimum_qty_micros),
  shortage_variance_micros INTEGER NOT NULL DEFAULT 0 CHECK (shortage_variance_micros >= 0),
  overage_variance_micros INTEGER NOT NULL DEFAULT 0 CHECK (overage_variance_micros >= 0),
  committed_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  command_id TEXT NOT NULL,
  reversal_of_entry_id TEXT,
  PRIMARY KEY (tenant_id, entry_id),
  UNIQUE (tenant_id, window_id, entry_kind),
  FOREIGN KEY (tenant_id, queue_key)
    REFERENCES purchase_obligation_queues(tenant_id, queue_key),
  FOREIGN KEY (tenant_id, window_id)
    REFERENCES purchase_settlement_windows(tenant_id, window_id),
  FOREIGN KEY (tenant_id, reversal_of_entry_id)
    REFERENCES purchase_settlement_entries(tenant_id, entry_id),
  CHECK (
    (entry_kind='close' AND reversal_of_entry_id IS NULL)
    OR (entry_kind='reverse' AND reversal_of_entry_id IS NOT NULL)
  ),
  CHECK (received_qty_micros BETWEEN minimum_qty_micros AND maximum_qty_micros),
  CHECK (NOT (shortage_variance_micros > 0 AND overage_variance_micros > 0)),
  CHECK (shortage_variance_micros = MAX(nominal_qty_micros - received_qty_micros, 0)),
  CHECK (overage_variance_micros = MAX(received_qty_micros - nominal_qty_micros, 0))
);
CREATE INDEX IF NOT EXISTS idx_purchase_settlement_window
  ON purchase_settlement_entries(tenant_id, window_id, committed_at);

CREATE TABLE IF NOT EXISTS purchase_allocation_revision_claims (
  tenant_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('queue','window')),
  scope_key TEXT NOT NULL,
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  claimed_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, command_id, scope_type, scope_key)
);
CREATE INDEX IF NOT EXISTS idx_purchase_revision_scope
  ON purchase_allocation_revision_claims(tenant_id, scope_type, scope_key, claimed_at);

CREATE TRIGGER IF NOT EXISTS purchase_obligation_window_guard
BEFORE INSERT ON purchase_window_obligation_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM purchase_settlement_windows
      WHERE tenant_id=NEW.tenant_id AND window_id=NEW.window_id
        AND queue_key=NEW.queue_key AND status='Open'
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_WINDOW_NOT_OPEN')
    WHEN NEW.source='live' AND NOT EXISTS (
      SELECT 1 FROM documents
      WHERE tenant_id=NEW.tenant_id
        AND doc_key='Purchase Order:' || NEW.purchase_order
        AND doctype='Purchase Order' AND docstatus=1
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_PO_NOT_SUBMITTED')
    WHEN NEW.source='live' AND NOT EXISTS (
      SELECT 1 FROM document_children
      WHERE tenant_id=NEW.tenant_id
        AND parent_key='Purchase Order:' || NEW.purchase_order
        AND fieldname='items' AND row_id=NEW.purchase_order_item_row_id
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_PO_ROW_NOT_FOUND')
    WHEN NEW.purchase_order_item_row_id IS NOT NULL AND COALESCE((
      SELECT SUM(qty_micros) FROM purchase_window_obligation_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order
        AND purchase_order_item_row_id=NEW.purchase_order_item_row_id
    ),0) + NEW.qty_micros < 0
      THEN RAISE(ABORT,'PURCHASE_OBLIGATION_QUANTITY_NEGATIVE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS purchase_allocation_reference_guard
BEFORE INSERT ON purchase_receipt_allocation_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM purchase_settlement_windows
      WHERE tenant_id=NEW.tenant_id AND window_id=NEW.window_id
        AND queue_key=NEW.queue_key AND status='Open'
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_WINDOW_NOT_OPEN')
    WHEN NEW.source='live' AND NOT EXISTS (
      SELECT 1 FROM document_children
      WHERE tenant_id=NEW.tenant_id
        AND parent_key='Purchase Receipt:' || NEW.voucher_no
        AND fieldname='items' AND row_id=NEW.receipt_item_row_id
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_RECEIPT_ROW_NOT_FOUND')
    WHEN NEW.source='live' AND NOT EXISTS (
      SELECT 1 FROM document_children
      WHERE tenant_id=NEW.tenant_id
        AND parent_key='Purchase Order:' || NEW.purchase_order
        AND fieldname='items' AND row_id=NEW.purchase_order_item_row_id
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_PO_ROW_NOT_FOUND')
    WHEN NEW.entry_kind='reverse' AND NOT EXISTS (
      SELECT 1 FROM purchase_receipt_allocation_entries source
      WHERE source.tenant_id=NEW.tenant_id AND source.entry_id=NEW.reversal_of_entry_id
        AND source.qty_micros > 0 AND source.queue_key=NEW.queue_key
        AND source.window_id=NEW.window_id
        AND source.purchase_order=NEW.purchase_order
        AND source.purchase_order_item_row_id IS NEW.purchase_order_item_row_id
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_REVERSAL_SOURCE_INVALID')
    WHEN NEW.entry_kind='reverse' AND COALESCE((
      SELECT SUM(-reversal.qty_micros)
      FROM purchase_receipt_allocation_entries reversal
      WHERE reversal.tenant_id=NEW.tenant_id
        AND reversal.reversal_of_entry_id=NEW.reversal_of_entry_id
        AND reversal.entry_kind='reverse'
    ),0) + (-NEW.qty_micros) > (
      SELECT source.qty_micros FROM purchase_receipt_allocation_entries source
      WHERE source.tenant_id=NEW.tenant_id AND source.entry_id=NEW.reversal_of_entry_id
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_REVERSAL_EXCEEDED')
    WHEN NEW.purchase_order_item_row_id IS NOT NULL AND COALESCE((
      SELECT SUM(qty_micros) FROM purchase_receipt_allocation_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order
        AND purchase_order_item_row_id=NEW.purchase_order_item_row_id
    ),0) + NEW.qty_micros < 0
      THEN RAISE(ABORT,'PURCHASE_ALLOCATION_QUANTITY_NEGATIVE')
    WHEN NEW.purchase_order_item_row_id IS NOT NULL AND COALESCE((
      SELECT SUM(qty_micros) FROM purchase_receipt_allocation_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order
        AND purchase_order_item_row_id=NEW.purchase_order_item_row_id
    ),0) + NEW.qty_micros > COALESCE((
      SELECT SUM(qty_micros) FROM purchase_window_obligation_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order
        AND purchase_order_item_row_id=NEW.purchase_order_item_row_id
    ),0) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_QUANTITY_EXCEEDED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS purchase_unapplied_balance_guard
BEFORE INSERT ON purchase_unapplied_receipt_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM purchase_settlement_windows
      WHERE tenant_id=NEW.tenant_id AND window_id=NEW.window_id
        AND queue_key=NEW.queue_key AND status='Open'
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_WINDOW_NOT_OPEN')
    WHEN NEW.entry_kind!='receive' AND NOT EXISTS (
      SELECT 1 FROM purchase_unapplied_receipt_entries source
      WHERE source.tenant_id=NEW.tenant_id AND source.entry_id=NEW.source_entry_id
        AND source.entry_kind='receive' AND source.qty_micros > 0
        AND source.window_id=NEW.window_id AND source.queue_key=NEW.queue_key
    ) THEN RAISE(ABORT,'PURCHASE_UNAPPLIED_SOURCE_INVALID')
    WHEN NEW.entry_kind!='receive' AND COALESCE((
      SELECT SUM(-movement.qty_micros)
      FROM purchase_unapplied_receipt_entries movement
      WHERE movement.tenant_id=NEW.tenant_id
        AND movement.source_entry_id=NEW.source_entry_id
        AND movement.entry_kind IN ('apply','reverse','settle')
    ),0) + (-NEW.qty_micros) > (
      SELECT source.qty_micros FROM purchase_unapplied_receipt_entries source
      WHERE source.tenant_id=NEW.tenant_id AND source.entry_id=NEW.source_entry_id
    ) THEN RAISE(ABORT,'PURCHASE_UNAPPLIED_QUANTITY_EXCEEDED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS purchase_settlement_close_guard
BEFORE INSERT ON purchase_settlement_entries
WHEN NEW.entry_kind='close'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM purchase_settlement_windows
      WHERE tenant_id=NEW.tenant_id AND window_id=NEW.window_id
        AND queue_key=NEW.queue_key AND status='Open'
    ) THEN RAISE(ABORT,'PURCHASE_SETTLEMENT_WINDOW_NOT_OPEN')
    WHEN EXISTS (
      SELECT 1 FROM purchase_window_obligation_entries
      WHERE tenant_id=NEW.tenant_id AND window_id=NEW.window_id
        AND resolution='legacy_unresolved'
    ) OR EXISTS (
      SELECT 1 FROM purchase_receipt_allocation_entries
      WHERE tenant_id=NEW.tenant_id AND window_id=NEW.window_id
        AND resolution='legacy_unresolved'
    ) THEN RAISE(ABORT,'PURCHASE_SETTLEMENT_LEGACY_UNRESOLVED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS purchase_settlement_close_apply
AFTER INSERT ON purchase_settlement_entries
WHEN NEW.entry_kind='close'
BEGIN
  UPDATE purchase_settlement_windows
  SET status='Settled', settled_at=NEW.committed_at,
      settled_by=NEW.actor, settlement_reason=NEW.reason
  WHERE tenant_id=NEW.tenant_id AND window_id=NEW.window_id;
END;

CREATE TRIGGER IF NOT EXISTS purchase_settlement_reverse_guard
BEFORE INSERT ON purchase_settlement_entries
WHEN NEW.entry_kind='reverse'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM purchase_settlement_entries source
      JOIN purchase_settlement_windows window
        ON window.tenant_id=source.tenant_id AND window.window_id=source.window_id
      WHERE source.tenant_id=NEW.tenant_id AND source.entry_id=NEW.reversal_of_entry_id
        AND source.entry_kind='close' AND source.window_id=NEW.window_id
        AND source.queue_key=NEW.queue_key AND window.status='Settled'
    ) THEN RAISE(ABORT,'PURCHASE_SETTLEMENT_REVERSAL_SOURCE_INVALID')
    WHEN EXISTS (
      SELECT 1 FROM purchase_settlement_windows later
      WHERE later.tenant_id=NEW.tenant_id AND later.queue_key=NEW.queue_key
        AND later.window_sequence > (
          SELECT current.window_sequence FROM purchase_settlement_windows current
          WHERE current.tenant_id=NEW.tenant_id AND current.window_id=NEW.window_id
        )
        AND (
          EXISTS (SELECT 1 FROM purchase_window_obligation_entries o
            WHERE o.tenant_id=later.tenant_id AND o.window_id=later.window_id)
          OR EXISTS (SELECT 1 FROM purchase_receipt_allocation_entries a
            WHERE a.tenant_id=later.tenant_id AND a.window_id=later.window_id)
          OR EXISTS (SELECT 1 FROM purchase_unapplied_receipt_entries u
            WHERE u.tenant_id=later.tenant_id AND u.window_id=later.window_id)
        )
    ) THEN RAISE(ABORT,'PURCHASE_SETTLEMENT_LATER_ACTIVITY_EXISTS')
  END;
END;

CREATE TRIGGER IF NOT EXISTS purchase_settlement_reverse_apply
AFTER INSERT ON purchase_settlement_entries
WHEN NEW.entry_kind='reverse'
BEGIN
  UPDATE purchase_settlement_windows
  SET status='Reversed'
  WHERE tenant_id=NEW.tenant_id AND window_id=NEW.window_id;
END;

CREATE TRIGGER IF NOT EXISTS purchase_revision_claim_guard
BEFORE INSERT ON purchase_allocation_revision_claims
BEGIN
  SELECT CASE
    WHEN NEW.scope_type='queue' AND COALESCE((
      SELECT revision FROM purchase_obligation_queues
      WHERE tenant_id=NEW.tenant_id AND queue_key=NEW.scope_key
    ),-1) != NEW.expected_revision
      THEN RAISE(ABORT,'PURCHASE_ALLOCATION_REVISION_CONFLICT')
    WHEN NEW.scope_type='window' AND COALESCE((
      SELECT revision FROM purchase_settlement_windows
      WHERE tenant_id=NEW.tenant_id AND window_id=NEW.scope_key
    ),-1) != NEW.expected_revision
      THEN RAISE(ABORT,'PURCHASE_ALLOCATION_REVISION_CONFLICT')
  END;
END;

CREATE TRIGGER IF NOT EXISTS purchase_revision_claim_apply
AFTER INSERT ON purchase_allocation_revision_claims
BEGIN
  UPDATE purchase_obligation_queues
  SET revision=revision+1, modified_at=NEW.claimed_at
  WHERE NEW.scope_type='queue'
    AND tenant_id=NEW.tenant_id AND queue_key=NEW.scope_key;
  UPDATE purchase_settlement_windows
  SET revision=revision+1
  WHERE NEW.scope_type='window'
    AND tenant_id=NEW.tenant_id AND window_id=NEW.scope_key;
END;

CREATE VIEW IF NOT EXISTS purchase_obligation_balances AS
SELECT
  obligation.tenant_id,
  obligation.queue_key,
  obligation.window_id,
  obligation.purchase_order,
  obligation.purchase_order_item_row_id,
  SUM(obligation.qty_micros) AS nominal_qty_micros,
  COALESCE((
    SELECT SUM(allocation.qty_micros)
    FROM purchase_receipt_allocation_entries allocation
    WHERE allocation.tenant_id=obligation.tenant_id
      AND allocation.purchase_order=obligation.purchase_order
      AND allocation.purchase_order_item_row_id IS obligation.purchase_order_item_row_id
  ),0) AS allocated_qty_micros,
  SUM(obligation.qty_micros) - COALESCE((
    SELECT SUM(allocation.qty_micros)
    FROM purchase_receipt_allocation_entries allocation
    WHERE allocation.tenant_id=obligation.tenant_id
      AND allocation.purchase_order=obligation.purchase_order
      AND allocation.purchase_order_item_row_id IS obligation.purchase_order_item_row_id
  ),0) AS remaining_qty_micros
FROM purchase_window_obligation_entries obligation
GROUP BY obligation.tenant_id, obligation.queue_key, obligation.window_id,
  obligation.purchase_order, obligation.purchase_order_item_row_id;

CREATE VIEW IF NOT EXISTS purchase_window_unapplied_balances AS
SELECT
  source.tenant_id,
  source.queue_key,
  source.window_id,
  source.voucher_no,
  source.receipt_item_row_id,
  source.entry_id AS source_entry_id,
  source.qty_micros + COALESCE(SUM(movement.qty_micros),0) AS remaining_qty_micros
FROM purchase_unapplied_receipt_entries source
LEFT JOIN purchase_unapplied_receipt_entries movement
  ON movement.tenant_id=source.tenant_id AND movement.source_entry_id=source.entry_id
WHERE source.entry_kind='receive'
GROUP BY source.tenant_id, source.queue_key, source.window_id,
  source.voucher_no, source.receipt_item_row_id, source.entry_id, source.qty_micros;
