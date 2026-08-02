-- Harden Vietnamese accounting-period integrity after migration 0035 and HRM migrations 0039-0041.
--
-- 0035 protected only submit/update paths where NEW.docstatus=1. That left
-- cancellation (1 -> 2) able to reverse ledger entries inside a locked period,
-- omitted several Forge documents that can post GL, and ignored the period-level
-- allow_approved_adjustments switch. This migration replaces those guards without
-- rewriting already-applied migration history.

DROP TRIGGER IF EXISTS vn_accounting_period_insert_guard;
DROP TRIGGER IF EXISTS vn_accounting_period_update_guard;
DROP TRIGGER IF EXISTS vn_accounting_period_update_old_guard;
DROP TRIGGER IF EXISTS vn_accounting_period_update_new_guard;
DROP TRIGGER IF EXISTS vn_accounting_period_range_insert_guard;
DROP TRIGGER IF EXISTS vn_accounting_period_range_update_guard;

-- Accounting periods for the same company may overlap only when they are scoped
-- to different explicit branches. A company-wide period (blank branch) conflicts
-- with every branch period for the same dates.
CREATE TRIGGER vn_accounting_period_range_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Accounting Period'
  AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json, '$.start_date')) IS NULL
      OR date(json_extract(NEW.payload_json, '$.end_date')) IS NULL
      OR date(json_extract(NEW.payload_json, '$.start_date')) > date(json_extract(NEW.payload_json, '$.end_date'))
    THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_INVALID_RANGE')
    WHEN EXISTS (
      SELECT 1
      FROM documents p
      WHERE p.tenant_id=NEW.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus<>2
        AND json_extract(p.payload_json, '$.company')=json_extract(NEW.payload_json, '$.company')
        AND (
          COALESCE(json_extract(p.payload_json, '$.branch'), '')=''
          OR COALESCE(json_extract(NEW.payload_json, '$.branch'), '')=''
          OR json_extract(p.payload_json, '$.branch')=json_extract(NEW.payload_json, '$.branch')
        )
        AND date(json_extract(p.payload_json, '$.start_date')) <= date(json_extract(NEW.payload_json, '$.end_date'))
        AND date(json_extract(p.payload_json, '$.end_date')) >= date(json_extract(NEW.payload_json, '$.start_date'))
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_OVERLAP')
  END;
END;

CREATE TRIGGER vn_accounting_period_range_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Accounting Period'
  AND NEW.docstatus<>2
  AND (
    NEW.payload_json IS NOT OLD.payload_json
    OR NEW.docstatus IS NOT OLD.docstatus
  )
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json, '$.start_date')) IS NULL
      OR date(json_extract(NEW.payload_json, '$.end_date')) IS NULL
      OR date(json_extract(NEW.payload_json, '$.start_date')) > date(json_extract(NEW.payload_json, '$.end_date'))
    THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_INVALID_RANGE')
    WHEN EXISTS (
      SELECT 1
      FROM documents p
      WHERE p.tenant_id=NEW.tenant_id
        AND p.doc_key<>OLD.doc_key
        AND p.doctype='VN Accounting Period'
        AND p.docstatus<>2
        AND json_extract(p.payload_json, '$.company')=json_extract(NEW.payload_json, '$.company')
        AND (
          COALESCE(json_extract(p.payload_json, '$.branch'), '')=''
          OR COALESCE(json_extract(NEW.payload_json, '$.branch'), '')=''
          OR json_extract(p.payload_json, '$.branch')=json_extract(NEW.payload_json, '$.branch')
        )
        AND date(json_extract(p.payload_json, '$.start_date')) <= date(json_extract(NEW.payload_json, '$.end_date'))
        AND date(json_extract(p.payload_json, '$.end_date')) >= date(json_extract(NEW.payload_json, '$.start_date'))
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_OVERLAP')
  END;
END;

-- Known accounting/stock documents whose submit/cancel can mutate authoritative
-- financial or valuation ledgers. Keep the database boundary authoritative even
-- when a controller or UI misses a period check.
CREATE TRIGGER vn_accounting_period_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype IN (
  'Journal Entry', 'Sales Invoice', 'Purchase Invoice', 'Payment Entry',
  'Purchase Receipt', 'Delivery Note', 'Payroll Entry', 'Salary Slip',
  'Payroll Accounting Batch', 'Stock Entry', 'Stock Reconciliation',
  'Warehouse Cash Voucher', 'Warehouse Cash Transfer'
)
AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM documents p
      WHERE p.tenant_id=NEW.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json, '$.close_state')='Hard Locked'
        AND json_extract(p.payload_json, '$.company')=json_extract(NEW.payload_json, '$.company')
        AND (
          COALESCE(json_extract(p.payload_json, '$.branch'), '')=''
          OR json_extract(p.payload_json, '$.branch')=json_extract(NEW.payload_json, '$.branch')
        )
        AND date(COALESCE(
          json_extract(NEW.payload_json, '$.posting_date'),
          json_extract(NEW.payload_json, '$.posting_at'),
          json_extract(NEW.payload_json, '$.transaction_date')
        )) BETWEEN date(json_extract(p.payload_json, '$.start_date')) AND date(json_extract(p.payload_json, '$.end_date'))
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_HARD_LOCKED')
    WHEN EXISTS (
      SELECT 1
      FROM documents p
      WHERE p.tenant_id=NEW.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json, '$.close_state')='Soft Closed'
        AND json_extract(p.payload_json, '$.company')=json_extract(NEW.payload_json, '$.company')
        AND (
          COALESCE(json_extract(p.payload_json, '$.branch'), '')=''
          OR json_extract(p.payload_json, '$.branch')=json_extract(NEW.payload_json, '$.branch')
        )
        AND date(COALESCE(
          json_extract(NEW.payload_json, '$.posting_date'),
          json_extract(NEW.payload_json, '$.posting_at'),
          json_extract(NEW.payload_json, '$.transaction_date')
        )) BETWEEN date(json_extract(p.payload_json, '$.start_date')) AND date(json_extract(p.payload_json, '$.end_date'))
        AND NOT (
          COALESCE(CAST(json_extract(p.payload_json, '$.allow_approved_adjustments') AS INTEGER), 0)=1
          AND COALESCE(CAST(json_extract(NEW.payload_json, '$.approved_adjustment') AS INTEGER), 0)=1
          AND COALESCE(json_extract(NEW.payload_json, '$.adjustment_reason'), '')<>''
          AND COALESCE(json_extract(NEW.payload_json, '$.adjustment_approved_by'), '')<>''
        )
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

