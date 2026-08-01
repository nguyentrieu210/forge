-- Organization, HRMS and Vietnamese accounting integrity controls.
-- Metadata/UI ships in apps-src/hrm and apps-src/vn-accounting. These database
-- guards protect the cross-document invariants that cannot be made safe with UI checks.

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employee_company_number
ON documents(
  tenant_id,
  json_extract(payload_json, '$.company'),
  json_extract(payload_json, '$.employee_number')
)
WHERE doctype='Employee'
  AND docstatus<>2
  AND COALESCE(json_extract(payload_json, '$.company'), '')<>''
  AND COALESCE(json_extract(payload_json, '$.employee_number'), '')<>'';

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_attendance_employee_date
ON documents(
  tenant_id,
  json_extract(payload_json, '$.employee'),
  json_extract(payload_json, '$.attendance_date')
)
WHERE doctype='Attendance'
  AND docstatus<>2
  AND COALESCE(json_extract(payload_json, '$.employee'), '')<>''
  AND COALESCE(json_extract(payload_json, '$.attendance_date'), '')<>'';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_accounting_source
ON documents(tenant_id, json_extract(payload_json, '$.payroll_entry'))
WHERE doctype='Payroll Accounting Batch'
  AND docstatus<>2
  AND COALESCE(json_extract(payload_json, '$.payroll_entry'), '')<>'';

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entry_source_payroll
ON documents(tenant_id, json_extract(payload_json, '$.source_payroll_entry'))
WHERE doctype='Journal Entry'
  AND docstatus<>2
  AND COALESCE(json_extract(payload_json, '$.source_payroll_entry'), '')<>'';

CREATE TRIGGER IF NOT EXISTS vn_accounting_period_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype IN (
  'Journal Entry', 'Sales Invoice', 'Purchase Invoice', 'Payment Entry',
  'Payroll Entry', 'Salary Slip', 'Payroll Accounting Batch', 'Stock Entry'
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
    ) AND NOT (
      json_extract(NEW.payload_json, '$.approved_adjustment')=1
      AND COALESCE(json_extract(NEW.payload_json, '$.adjustment_reason'), '')<>''
      AND COALESCE(json_extract(NEW.payload_json, '$.adjustment_approved_by'), '')<>''
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS vn_accounting_period_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype IN (
  'Journal Entry', 'Sales Invoice', 'Purchase Invoice', 'Payment Entry',
  'Payroll Entry', 'Salary Slip', 'Payroll Accounting Batch', 'Stock Entry'
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
    ) AND NOT (
      json_extract(NEW.payload_json, '$.approved_adjustment')=1
      AND COALESCE(json_extract(NEW.payload_json, '$.adjustment_reason'), '')<>''
      AND COALESCE(json_extract(NEW.payload_json, '$.adjustment_approved_by'), '')<>''
    ) THEN RAISE(ABORT, 'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;
