PRAGMA foreign_keys = ON;


CREATE TABLE IF NOT EXISTS master_records (
  tenant_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  name TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
  data_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data_json)),
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, record_type, name)
);

CREATE TABLE IF NOT EXISTS accounting_period_locks (
  tenant_id TEXT NOT NULL,
  company TEXT NOT NULL,
  lock_date TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, company)
);

CREATE TABLE IF NOT EXISTS documents (
  tenant_id TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  doctype TEXT NOT NULL,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  docstatus INTEGER NOT NULL CHECK (docstatus IN (0,1,2)),
  status TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  PRIMARY KEY (tenant_id, doc_key),
  UNIQUE (tenant_id, doctype, name)
);
CREATE INDEX IF NOT EXISTS idx_documents_type_modified ON documents(tenant_id, doctype, modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(tenant_id, doctype, docstatus, status);

CREATE TABLE IF NOT EXISTS document_children (
  tenant_id TEXT NOT NULL,
  parent_key TEXT NOT NULL,
  fieldname TEXT NOT NULL,
  child_doctype TEXT NOT NULL,
  row_id TEXT NOT NULL,
  idx INTEGER NOT NULL CHECK (idx > 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  PRIMARY KEY (tenant_id, parent_key, fieldname, row_id),
  FOREIGN KEY (tenant_id, parent_key) REFERENCES documents(tenant_id, doc_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_children_parent_order ON document_children(tenant_id, parent_key, fieldname, idx);

CREATE TABLE IF NOT EXISTS mutation_guard (
  tenant_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  expected_version INTEGER,
  action TEXT NOT NULL CHECK (action IN ('create','save','submit','cancel')),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash)=64),
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, command_id)
);

CREATE TRIGGER IF NOT EXISTS mutation_guard_existing
BEFORE INSERT ON mutation_guard
WHEN NEW.expected_version IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT version FROM documents WHERE tenant_id=NEW.tenant_id AND doc_key=NEW.doc_key) IS NULL
      THEN RAISE(ABORT, 'DOCUMENT_NOT_FOUND')
    WHEN (SELECT version FROM documents WHERE tenant_id=NEW.tenant_id AND doc_key=NEW.doc_key) != NEW.expected_version
      THEN RAISE(ABORT, 'VERSION_CONFLICT')
    WHEN NEW.action IN ('save','submit') AND (SELECT docstatus FROM documents WHERE tenant_id=NEW.tenant_id AND doc_key=NEW.doc_key) != 0
      THEN RAISE(ABORT, 'INVALID_LIFECYCLE_TRANSITION')
    WHEN NEW.action='cancel' AND (SELECT docstatus FROM documents WHERE tenant_id=NEW.tenant_id AND doc_key=NEW.doc_key) != 1
      THEN RAISE(ABORT, 'INVALID_LIFECYCLE_TRANSITION')
  END;
END;

CREATE TRIGGER IF NOT EXISTS mutation_guard_create
BEFORE INSERT ON mutation_guard
WHEN NEW.expected_version IS NULL
BEGIN
  SELECT CASE
    WHEN NEW.action!='create' THEN RAISE(ABORT, 'INVALID_LIFECYCLE_TRANSITION')
    WHEN (SELECT version FROM documents WHERE tenant_id=NEW.tenant_id AND doc_key=NEW.doc_key) IS NOT NULL
      THEN RAISE(ABORT, 'DOCUMENT_ALREADY_EXISTS')
  END;
END;

CREATE TABLE IF NOT EXISTS mutation_receipts (
  tenant_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  doctype TEXT NOT NULL,
  name TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL,
  payload_hash TEXT NOT NULL CHECK (length(payload_hash)=64),
  committed_at TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  PRIMARY KEY (tenant_id, command_id)
);

CREATE TABLE IF NOT EXISTS versions (
  tenant_id TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  command_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, doc_key, version)
);

