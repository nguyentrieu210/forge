# CloudForge v1.0.0 — ERPNext Business Suite RC

## Banking

- Added Bank Transaction and Bank Reconciliation controllers.
- Bank account company, currency and ledger account are resolved from server master data.
- Reconciliation supports partial matching of a submitted bank transaction to submitted vouchers.
- Reconciliation is reversible on cancellation.
- Controller, in-memory commit and D1 trigger reject cumulative reconciliation above the bank transaction amount.
- Added Bank Reconciliation Summary report.

## Payroll core

- Added Salary Component, Salary Slip and Payroll Entry metadata/controllers.
- Salary Slip resolves earning/deduction accounts from server Salary Component masters.
- Salary Slip posts balanced GL and employee payable Payment Ledger entries.
- Payroll Entry groups submitted Salary Slips for one company/payroll period and derives employee count/net total.
- One Salary Slip cannot belong to two active submitted Payroll Entries; the guard exists at commit time.
- Added Payroll Register report.

## Subscriptions

- Added Subscription Plan and Subscription.
- Item, rate, currency and interval are server-derived from the plan/company master.
- Quantity and amount use fixed-point arithmetic.
- Next invoice date is deterministic and handles month-end boundaries.
- Added Subscription Schedule report.
- Automatic scheduler-driven invoice creation is intentionally not included.

## Regional provider queue

- Added E-Invoice Submission bound to a submitted Sales Invoice or Credit Note.
- Company and provider are server-derived from the source invoice and Regional Profile.
- The generic immutable outbox emits a submission lifecycle event.
- D1 and in-memory guards permit only one active submitted e-invoice record per source invoice.
- Provider-status updates require an accounting manager role.
- Added E-Invoice Submission Log report.
- No country certification or legal submission adapter is claimed.

## CRM and portal foundation

- Added standard metadata for Lead, Opportunity and Portal User.
- These are foundations only; complete CRM communications, website and customer/supplier self-service are not part of v1.0.

## Verification

- 109 Node/domain tests.
- Tenant migrations 0001–0009.
- Commercial and business-suite migration dry runs.
- SQL trigger attack tests and concurrency suites.
- Strict core and worker source TypeScript.
- Repository, plaintext-secret and source-parser gates.
- Fail-closed Business Suite readiness gate.

## Not claimed

Drop-in ERPNext/Frappe parity, Python app compatibility, full HR lifecycle, statutory payroll, automatic subscription billing, complete bank auto-matching/import connectors, complete fiscal consolidation, complete MRP/subcontracting, customer portal parity or certified regional statutory packs are not claimed.
