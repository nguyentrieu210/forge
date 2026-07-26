# Feature Matrix — CloudForge v0.9.0

Legend: **Hardened** = inherited commercial/source gates; **Beta** = implemented transaction path with migration and tests; **Foundation** = metadata/API seam only; **Missing** = no parity claim.

| Area | Maturity | v0.9 scope |
|---|---|---|
| Cloudflare tenant/auth/mutation kernel | Hardened | Gateway identity, WfP dispatch, tenant D1, DO serialization, OCC, idempotency, audit/outbox |
| Frappe metadata/permissions | Beta | DocType/fields, generic Desk, workflow subset, Permission V2, versions, comments, assignments, shares, R2 files, import/export/print |
| Selling/O2C | Hardened subset | SO→DN→SI→Customer Receipt, taxes/multicurrency subset, AR, returns/pricing previews |
| Buying/AP | Beta | PO→PR→PI→Supplier Payment, AP and procurement progress |
| Accounting | Beta | GL, Journal Entry, Expense Claim, Trial Balance, bounded P&L/Balance Sheet/Cash Flow views |
| Stock | Beta | Stock Entry, FIFO/Moving Average, COGS subset, valuation adjustment, serial/batch bundles, returns |
| Manufacturing | Beta | BOM, Work Order, Production Plan, Job Card, Manufacture Stock Entry, progress guards |
| Assets | Beta | Asset, depreciation, movement, maintenance, disposal and lifecycle reporting |
| Projects | Beta | Project/Task metadata, Timesheet, server activity rates, costing/billing projection, profitability report |
| Quality | Beta/Foundation | Quality Inspection is transactional; Non Conformance/Quality Action are metadata foundation |
| Support | Beta | Issue status and SLA due-time derivation; no email ingestion or customer portal |
| POS | Beta | Cash opening/invoice/closing, server price, stock/COGS and session guards |
| Bank reconciliation | Foundation | Bank Account/Transaction/Reconciliation metadata only; no matching engine |
| Regional/e-invoice | Foundation | Regional Profile, Tax Registration and E-Invoice Submission integration seam only |
| CRM, subscriptions, website/portal | Missing | No parity claim |
| HR/Payroll | Missing | No parity claim |
| Full Frappe app compatibility | Missing | No Python app/runtime compatibility |
| Country statutory packs | Missing | No legal certification or complete localization |

## Critical boundaries

- “ERPNext Suite Beta” is not a drop-in replacement for ERPNext.
- v0.9 financial statements are all-time account summaries and require correct Account master classification.
- Complete backdated repost of every downstream stock/COGS voucher remains open.
- Multi-company consolidation, full bank reconciliation, tax filing and statutory e-invoice packs remain open.
- New v0.9 modules require Workerd/Vite, pinned ERPNext oracle replay and staging evidence before external production use.