-- Protect the ORIGINAL submitted scope. This closes the 1 -> 2 cancel bypass
-- and prevents moving an already-posted document out of a locked period by
-- changing its company/date in the same update.
CREATE TRIGGER vn_accounting_period_update_old_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype IN (
  'Journal Entry', 'Sales Invoice', 'Purchase Invoice', 'Payment Entry',
  'Purchase Receipt', 'Delivery Note', 'Payroll Entry', 'Salary Slip',
  'Payroll Accounting Batch', 'Stock Entry', 'Stock Reconciliation',
  'Warehouse Cash Voucher', 'Warehouse Cash Transfer'
)
AND OLD.docstatus=1
AND (
  NEW.docstatus IS NOT OLD.docstatus
  OR NEW.payload_json IS NOT OLD.payload_json
)
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM documents p
      WHERE p.tenant_id=OLD.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json, '$.close_state')='Hard Locked'
        AND json_extract(p.payload_json, '$.company')=json_extract(OLD.payload_json, '$.company')
        AND (
          COALESCE(json_extract(p.payload_json, '$.branch'), '')=''
          OR json_extract(p.payload_json, '$.branch')=json_extract(OLD.payload_json, '$.branch')
        )
        AND date(COALESCE(
          json_extract(OLD.payload_json, '$.posting_date'),
          json_extract(OLD.payload_json, '$.posting_at'),
          json_extract(OLD.payload_json, '$.transaction_date')
        )) BETWEEN date(json_extract(p.payload_json, '$.start_date')) AND date(json_extract(p.payload_json, '$.end_date'))
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_HARD_LOCKED')
    WHEN EXISTS (
      SELECT 1
      FROM documents p
      WHERE p.tenant_id=OLD.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json, '$.close_state')='Soft Closed'
        AND json_extract(p.payload_json, '$.company')=json_extract(OLD.payload_json, '$.company')
        AND (
          COALESCE(json_extract(p.payload_json, '$.branch'), '')=''
          OR json_extract(p.payload_json, '$.branch')=json_extract(OLD.payload_json, '$.branch')
        )
        AND date(COALESCE(
          json_extract(OLD.payload_json, '$.posting_date'),
          json_extract(OLD.payload_json, '$.posting_at'),
          json_extract(OLD.payload_json, '$.transaction_date')
        )) BETWEEN date(json_extract(p.payload_json, '$.start_date')) AND date(json_extract(p.payload_json, '$.end_date'))
        AND NOT (
          COALESCE(CAST(json_extract(p.payload_json, '$.allow_approved_adjustments') AS INTEGER), 0)=1
          AND COALESCE(CAST(json_extract(OLD.payload_json, '$.approved_adjustment') AS INTEGER), 0)=1
          AND COALESCE(json_extract(OLD.payload_json, '$.adjustment_reason'), '')<>''
          AND COALESCE(json_extract(OLD.payload_json, '$.adjustment_approved_by'), '')<>''
        )
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

