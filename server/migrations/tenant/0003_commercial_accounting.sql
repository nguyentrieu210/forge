-- Commercial accounting hardening.
-- Existing pre-v0.4 deployments were single-currency, so amount_minor is a
-- safe backfill for the new company-currency reconciliation amount.
ALTER TABLE payment_ledger_entries
  ADD COLUMN base_amount_minor INTEGER NOT NULL DEFAULT 0;

UPDATE payment_ledger_entries
SET base_amount_minor = amount_minor;

CREATE TRIGGER IF NOT EXISTS receivable_base_outstanding_guard
BEFORE INSERT ON payment_ledger_entries
WHEN NEW.against_voucher_type IS NOT NULL AND NEW.against_voucher_no IS NOT NULL
  AND COALESCE((
    SELECT SUM(base_amount_minor) FROM payment_ledger_entries
    WHERE tenant_id=NEW.tenant_id
      AND against_voucher_type=NEW.against_voucher_type
      AND against_voucher_no=NEW.against_voucher_no
  ),0) + NEW.base_amount_minor < 0
BEGIN
  SELECT RAISE(ABORT, 'BASE_OUTSTANDING_EXCEEDED');
END;


-- Recreate the AR projection so transaction- and company-currency balances
-- can be reconciled from the same immutable Payment Ledger rows.
DROP VIEW IF EXISTS receivable_outstanding;
CREATE VIEW receivable_outstanding AS
SELECT tenant_id, party, currency, currency_scale, against_voucher_type, against_voucher_no,
       SUM(amount_minor) AS outstanding_minor,
       SUM(base_amount_minor) AS base_outstanding_minor,
       CAST(SUM(amount_minor) AS REAL) / CASE currency_scale
         WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
         WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS outstanding_amount
FROM payment_ledger_entries
WHERE account_type='Receivable'
GROUP BY tenant_id, party, currency, currency_scale, against_voucher_type, against_voucher_no;