CREATE TABLE IF NOT EXISTS outbox (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_key TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL,
  command_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  occurred_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','publishing','published','failed')),
  published_at TEXT,
  lease_until TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(tenant_id, status, occurred_at);

CREATE TABLE IF NOT EXISTS inbound_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  processed_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE TABLE IF NOT EXISTS gl_entries (
  tenant_id TEXT NOT NULL,
  voucher_type TEXT NOT NULL,
  voucher_no TEXT NOT NULL,
  voucher_revision INTEGER NOT NULL,
  line_key TEXT NOT NULL,
  account TEXT NOT NULL,
  party_type TEXT,
  party TEXT,
  debit_minor INTEGER NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor INTEGER NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  currency TEXT NOT NULL,
  currency_scale INTEGER NOT NULL CHECK (currency_scale BETWEEN 0 AND 6),
  cost_center TEXT,
  dimensions_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(dimensions_json)),
  remarks TEXT,
  posting_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, voucher_type, voucher_no, voucher_revision, line_key),
  CHECK (NOT (debit_minor > 0 AND credit_minor > 0))
);
CREATE INDEX IF NOT EXISTS idx_gl_account_posting ON gl_entries(tenant_id, account, posting_at);
CREATE INDEX IF NOT EXISTS idx_gl_party ON gl_entries(tenant_id, party_type, party, posting_at);

CREATE TABLE IF NOT EXISTS stock_ledger_entries (
  tenant_id TEXT NOT NULL,
  voucher_type TEXT NOT NULL,
  voucher_no TEXT NOT NULL,
  voucher_revision INTEGER NOT NULL,
  line_key TEXT NOT NULL,
  item_code TEXT NOT NULL,
  warehouse TEXT NOT NULL,
  actual_qty_micros INTEGER NOT NULL,
  valuation_rate_minor INTEGER NOT NULL CHECK (valuation_rate_minor >= 0),
  stock_value_difference_minor INTEGER NOT NULL,
  qty_scale INTEGER NOT NULL DEFAULT 6 CHECK (qty_scale=6),
  currency_scale INTEGER NOT NULL CHECK (currency_scale BETWEEN 0 AND 6),
  currency TEXT NOT NULL,
  posting_at TEXT NOT NULL,
  batch_no TEXT,
  serial_no TEXT,
  allow_negative_stock INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative_stock IN (0,1)),
  PRIMARY KEY (tenant_id, voucher_type, voucher_no, voucher_revision, line_key)
);
CREATE INDEX IF NOT EXISTS idx_sle_item_wh_posting ON stock_ledger_entries(tenant_id, item_code, warehouse, posting_at);

CREATE TRIGGER IF NOT EXISTS stock_balance_guard
BEFORE INSERT ON stock_ledger_entries
WHEN NEW.allow_negative_stock=0
  AND COALESCE((
    SELECT SUM(actual_qty_micros) FROM stock_ledger_entries
    WHERE tenant_id=NEW.tenant_id AND item_code=NEW.item_code AND warehouse=NEW.warehouse
  ),0) + NEW.actual_qty_micros < 0
BEGIN
  SELECT RAISE(ABORT, 'NEGATIVE_STOCK');
END;

CREATE TABLE IF NOT EXISTS sales_order_fulfillment_entries (
  tenant_id TEXT NOT NULL,
  voucher_type TEXT NOT NULL,
  voucher_no TEXT NOT NULL,
  voucher_revision INTEGER NOT NULL,
  line_key TEXT NOT NULL,
  sales_order TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('Delivery','Billing')),
  item_code TEXT NOT NULL,
  qty_micros INTEGER NOT NULL,
  posting_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, voucher_type, voucher_no, voucher_revision, line_key)
);
CREATE INDEX IF NOT EXISTS idx_so_fulfillment_reference
  ON sales_order_fulfillment_entries(tenant_id, sales_order, kind, item_code, posting_at);

