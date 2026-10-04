-- Zero company-currency net does not prove zero foreign account units.
-- Opposite flows at different rates can net to zero in base currency while
-- leaving foreign units. Canonical GL has no independent account amounts yet.
-- Refuse any nonzero gross foreign non-party activity, including apparent
-- cancellation history, until immutable dual amounts prove the foreign net.
-- No second ledger or statement-based balance authority is introduced.
DROP TRIGGER finance_fx_non_party_insert_guard;
DROP TRIGGER finance_fx_non_party_update_guard;

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
      AND (g.debit_minor<>0 OR g.credit_minor<>0)
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
      AND (g.debit_minor<>0 OR g.credit_minor<>0)
  ) THEN RAISE(ABORT,'FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED') END;
END;