-- Protect the NEW submitted scope too. This covers draft -> submit and prevents a
-- submitted document being moved into a locked period by a payload update.
CREATE TRIGGER vn_accounting_period_update_new_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype IN (
  'Journal Entry', 'Sales Invoice', 'Purchase Invoice', 'Payment Entry',
  'Purchase Receipt', 'Delivery Note', 'Payroll Entry', 'Salary Slip',
  'Payroll Accounting Batch', 'Stock Entry', 'Stock Reconciliation',
  'Warehouse Cash Voucher', 'Warehouse Cash Transfer'
)
AND NEW.docstatus=1
AND (
  OLD.docstatus<>1
  OR NEW.payload_json IS NOT OLD.payload_json
)
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM documents p
      WHERE p.tenant_id=NEW.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json, '$.close_state')='Hard Locked'
        AND json_extract(p.payload_json, '$.company')=json_extract(NEW.payload_json, '$.company')
        AND (
          COALESCE(json_extract(p.payload_json, '$.branch'), '')=''
          OR json_extract(p.payload_json, '$.branch')=json_extract(NEW.payload_json, '$.branch')
        )
        AND date(COALESCE(
          json_extract(NEW.payload_json, '$.posting_date'),
          json_extract(NEW.payload_json, '$.posting_at'),
          json_extract(NEW.payload_json, '$.transaction_date')
        )) BETWEEN date(json_extract(p.payload_json, '$.start_date')) AND date(json_extract(p.payload_json, '$.end_date'))
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_HARD_LOCKED')
    WHEN EXISTS (
      SELECT 1
      FROM documents p
      WHERE p.tenant_id=NEW.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json, '$.close_state')='Soft Closed'
        AND json_extract(p.payload_json, '$.company')=json_extract(NEW.payload_json, '$.company')
        AND (
          COALESCE(json_extract(p.payload_json, '$.branch'), '')=''
          OR json_extract(p.payload_json, '$.branch')=json_extract(NEW.payload_json, '$.branch')
        )
        AND date(COALESCE(
          json_extract(NEW.payload_json, '$.posting_date'),
          json_extract(NEW.payload_json, '$.posting_at'),
          json_extract(NEW.payload_json, '$.transaction_date')
        )) BETWEEN date(json_extract(p.payload_json, '$.start_date')) AND date(json_extract(p.payload_json, '$.end_date'))
        AND NOT (
          COALESCE(CAST(json_extract(p.payload_json, '$.allow_approved_adjustments') AS INTEGER), 0)=1
          AND COALESCE(CAST(json_extract(NEW.payload_json, '$.approved_adjustment') AS INTEGER), 0)=1
          AND COALESCE(json_extract(NEW.payload_json, '$.adjustment_reason'), '')<>''
          AND COALESCE(json_extract(NEW.payload_json, '$.adjustment_approved_by'), '')<>''
        )
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;
