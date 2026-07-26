# CloudForge v1.0.0 — ERPNext Business Suite RC

CloudForge is a Cloudflare-native ERP platform built on Workers for Platforms, Durable Objects, tenant D1, Queues/R2 and a metadata-driven React Desk. v1.0.0 is a broad **source-ready release candidate**, not a drop-in Frappe/ERPNext replacement and not production-approved from this environment.

## Implemented suite

- Frappe Core subset: tenant DocType metadata, generic form/list, workflow subset, Permission V2, versions, collaboration, files, print and CSV import/export.
- Selling/O2C and Buying/P2P transaction chains.
- Journal Entry, Expense Claim, receivable/payable ledgers and bounded financial reports.
- Stock Entry, FIFO/Moving Average, serial/batch, returns, pricing and valuation adjustment preview.
- BOM, Work Order, Production Plan, Job Card and Manufacture.
- Asset depreciation, movement, maintenance and disposal.
- Project Timesheet costing/profitability, Quality Inspection, Support Issue/SLA and cash POS sessions.
- Bounded Bank Transaction/Reconciliation engine with reversible partial matching and commit guards.
- Salary Slip accounting and Payroll Entry grouping.
- Subscription schedule calculation from server-owned plans.
- Source-bound E-Invoice Submission provider queue with uniqueness and role guards.
- Lead, Opportunity and Portal User metadata foundations.

## Verify

```bash
npm run verify:manifest
npm ci
npm run check:business-suite
npm run typecheck:web
npm run test:workers
npm --prefix apps/web run build
```

The packaged environment did not provide target-OS web/Workerd dependencies, so those executions remain mandatory promotion evidence.

## Read before use

- `FEATURE_MATRIX_v1.0.0.md`
- `RELEASE_NOTES_v1.0.0.md`
- `RUNBOOK_BUSINESS_SUITE_RC.md`
- `COMMERCIAL_COMPATIBILITY.md`
- `COMMERCIAL_RELEASE_GATE.md`
- `STATUS.md`

## Boundary

Do not market this artifact as “complete ERPNext on Cloudflare.” It does not provide Python/Frappe app compatibility, full HR lifecycle/statutory payroll, automatic subscription invoicing, complete bank statement connectors/auto-matching, complete fiscal consolidation, full MRP/subcontracting, full customer/supplier portal parity or certified country statutory packs.

E-invoice support is an audited provider queue seam. It is not legal certification in any jurisdiction.

## Authenticated command example

```http
POST /api/v1/commands
Authorization: Bearer <signed-jwt>
Content-Type: application/json

{
  "command_id": "client-generated-idempotency-key",
  "doctype": "Sales Order",
  "name": "SO-00001",
  "action": "create",
  "expected_version": null,
  "document": {}
}
```

Tenant, actor, roles, exchange rates, valuation, payroll accounts, subscription rates and authoritative accounting fields are resolved by the server, never from client identity headers.
