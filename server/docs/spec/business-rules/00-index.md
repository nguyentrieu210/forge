# Business Rule Ledger Index

> Critical business behavior is written here; source manifest supplies exact schema/path/hash. Neither substitutes for the other.

| Suite | Rule ledger | File |
|---|---|---|
| ERP | Company & Accounting Basis | `business-rules/erp/company-accounting-basis.md` |
| ERP | Journal Entry | `business-rules/erp/journal-entry.md` |
| ERP | Sales Order | `business-rules/erp/sales-order.md` |
| ERP | Delivery Note | `business-rules/erp/delivery-note.md` |
| ERP | Sales Invoice | `business-rules/erp/sales-invoice.md` |
| ERP | Payment Entry | `business-rules/erp/payment-entry.md` |
| ERP | Purchase Order | `business-rules/erp/purchase-order.md` |
| ERP | Purchase Receipt | `business-rules/erp/purchase-receipt.md` |
| ERP | Purchase Invoice | `business-rules/erp/purchase-invoice.md` |
| ERP | Stock Entry | `business-rules/erp/stock-entry.md` |
| ERP | Stock Reconciliation | `business-rules/erp/stock-reconciliation.md` |
| ERP | Serial, Batch & Valuation | `business-rules/erp/serial-batch-valuation.md` |
| ERP | Pricing, Taxes & Totals | `business-rules/erp/pricing-taxes.md` |
| ERP | BOM & Production Plan | `business-rules/erp/bom-production-plan.md` |
| ERP | Work Order & Job Card | `business-rules/erp/work-order-job-card.md` |
| ERP | Landed Cost Voucher | `business-rules/erp/landed-cost.md` |
| ERP | Asset Lifecycle | `business-rules/erp/asset-lifecycle.md` |
| ERP | Period Close, Repost & Reconciliation | `business-rules/erp/period-close-repost.md` |
| ERP | POS Invoice & Closing | `business-rules/erp/pos-invoice.md` |
| HR | Employee Lifecycle | `business-rules/hr/employee-lifecycle.md` |
| HR | Leave Application & Balance | `business-rules/hr/leave-application.md` |
| HR | Attendance, Shift & Auto Attendance | `business-rules/hr/attendance-shift.md` |
| HR | Salary Structure & Assignment | `business-rules/hr/salary-structure.md` |
| HR | Payroll Entry | `business-rules/hr/payroll-entry.md` |
| HR | Salary Slip | `business-rules/hr/salary-slip.md` |
| HR | Expense Claim & Employee Advance | `business-rules/hr/expense-advance.md` |
| CRM | CRM Lead | `business-rules/crm/lead.md` |
| CRM | CRM Deal & Pipeline | `business-rules/crm/deal.md` |
| CRM | CRM Communications | `business-rules/crm/communications.md` |
| CRM | Assignment, SLA & Automation | `business-rules/crm/assignment-sla.md` |
| CRM | CRM ↔ ERP Sync | `business-rules/crm/erp-sync.md` |
| INSIGHTS | Insights Data Source | `business-rules/insights/data-source.md` |
| INSIGHTS | Visual Query, SQL & Python Runtime | `business-rules/insights/query-runtime.md` |
| INSIGHTS | Workbook & Chart | `business-rules/insights/workbook-chart.md` |
| INSIGHTS | Dashboard, Filters & Sharing | `business-rules/insights/dashboard-sharing.md` |
| INSIGHTS | Refresh, Cache & Export | `business-rules/insights/refresh-export.md` |

## Coverage rule

- Critical voucher/process must have its own ledger above.
- Non-critical master DocType inherits generic document runtime plus exact source manifest.
- An artifact with no rule ledger and non-trivial controller is `UNMAPPED_BEHAVIOR` and blocks release.
