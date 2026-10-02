-- R8-B customer-credit cash-refund authority.
--
-- A fully-paid return may leave a negative Receivable balance against the Credit Note
-- itself.  That is a source credit, analogous to an unallocated Payment Entry advance:
-- later refund/reconciliation rows may consume it toward zero, never cross above zero,
-- and must preserve party/account/currency identity.  No mutable customer-credit wallet
-- or shadow balance is introduced.

DROP TRIGGER IF EXISTS payment_customer_credit_outstanding_guard;
CREATE TRIGGER payment_customer_credit_outstanding_guard
BEFORE INSERT ON payment_ledger_entries
WHEN NEW.against_voucher_type='Credit Note'
BEGIN
  SELECT CASE
    WHEN COALESCE((
      SELECT SUM(amount_minor) FROM payment_ledger_entries
      WHERE tenant_id=NEW.tenant_id
        AND against_voucher_type='Credit Note'
        AND against_voucher_no=NEW.against_voucher_no
    ),0) + NEW.amount_minor > 0
      THEN RAISE(ABORT, 'CUSTOMER_CREDIT_EXCEEDED')
    WHEN EXISTS(
      SELECT 1 FROM payment_ledger_entries
      WHERE tenant_id=NEW.tenant_id
        AND against_voucher_type='Credit Note'
        AND against_voucher_no=NEW.against_voucher_no
        AND (party_type<>NEW.party_type OR party<>NEW.party OR account<>NEW.account
             OR currency<>NEW.currency OR currency_scale<>NEW.currency_scale
             OR account_type<>NEW.account_type)
    ) THEN RAISE(ABORT, 'CUSTOMER_CREDIT_CONTEXT_MISMATCH')
  END;
END;

DROP TRIGGER IF EXISTS payment_customer_credit_base_outstanding_guard;
CREATE TRIGGER payment_customer_credit_base_outstanding_guard
BEFORE INSERT ON payment_ledger_entries
WHEN NEW.against_voucher_type='Credit Note'
 AND COALESCE((
   SELECT SUM(base_amount_minor) FROM payment_ledger_entries
   WHERE tenant_id=NEW.tenant_id
     AND against_voucher_type='Credit Note'
     AND against_voucher_no=NEW.against_voucher_no
 ),0) + NEW.base_amount_minor > 0
 AND COALESCE((
   SELECT SUM(amount_minor) FROM payment_ledger_entries
   WHERE tenant_id=NEW.tenant_id
     AND against_voucher_type='Credit Note'
     AND against_voucher_no=NEW.against_voucher_no
 ),0) + NEW.amount_minor <= 0
BEGIN
  SELECT RAISE(ABORT, 'CUSTOMER_CREDIT_BASE_EXCEEDED');
END;
