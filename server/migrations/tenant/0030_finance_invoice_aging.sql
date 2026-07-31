-- Finance AR/AP due-date and aging foundation.
--
-- Outstanding remains derived from the immutable Payment Ledger. This migration
-- only adds canonical invoice-term validation, a JSON projection for report
-- queries, and metadata for the Sales Invoice due-date field.

CREATE TRIGGER IF NOT EXISTS finance_invoice_due_date_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype IN ('Sales Invoice', 'Purchase Invoice') AND NEW.docstatus = 1
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json, '$.due_date'), '') = ''
      THEN RAISE(ABORT, 'INVOICE_DUE_DATE_REQUIRED')
    WHEN length(json_extract(NEW.payload_json, '$.due_date')) <> 10
      OR date(json_extract(NEW.payload_json, '$.due_date')) IS NULL
      OR date(json_extract(NEW.payload_json, '$.due_date')) <> json_extract(NEW.payload_json, '$.due_date')
      THEN RAISE(ABORT, 'INVOICE_DUE_DATE_INVALID')
    WHEN date(json_extract(NEW.payload_json, '$.posting_at')) IS NULL
      THEN RAISE(ABORT, 'INVOICE_POSTING_DATE_INVALID')
    WHEN date(json_extract(NEW.payload_json, '$.due_date')) < date(json_extract(NEW.payload_json, '$.posting_at'))
      THEN RAISE(ABORT, 'INVOICE_DUE_DATE_BEFORE_POSTING')
  END;
END;

CREATE TRIGGER IF NOT EXISTS finance_invoice_due_date_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype IN ('Sales Invoice', 'Purchase Invoice')
 AND NEW.docstatus = 1
 AND (
   OLD.docstatus <> 1
   OR json_extract(NEW.payload_json, '$.due_date') IS NOT json_extract(OLD.payload_json, '$.due_date')
 )
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json, '$.due_date'), '') = ''
      THEN RAISE(ABORT, 'INVOICE_DUE_DATE_REQUIRED')
    WHEN length(json_extract(NEW.payload_json, '$.due_date')) <> 10
      OR date(json_extract(NEW.payload_json, '$.due_date')) IS NULL
      OR date(json_extract(NEW.payload_json, '$.due_date')) <> json_extract(NEW.payload_json, '$.due_date')
      THEN RAISE(ABORT, 'INVOICE_DUE_DATE_INVALID')
    WHEN date(json_extract(NEW.payload_json, '$.posting_at')) IS NULL
      THEN RAISE(ABORT, 'INVOICE_POSTING_DATE_INVALID')
    WHEN date(json_extract(NEW.payload_json, '$.due_date')) < date(json_extract(NEW.payload_json, '$.posting_at'))
      THEN RAISE(ABORT, 'INVOICE_DUE_DATE_BEFORE_POSTING')
  END;
END;

-- Legacy submitted invoices are deliberately not rewritten. The projection
-- falls back to posting date so aging stays deterministic until the explicit
-- backfill/cutover milestone reviews old data.
CREATE VIEW IF NOT EXISTS finance_invoice_terms AS
SELECT
  tenant_id,
  doctype AS voucher_type,
  name AS voucher_no,
  json_extract(payload_json, '$.company') AS company,
  CASE doctype
    WHEN 'Sales Invoice' THEN json_extract(payload_json, '$.customer')
    ELSE json_extract(payload_json, '$.supplier')
  END AS party,
  CASE doctype
    WHEN 'Sales Invoice' THEN json_extract(payload_json, '$.debit_to')
    ELSE json_extract(payload_json, '$.credit_to')
  END AS account,
  json_extract(payload_json, '$.currency') AS currency,
  COALESCE(CAST(json_extract(payload_json, '$.currency_scale') AS INTEGER), 2) AS currency_scale,
  date(json_extract(payload_json, '$.posting_at')) AS posting_date,
  COALESCE(
    date(json_extract(payload_json, '$.due_date')),
    date(json_extract(payload_json, '$.posting_at'))
  ) AS due_date,
  COALESCE(CAST(json_extract(payload_json, '$.grand_total_minor') AS INTEGER), 0) AS invoice_total_minor
FROM documents
WHERE doctype IN ('Sales Invoice', 'Purchase Invoice')
  AND docstatus = 1;

-- Purchase Invoice already exposes due_date. Add the same metadata field to
-- Sales Invoice without rewriting the generator-produced historical migration.
UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"due_date","label":"Due Date","fieldtype":"Date","in_list_view":true,"in_standard_filter":true}')
    ),
    revision = revision + 1,
    modified_by = 'migration',
    modified_at = '2026-07-31T00:00:00.000Z'
WHERE doctype = 'Sales Invoice'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(metadata_json, '$.fields')
    WHERE json_extract(value, '$.fieldname') = 'due_date'
  );
