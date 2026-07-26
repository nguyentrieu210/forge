# Feature Matrix — CloudForge v1.0.0

Legend: **Hardened subset** = inherited commercial/source gates and mature transaction path; **RC** = implemented path with migration, invariant and regression tests but runtime/oracle/staging promotion remains open; **Foundation** = metadata/API seam without a complete transaction engine; **Missing** = no parity claim.

| Area | Maturity | v1.0 scope |
|---|---|---|
| Cloudflare tenant/auth/mutation kernel | Hardened subset | Gateway identity, Workers for Platforms dispatch, tenant D1, Durable Object serialization, OCC, actor-bound idempotency, immutable ledgers, audit and outbox |
| Frappe metadata/permissions | RC | Tenant DocType/DocField registry, generic Desk, workflow subset, Permission V2, versions, comments, assignments, shares, private R2 files, print and CSV import/export |
| Selling/O2C | Hardened subset | Sales Order → Delivery Note → Sales Invoice → Customer Payment, advanced-tax and multicurrency subset, AR, pricing and bounded returns |
| Buying/AP | RC | Purchase Order → Purchase Receipt → Purchase Invoice → Supplier Payment, procurement progress and AP |
| Accounting | RC | GL, Journal Entry, Expense Claim, transaction/base Payment Ledger, Trial Balance and bounded financial statement views |
| Stock | RC | Stock Entry, FIFO/Moving Average, COGS subset, valuation adjustment/repost subset, serial/batch bundles and returns |
| Manufacturing | RC | BOM, Work Order, Production Plan, Job Card and Manufacture Stock Entry with cumulative guards |
| Assets | RC | Asset, depreciation, movement, maintenance, disposal and lifecycle reporting |
| Projects | RC | Project/Task metadata, Timesheet costing/billing projection and profitability report |
| Quality | RC/Foundation | Quality Inspection transactional subset; Non Conformance and Quality Action metadata foundation |
| Support | RC | Issue lifecycle and server-derived SLA deadlines; no email ingestion or complete portal |
| POS | RC | Cash opening, invoice and closing; server pricing, stock/COGS and session commit guards |
| Bank reconciliation | RC | Bank Transaction, partial/manual voucher matching, reversible reconciliation and commit-time over-reconciliation guard |
| Payroll | RC | Salary Component-derived Salary Slip accounting and Payroll Entry grouping with duplicate-slip guard |
| Subscriptions | RC subset | Server-derived plan item/rate/interval and next-invoice schedule; no automatic invoice scheduler |
| Regional/e-invoice | RC integration seam | Source-bound provider queue, audit/outbox event and one-active-submission guard; no statutory certification |
| CRM | Foundation | Lead and Opportunity metadata only; no complete campaign, communication or quotation automation |
| Website/portal | Foundation | Portal User metadata only; no complete customer/supplier portal or website runtime parity |
| HR lifecycle | Missing | Recruitment, onboarding, attendance, shifts, leave, appraisal, loans, benefits and payroll tax/statutory filing are not implemented |
| Full Frappe app compatibility | Missing | No Python app/runtime, hooks or drop-in custom app compatibility |
| Country statutory packs | Missing | No certified tax return, payroll filing, fiscal device or legal e-invoice pack |

## Critical boundaries

- “ERPNext Business Suite RC” is not a drop-in replacement for ERPNext or Frappe.
- Financial statements are bounded account summaries, not complete fiscal closing, consolidation or every ERPNext accounting report.
- Stock repost remains bounded; full downstream replay of every backdated stock and COGS dependency is not claimed.
- Payroll does not include attendance/leave inputs, statutory tax, benefits, loans or bank payment automation.
- Subscription records a deterministic schedule but does not generate invoices automatically.
- E-invoice records are provider queue/audit objects only. Every country deployment requires a certified adapter, legal review and acceptance tests.
- Workerd, Vite production build, pinned ERPNext differential replay and Cloudflare staging evidence are required before external production promotion.
