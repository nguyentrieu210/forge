# R8-B manufacturing operation-cost receipt slice

This change closes a bounded actual-operation capitalization gap. It does not close
R8-F11 parity or decide the rework operating model.

## Executable contract

An ordinary `Stock Entry` with purpose `Manufacture` may opt in to:

- `actual_operation_costs`: receipt-specific rows with unique `row_id`, `cost_type`
  (`Labor`, `Machine`, `Overhead`), decimal `amount`, and `clearing_account`;
- `operation_cost_stock_account`: the account debited for capitalization.

Amounts are in the company's base currency and scale, derived by the server. Client
`amount_minor` and `actual_operation_cost_minor` values are overwritten. Each amount
must be positive; missing/duplicate IDs and identical stock/clearing accounts fail.
Accounts must exist in the authenticated tenant, be active leaf accounts, and must not
belong to another company.

The total actual amount replaces the standard operation component already embedded in
this receipt's FG valuation. It is not added a second time. The implementation preserves
material valuation and scrap/offcut recovery, distributes the final FG value with integer
arithmetic, and adds balanced canonical GL rows: debit stock; credit the cost clearing
accounts. These credits capitalize amounts already accrued through separate finance
transactions; this slice does not calculate payroll or create a second cost ledger.

The existing kernel commits stock, GL and document together. Duplicate command replay
cannot capitalize twice. Cancellation uses the original stored GL rows, and the existing
stock cancellation uses the original stored stock rows. Cancellation payload amounts or
current clearing-account settings do not replace historical posting. Existing posting
period locks and administrator override behavior remain in force.

Omitting the optional rows preserves existing standard-cost behavior, including legacy
Work Order execution. No migration, importer or historical data rewrite is required.

## Verification

`tsc -p server/tsconfig.json` passes.

Focused execution covers standard-to-actual replacement, material/operation balance,
three cost categories, forged minor-unit fields, retry, exact stored stock/GL cancellation,
validation without postings, foreign/group/disabled accounts, period locks on submit and
cancel, and offcut value conservation. Existing manufacturing transaction closure,
legacy rollout, output-UOM, and costing-read tests also pass (15 focused tests). The
full manufacturing glob plus Alumdoor lifecycle and RC4 A13 release-confidence tests
passes 113/113.

## Remaining boundaries

- The existing cost-evidence reader remains a read-only projection of canonical stock
  valuation; it does not claim to verify source accruals or report posted variance GL.
- Cost amounts are explicitly supplied for each receipt. There is no automatic Job Card
  labor/machine-hour collection, workstation-rate accrual, payroll integration, WIP cost
  roll-forward, allocation policy, or variance account posting in this slice.
- Broad stock accounting, historical stock-to-finance restatement and backdated cost
  recomputation are not supplied by this receipt-local operation-cost posting.
- No costing UI or dedicated metadata form is added; this is a document transaction
  contract covered at the kernel boundary.
- Rework remains unresolved: rejected-FG consumption, original Work Order linkage,
  dedicated BOM/routing, and incremental-only work are different product contracts.
  Repository evidence does not select one safely.
- Phantom/substitute/alternate BOM depth, ATP supply netting and a pinned ERPNext
  runtime differential remain separate gaps. R8-F10/R8-F11 stay PARTIAL.
