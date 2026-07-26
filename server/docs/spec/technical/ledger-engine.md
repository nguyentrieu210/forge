# Accounting & Stock Ledger Engine

## Accounting
- Every posting voucher emits balanced debit/credit entries by company/currency/dimension.
- Submitted GL entries are append-only; correction by reversal/repost voucher.
- Payment allocation/outstanding is derived from immutable payment ledger facts.

## Stock
- Every stock movement emits immutable SLE with qty-after, valuation rate, stock value difference and traceability.
- Serial/batch custody is unique and reconciles with stock ledger.
- Valuation repost is durable, resumable and evidence-producing; downstream entries are versioned.

## Cross-ledger
- Stock/accounting voucher entries commit in the same business transaction where applicable.
- Reconciliation gates: trial balance, stock quantity/value, stock-vs-GL, AR/AP outstanding, asset/depreciation, payroll-to-GL.
