-- RC-020 — Finance posting-period authority and immutable GL hardening.
--
-- 0042 established tenant/company/branch period guards, but Soft Closed still
-- accepted a client-supplied adjustment_approved_by value as approval evidence.
-- The document store already owns modified_by and writes it from the authenticated
-- command actor, while user_roles is tenant-scoped. This migration makes those
-- framework-owned values authoritative for Soft Closed adjustments.
--
-- gl_entries remains the canonical accounting ledger. Corrections append a new
-- voucher revision (normally via cancel/reversal + amendment); UPDATE/DELETE is
-- forbidden so history cannot be silently rewritten.

DROP TRIGGER IF EXISTS vn_accounting_period_insert_guard;
DROP TRIGGER IF EXISTS vn_accounting_period_update_old_guard;
DROP TRIGGER IF EXISTS vn_accounting_period_update_new_guard;

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
      SELECT 1 FROM documents p
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
      SELECT 1 FROM documents p
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
    )
    AND NOT (
      COALESCE(CAST((
        SELECT json_extract(p.payload_json, '$.allow_approved_adjustments')
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
        LIMIT 1
      ) AS INTEGER), 0)=1
      AND COALESCE(CAST(json_extract(NEW.payload_json, '$.approved_adjustment') AS INTEGER), 0)=1
      AND COALESCE(json_extract(NEW.payload_json, '$.adjustment_reason'), '')<>''
      AND COALESCE(NEW.modified_by, '')<>''
      AND EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.tenant_id=NEW.tenant_id
          AND ur.user_id=NEW.modified_by
          AND ur.role IN ('Chief Accountant','Accounts Manager','System Manager')
      )
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

-- Protect the original submitted scope. This covers cancel and moving an
-- already-posted voucher out of a closed period. Soft-close authority is the
-- authenticated actor of the current mutation (NEW.modified_by), while the
-- adjustment intent/reason comes from the historical submitted payload.
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
      SELECT 1 FROM documents p
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
      SELECT 1 FROM documents p
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
    )
    AND NOT (
      COALESCE(CAST((
        SELECT json_extract(p.payload_json, '$.allow_approved_adjustments')
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
        LIMIT 1
      ) AS INTEGER), 0)=1
      AND COALESCE(CAST(json_extract(OLD.payload_json, '$.approved_adjustment') AS INTEGER), 0)=1
      AND COALESCE(json_extract(OLD.payload_json, '$.adjustment_reason'), '')<>''
      AND COALESCE(NEW.modified_by, '')<>''
      AND EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.tenant_id=OLD.tenant_id
          AND ur.user_id=NEW.modified_by
          AND ur.role IN ('Chief Accountant','Accounts Manager','System Manager')
      )
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

-- Protect the destination submitted scope. This covers draft -> submit and
-- attempts to move posting date/company/branch into a closed period.
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
      SELECT 1 FROM documents p
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
      SELECT 1 FROM documents p
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
    )
    AND NOT (
      COALESCE(CAST((
        SELECT json_extract(p.payload_json, '$.allow_approved_adjustments')
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
        LIMIT 1
      ) AS INTEGER), 0)=1
      AND COALESCE(CAST(json_extract(NEW.payload_json, '$.approved_adjustment') AS INTEGER), 0)=1
      AND COALESCE(json_extract(NEW.payload_json, '$.adjustment_reason'), '')<>''
      AND COALESCE(NEW.modified_by, '')<>''
      AND EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.tenant_id=NEW.tenant_id
          AND ur.user_id=NEW.modified_by
          AND ur.role IN ('Chief Accountant','Accounts Manager','System Manager')
      )
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

DROP TRIGGER IF EXISTS finance_gl_entries_immutable_update;
DROP TRIGGER IF EXISTS finance_gl_entries_immutable_delete;

CREATE TRIGGER finance_gl_entries_immutable_update
BEFORE UPDATE ON gl_entries
BEGIN
  SELECT RAISE(ABORT, 'GL_ENTRY_IMMUTABLE');
END;

CREATE TRIGGER finance_gl_entries_immutable_delete
BEFORE DELETE ON gl_entries
BEGIN
  SELECT RAISE(ABORT, 'GL_ENTRY_IMMUTABLE');
END;
