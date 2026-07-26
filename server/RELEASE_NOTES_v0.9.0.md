# CloudForge v0.9.0 — ERPNext Suite Beta

## Production execution

- Added Production Plan and Job Card controllers.
- Time-log duration and completed quantity are server-derived.
- Cumulative Job Card completion is guarded against Work Order quantity in controller, in-memory commit and D1 trigger.

## Asset lifecycle

- Added Asset Movement, Asset Maintenance and Asset Disposal.
- Disposal uses server asset cost/depreciation, posts balanced GL, prevents duplicate active disposal and supports reversal.
- Added Asset Lifecycle report.

## Projects, Quality and Support

- Timesheet resolves server Activity Type rates and writes immutable project time/cost/billing projection.
- Added Project Profitability report.
- Quality Inspection derives Accepted/Rejected from numeric limits.
- Issue derives SLA response/resolution deadlines from server SLA master.

## Expenses and POS

- Expense Claim posts expense GL, employee payable and Payment Ledger.
- POS Opening/Invoice/Closing provides cash-session subset with server profile, pricing, stock valuation and COGS.
- One active session per profile and closed-session mutation guards are enforced at commit time.
- Added POS Session Summary report.

## Accounting/report breadth

- Added bounded Profit and Loss, Balance Sheet and Cash Flow account-summary views.
- Unknown/unclassified accounts are excluded rather than guessed into a statement class.
- Added bank-reconciliation and regional/e-invoice metadata seams; these are not complete engines or statutory packs.

## Verification

- 104 Node/domain tests.
- Tenant migrations 0001–0008.
- SQL trigger attack tests, migration dry run and concurrency suites.
- Strict core and worker source TypeScript.
- Repository, secret and source-parser gates.

## Not claimed

Full ERPNext/Frappe parity, complete fiscal statements, complete repost graph, full MRP/routing, offline/mixed-payment POS, CAPA, support email/portal, bank matching, HR/Payroll, CRM, website and country statutory certification are not claimed.
