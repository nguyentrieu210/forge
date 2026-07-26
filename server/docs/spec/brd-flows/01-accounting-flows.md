# CloudERP Accounting Flows

> Mỗi flow có actor, precondition, happy path, failure branches, transaction boundary, events và oracle.

## A1 — Journal posting
- **Actor:** Accounts User
- **Precondition:** open period, balanced lines
- **Happy path:**
  1. Create draft journal
  2. Validate dimensions/accounts/currency
  3. Submit voucher
  4. Post immutable GL entries
  5. Update balances/read models
- **Nhánh lỗi:**
  - debit≠credit
  - closed period
  - invalid party/account
- **Transaction/Event:** Voucher+GL+audit+outbox one transaction
- **Oracle:** trial balance unchanged net; fixture parity

## A2 — Sales invoice to receivable
- **Actor:** Accounts/Sales User
- **Precondition:** customer/items/tax valid
- **Happy path:**
  1. Calculate totals/tax
  2. Submit invoice
  3. Post income/tax/receivable GL
  4. Update outstanding/payment ledger
  5. Emit invoice event
- **Nhánh lỗi:**
  - credit limit
  - stock/tax/period error
- **Transaction/Event:** Invoice+ledger atomic
- **Oracle:** invoice totals, GL, outstanding parity

## A3 — Purchase invoice to payable
- **Actor:** Accounts/Purchase User
- **Precondition:** supplier/receipt/tax valid
- **Happy path:**
  1. Validate qty/rate/tax
  2. Submit invoice
  3. Post expense/asset/tax/payable
  4. Update outstanding
  5. Emit payable event
- **Nhánh lỗi:**
  - duplicate supplier invoice
  - overbilling
  - withholding error
- **Transaction/Event:** Atomic
- **Oracle:** AP aging + GL parity

## A4 — Payment and reconciliation
- **Actor:** Accounts User
- **Precondition:** bank/cash and party outstanding
- **Happy path:**
  1. Create payment
  2. Allocate references
  3. Post cash/bank and party GL/payment ledger
  4. Reconcile statement
  5. Update outstanding
- **Nhánh lỗi:**
  - over-allocation
  - duplicate statement row
  - currency mismatch
- **Transaction/Event:** Atomic payment/allocation
- **Oracle:** bank/party/outstanding parity

## A5 — Close/revalue/reconcile
- **Actor:** Accounts Manager
- **Precondition:** period data complete
- **Happy path:**
  1. Run checks
  2. Post revaluation/closing vouchers
  3. Freeze period
  4. Generate evidence
  5. Allow explicit reopen/reversal
- **Nhánh lỗi:**
  - unbalanced ledger
  - open exceptions
  - failed tax/stock reconcile
- **Transaction/Event:** Workflow + atomic vouchers
- **Oracle:** trial balance/FX/control evidence
