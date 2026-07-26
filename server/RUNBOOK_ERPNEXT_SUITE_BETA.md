# ERPNext Suite Beta Runbook — v0.9.0

## 1. Artifact verification

```bash
sha256sum -c CloudForge_v0.9.0_ERPNext_Suite_Beta.sha256
npm run verify:manifest
npm ci
```

## 2. Source and runtime gates

```bash
npm run check:erpnext-suite
npm run test:workers
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
```

Record immutable logs and exact Node/npm/OS/Cloudflare tool versions.

## 3. Migration rehearsal

- Clone production-shaped tenant data.
- Apply migrations 0001–0008 in order.
- Confirm no unclassified Account masters are expected in financial statement views.
- Run schema/invariant verifier and commercial reconciliation.
- Verify rollback/restore from pre-migration backup.

## 4. Module smoke matrix

- O2C and P2P full chains including cancellation.
- Journal Entry and Expense Claim balance/reversal.
- FIFO and Moving Average stock, serial/batch and returns.
- BOM→Work Order→Production Plan→Job Card→Manufacture.
- Asset depreciation→movement→maintenance→disposal→cancel.
- Project Timesheet and profitability report.
- Quality accepted/rejected cases.
- Issue SLA priorities and resolution validation.
- POS open→sell→close; reject second open session, post-close invoice and post-close cancellation.
- Every new report through synchronous and prepared mode.

## 5. Differential and load

Capture pinned ERPNext fixtures for all v0.9 transaction paths. Run concurrent Job Card, POS session, stock, payment, return and depreciation attacks against Workerd+D1. Do not promote on mismatch or unexplained timeout.

## 6. Promotion

Promotion requires clean reconciliation, tenant isolation/security review, staging smoke, queue/outbox health, backup/restore drill, rollback drill and evidence tied to the exact ZIP SHA-256. Regional integrations require separate country-specific legal validation.
