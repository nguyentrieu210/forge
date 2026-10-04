-- R8-B: refuse silently incomplete revaluation of foreign non-party balances.
-- Canonical GL has company-currency debit/credit only, not account-currency units.
-- Do not infer foreign bank units from an invoice/payment transaction currency.
-- Historical Account metadata remains relevant even when disabled/cancelled.
-- This guard keeps the capability PARTIAL until dual-currency GL is implemented.

CREATE VIEW finance_fx_non_party_accounts AS
SELECT d.tenant_id,d.name,
  COALESCE(NULLIF(TRIM(json_extract(d.payload_json,'$.account_currency')),''),
    NULLIF(TRIM(json_extract(d.payload_json,'$.currency')),'')) AS account_currency,
  TRIM(COALESCE(json_extract(d.payload_json,'$.account_type'),'')) AS account_type,
  TRIM(COALESCE(json_extract(d.payload_json,'$.root_type'),'')) AS root_type
FROM documents d
WHERE d.doctype='Account'
UNION ALL
SELECT m.tenant_id,m.name,
  COALESCE(NULLIF(TRIM(json_extract(m.data_json,'$.account_currency')),''),
    NULLIF(TRIM(json_extract(m.data_json,'$.currency')),'')),
  TRIM(COALESCE(json_extract(m.data_json,'$.account_type'),'')),
  TRIM(COALESCE(json_extract(m.data_json,'$.root_type'),''))
FROM master_records m
WHERE m.record_type='Account'
  AND NOT EXISTS (SELECT 1 FROM documents d
    WHERE d.tenant_id=m.tenant_id AND d.doctype='Account' AND d.name=m.name);

CREATE TRIGGER finance_fx_non_party_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Exchange Rate Revaluation' AND NEW.docstatus=1
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM gl_entries g
    JOIN documents d ON d.tenant_id=g.tenant_id
      AND d.doctype=g.voucher_type AND d.name=g.voucher_no
    JOIN finance_fx_non_party_accounts a ON a.tenant_id=g.tenant_id AND a.name=g.account
    WHERE g.tenant_id=NEW.tenant_id
      AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND date(g.posting_at) BETWEEN '0001-01-01' AND date(json_extract(NEW.payload_json,'$.posting_at'))
      AND a.account_currency<>json_extract(NEW.payload_json,'$.company_currency')
      AND a.account_type NOT IN ('Receivable','Payable')
      AND (a.root_type IN ('Asset','Liability') OR a.account_type IN ('Bank','Cash'))
    GROUP BY g.account,g.currency,g.currency_scale
    HAVING SUM(g.debit_minor-g.credit_minor)<>0
  ) THEN RAISE(ABORT,'FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED') END;
END;

CREATE TRIGGER finance_fx_non_party_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='Exchange Rate Revaluation' AND NEW.docstatus=1 AND OLD.docstatus<>1
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM gl_entries g
    JOIN documents d ON d.tenant_id=g.tenant_id
      AND d.doctype=g.voucher_type AND d.name=g.voucher_no
    JOIN finance_fx_non_party_accounts a ON a.tenant_id=g.tenant_id AND a.name=g.account
    WHERE g.tenant_id=NEW.tenant_id
      AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND date(g.posting_at) BETWEEN '0001-01-01' AND date(json_extract(NEW.payload_json,'$.posting_at'))
      AND a.account_currency<>json_extract(NEW.payload_json,'$.company_currency')
      AND a.account_type NOT IN ('Receivable','Payable')
      AND (a.root_type IN ('Asset','Liability') OR a.account_type IN ('Bank','Cash'))
    GROUP BY g.account,g.currency,g.currency_scale
    HAVING SUM(g.debit_minor-g.credit_minor)<>0
  ) THEN RAISE(ABORT,'FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED') END;
END;

