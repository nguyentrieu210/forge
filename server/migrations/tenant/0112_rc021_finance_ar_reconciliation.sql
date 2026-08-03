-- RC-021 Accounts Receivable hardening.
--
-- Authority stays unchanged:
--   Sales Invoice + Payment Entry / Payment Allocation -> Payment Ledger + GL.
-- This migration adds fail-closed credit-note document guards and a derived
-- reconciliation projection. It does not add a balance table or mutable AR ledger.

CREATE TRIGGER IF NOT EXISTS ar_credit_note_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Sales Invoice'
 AND NEW.docstatus=1
 AND COALESCE(CAST(json_extract(NEW.payload_json,'$.is_return') AS INTEGER),0)=1
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.return_against'),'')=''
      THEN RAISE(ABORT,'AR_CREDIT_NOTE_SOURCE_REQUIRED')
    WHEN json_extract(NEW.payload_json,'$.return_against')=NEW.name
      THEN RAISE(ABORT,'AR_CREDIT_NOTE_SELF_REFERENCE')
    WHEN NOT EXISTS(
      SELECT 1
      FROM documents source
      WHERE source.tenant_id=NEW.tenant_id
        AND source.doctype='Sales Invoice'
        AND source.name=json_extract(NEW.payload_json,'$.return_against')
        AND source.docstatus=1
        AND COALESCE(CAST(json_extract(source.payload_json,'$.is_return') AS INTEGER),0)=0
        AND json_extract(source.payload_json,'$.customer')=json_extract(NEW.payload_json,'$.customer')
        AND json_extract(source.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(source.payload_json,'$.currency')=json_extract(NEW.payload_json,'$.currency')
        AND json_extract(source.payload_json,'$.debit_to')=json_extract(NEW.payload_json,'$.debit_to')
    ) THEN RAISE(ABORT,'AR_CREDIT_NOTE_SOURCE_INVALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ar_credit_note_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Sales Invoice'
 AND NEW.docstatus=1
 AND COALESCE(CAST(json_extract(NEW.payload_json,'$.is_return') AS INTEGER),0)=1
 AND (
   OLD.docstatus<>1
   OR OLD.payload_json IS NOT NEW.payload_json
 )
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.return_against'),'')=''
      THEN RAISE(ABORT,'AR_CREDIT_NOTE_SOURCE_REQUIRED')
    WHEN json_extract(NEW.payload_json,'$.return_against')=NEW.name
      THEN RAISE(ABORT,'AR_CREDIT_NOTE_SELF_REFERENCE')
    WHEN NOT EXISTS(
      SELECT 1
      FROM documents source
      WHERE source.tenant_id=NEW.tenant_id
        AND source.doctype='Sales Invoice'
        AND source.name=json_extract(NEW.payload_json,'$.return_against')
        AND source.docstatus=1
        AND COALESCE(CAST(json_extract(source.payload_json,'$.is_return') AS INTEGER),0)=0
        AND json_extract(source.payload_json,'$.customer')=json_extract(NEW.payload_json,'$.customer')
        AND json_extract(source.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(source.payload_json,'$.currency')=json_extract(NEW.payload_json,'$.currency')
        AND json_extract(source.payload_json,'$.debit_to')=json_extract(NEW.payload_json,'$.debit_to')
    ) THEN RAISE(ABORT,'AR_CREDIT_NOTE_SOURCE_INVALID')
  END;
END;

-- Reconciliation is a projection over the two canonical accounting journals.
-- Payment Ledger base amounts and customer-dimension GL net debit should match
-- for every tenant/company/customer/receivable-account/company-currency scope.
-- Payment Allocation has no GL by design and only redistributes Payment Ledger
-- references, so it nets to zero at this control-account level.
DROP VIEW IF EXISTS finance_ar_reconciliation;
CREATE VIEW finance_ar_reconciliation AS
WITH payment_side AS (
  SELECT
    p.tenant_id,
    json_extract(d.payload_json,'$.company') AS company,
    p.party,
    p.account,
    COALESCE(json_extract(d.payload_json,'$.company_currency'),p.currency) AS company_currency,
    COALESCE(CAST(json_extract(d.payload_json,'$.company_currency_scale') AS INTEGER),2) AS company_currency_scale,
    SUM(p.base_amount_minor) AS payment_ledger_base_minor
  FROM payment_ledger_entries p
  JOIN documents d
    ON d.tenant_id=p.tenant_id
   AND d.doctype=p.voucher_type
   AND d.name=p.voucher_no
  WHERE p.account_type='Receivable'
    AND p.party_type='Customer'
  GROUP BY
    p.tenant_id,company,p.party,p.account,company_currency,company_currency_scale
),
gl_side AS (
  SELECT
    g.tenant_id,
    json_extract(d.payload_json,'$.company') AS company,
    g.party,
    g.account,
    g.currency AS company_currency,
    g.currency_scale AS company_currency_scale,
    SUM(g.debit_minor-g.credit_minor) AS gl_receivable_base_minor
  FROM gl_entries g
  JOIN documents d
    ON d.tenant_id=g.tenant_id
   AND d.doctype=g.voucher_type
   AND d.name=g.voucher_no
  WHERE g.party_type='Customer'
    AND g.party IS NOT NULL
  GROUP BY
    g.tenant_id,company,g.party,g.account,g.currency,g.currency_scale
),
scopes AS (
  SELECT tenant_id,company,party,account,company_currency,company_currency_scale FROM payment_side
  UNION
  SELECT tenant_id,company,party,account,company_currency,company_currency_scale FROM gl_side
)
SELECT
  s.tenant_id,
  s.company,
  s.party,
  s.account,
  s.company_currency,
  s.company_currency_scale,
  COALESCE(p.payment_ledger_base_minor,0) AS payment_ledger_base_minor,
  COALESCE(g.gl_receivable_base_minor,0) AS gl_receivable_base_minor,
  COALESCE(g.gl_receivable_base_minor,0)-COALESCE(p.payment_ledger_base_minor,0) AS difference_minor,
  CASE
    WHEN COALESCE(g.gl_receivable_base_minor,0)=COALESCE(p.payment_ledger_base_minor,0) THEN 1
    ELSE 0
  END AS reconciled
FROM scopes s
LEFT JOIN payment_side p
  ON p.tenant_id=s.tenant_id
 AND p.company=s.company
 AND p.party=s.party
 AND p.account=s.account
 AND p.company_currency=s.company_currency
 AND p.company_currency_scale=s.company_currency_scale
LEFT JOIN gl_side g
  ON g.tenant_id=s.tenant_id
 AND g.company=s.company
 AND g.party=s.party
 AND g.account=s.account
 AND g.company_currency=s.company_currency
 AND g.company_currency_scale=s.company_currency_scale;

-- Expose credit/return semantics through the existing metadata-driven Sales
-- Invoice form. These fields are presentation/input only; controller + ledger
-- remain the server authority.
UPDATE doctype_definitions
SET metadata_json=json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"is_return","label":"Credit / Return","fieldtype":"Check","default":0,"in_standard_filter":true}')
    ),
    revision=revision+1,
    modified_by='migration',
    modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='Sales Invoice'
  AND NOT EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.fields')
    WHERE json_extract(value,'$.fieldname')='is_return'
  );

UPDATE doctype_definitions
SET metadata_json=json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"return_against","label":"Return Against","fieldtype":"Link","options":"Sales Invoice","depends_on":"eval:doc.is_return==1","mandatory_depends_on":"eval:doc.is_return==1","search_index":true}')
    ),
    revision=revision+1,
    modified_by='migration',
    modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='Sales Invoice'
  AND NOT EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.fields')
    WHERE json_extract(value,'$.fieldname')='return_against'
  );