CREATE TRIGGER IF NOT EXISTS fulfillment_reference_guard
BEFORE INSERT ON sales_order_fulfillment_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM documents
      WHERE tenant_id=NEW.tenant_id
        AND doc_key='Sales Order:' || NEW.sales_order
        AND doctype='Sales Order'
        AND docstatus=1
    ) THEN RAISE(ABORT, 'REFERENCE_SOURCE_NOT_FOUND')
    WHEN NOT EXISTS (
      SELECT 1 FROM document_children
      WHERE tenant_id=NEW.tenant_id
        AND parent_key='Sales Order:' || NEW.sales_order
        AND fieldname='items'
        AND json_extract(payload_json, '$.item_code')=NEW.item_code
    ) THEN RAISE(ABORT, 'REFERENCE_ITEM_NOT_FOUND')
    WHEN COALESCE((
      SELECT SUM(qty_micros) FROM sales_order_fulfillment_entries
      WHERE tenant_id=NEW.tenant_id AND sales_order=NEW.sales_order
        AND kind=NEW.kind AND item_code=NEW.item_code
    ),0) + NEW.qty_micros < 0 THEN RAISE(ABORT, 'REFERENCE_QUANTITY_NEGATIVE')
    WHEN COALESCE((
      SELECT SUM(qty_micros) FROM sales_order_fulfillment_entries
      WHERE tenant_id=NEW.tenant_id AND sales_order=NEW.sales_order
        AND kind=NEW.kind AND item_code=NEW.item_code
    ),0) + NEW.qty_micros > (
      SELECT COALESCE(SUM(CAST(json_extract(payload_json, '$.qty_micros') AS INTEGER)),0)
      FROM document_children
      WHERE tenant_id=NEW.tenant_id
        AND parent_key='Sales Order:' || NEW.sales_order
        AND fieldname='items'
        AND json_extract(payload_json, '$.item_code')=NEW.item_code
    ) THEN RAISE(ABORT, 'REFERENCE_QUANTITY_EXCEEDED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS sales_order_cancel_reference_guard
BEFORE INSERT ON mutation_guard
WHEN NEW.action='cancel'
  AND (SELECT doctype FROM documents WHERE tenant_id=NEW.tenant_id AND doc_key=NEW.doc_key)='Sales Order'
  AND COALESCE((
    SELECT SUM(qty_micros) FROM sales_order_fulfillment_entries
    WHERE tenant_id=NEW.tenant_id
      AND sales_order=(SELECT name FROM documents WHERE tenant_id=NEW.tenant_id AND doc_key=NEW.doc_key)
  ),0) != 0
BEGIN
  SELECT RAISE(ABORT, 'ACTIVE_FULFILLMENT_EXISTS');
END;

CREATE TABLE IF NOT EXISTS payment_ledger_entries (
  tenant_id TEXT NOT NULL,
  voucher_type TEXT NOT NULL,
  voucher_no TEXT NOT NULL,
  voucher_revision INTEGER NOT NULL,
  line_key TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('Receivable','Payable')),
  party_type TEXT NOT NULL,
  party TEXT NOT NULL,
  account TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  currency_scale INTEGER NOT NULL CHECK (currency_scale BETWEEN 0 AND 6),
  against_voucher_type TEXT,
  against_voucher_no TEXT,
  posting_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, voucher_type, voucher_no, voucher_revision, line_key)
);
CREATE INDEX IF NOT EXISTS idx_ple_party_reference ON payment_ledger_entries(tenant_id, party_type, party, against_voucher_type, against_voucher_no);


CREATE TRIGGER IF NOT EXISTS receivable_outstanding_guard
BEFORE INSERT ON payment_ledger_entries
WHEN NEW.against_voucher_type IS NOT NULL AND NEW.against_voucher_no IS NOT NULL
  AND COALESCE((
    SELECT SUM(amount_minor) FROM payment_ledger_entries
    WHERE tenant_id=NEW.tenant_id
      AND against_voucher_type=NEW.against_voucher_type
      AND against_voucher_no=NEW.against_voucher_no
  ),0) + NEW.amount_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'OUTSTANDING_EXCEEDED');
END;

CREATE TRIGGER IF NOT EXISTS sales_invoice_cancel_payment_guard
BEFORE INSERT ON mutation_guard
WHEN NEW.action='cancel'
  AND (SELECT doctype FROM documents WHERE tenant_id=NEW.tenant_id AND doc_key=NEW.doc_key)='Sales Invoice'
  AND COALESCE((
    SELECT SUM(amount_minor) FROM payment_ledger_entries
    WHERE tenant_id=NEW.tenant_id
      AND against_voucher_type='Sales Invoice'
      AND against_voucher_no=(SELECT name FROM documents WHERE tenant_id=NEW.tenant_id AND doc_key=NEW.doc_key)
  ),0) != COALESCE(CAST((
    SELECT json_extract(payload_json, '$.grand_total_minor')
    FROM documents WHERE tenant_id=NEW.tenant_id AND doc_key=NEW.doc_key
  ) AS INTEGER),0)
BEGIN
  SELECT RAISE(ABORT, 'ACTIVE_PAYMENT_ALLOCATIONS');
END;
