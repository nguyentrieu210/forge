-- R8-B: immutable identity for receipt-row targeted valuation adjustments.
-- Source-only migration; deployment remains outside this branch.
--
-- Landed Cost must never smear a receipt-specific charge across unrelated FIFO layers.
-- The source-row column identifies the physical Purchase Receipt row that created an SLE;
-- the valuation_target_* columns let a later zero-quantity SLE point back to that exact row.
ALTER TABLE stock_ledger_entries ADD COLUMN source_row_id TEXT;
ALTER TABLE stock_ledger_entries ADD COLUMN valuation_target_voucher_type TEXT;
ALTER TABLE stock_ledger_entries ADD COLUMN valuation_target_voucher_no TEXT;
ALTER TABLE stock_ledger_entries ADD COLUMN valuation_target_voucher_revision INTEGER;
ALTER TABLE stock_ledger_entries ADD COLUMN valuation_target_row_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sle_source_row
ON stock_ledger_entries(
  tenant_id,voucher_type,voucher_no,voucher_revision,source_row_id
)
WHERE source_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sle_valuation_target
ON stock_ledger_entries(
  tenant_id,valuation_target_voucher_type,valuation_target_voucher_no,
  valuation_target_voucher_revision,valuation_target_row_id
)
WHERE valuation_target_voucher_no IS NOT NULL;
