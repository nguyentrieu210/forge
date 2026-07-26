# ERPNext Business Suite RC Runbook — v1.0.0

## 1. Verify the exact artifact

```bash
sha256sum -c CloudForge_v1.0.0_ERPNext_Business_Suite_RC.sha256
npm run verify:manifest
npm ci
```

Record the ZIP SHA-256, content-tree hash, Node/npm versions, operating system and Wrangler version.

## 2. Source and runtime gates

```bash
npm run check:business-suite
npm run typecheck:web
npm run test:workers
npm --prefix apps/web run build
```

Source readiness is insufficient if Workerd or Vite does not execute on the target Linux environment.

## 3. Migration rehearsal

- Clone a production-shaped tenant database.
- Back up and verify restore before mutation.
- Apply migrations 0001–0009 in order.
- Run `python3 scripts/test-business-suite-migration.py`.
- Run the SQL schema/invariant verifier and commercial reconciliation.
- Verify cancellation/reversal paths after migration.
- Restore the pre-migration backup and record recovery time.

## 4. Business-suite smoke matrix

Run through the Gateway with non-Administrator roles:

- Existing O2C/P2P/accounting/stock/manufacturing/assets/projects/quality/support/POS paths.
- Bank Transaction deposit and withdrawal.
- Partial Bank Reconciliation across multiple vouchers.
- Rejection of cumulative reconciliation above statement amount.
- Cancellation and re-reconciliation.
- Salary Slip with multiple earnings and deductions.
- Salary Slip GL/Payment Ledger reconciliation and cancellation.
- Payroll Entry grouping and duplicate Salary Slip rejection under concurrent requests.
- Monthly, quarterly and yearly subscriptions, including month-end dates.
- E-Invoice Submission source binding, provider derivation, duplicate-source rejection, outbox delivery and provider-status permission.
- Bank Reconciliation Summary, Payroll Register, Subscription Schedule and E-Invoice Submission Log in synchronous and prepared-report modes.

## 5. External integration and legal gates

- Implement provider adapters outside the accounting mutation kernel.
- Use idempotent provider request keys derived from tenant, source invoice and source version.
- Store provider secrets only in encrypted bindings.
- Redact payloads and provider responses from public errors/logs.
- Perform country-specific schema, signing, transport, retention and cancellation certification.
- Do not mark an E-Invoice Submission `Accepted` based only on queue delivery.

## 6. Load, isolation and recovery

- Attack Bank Reconciliation and Payroll Entry concurrently against Workerd+D1.
- Test multiple tenants with identical document names and bank/payroll identifiers.
- Run queue retry/dead-letter and outbox replay tests.
- Test R2, D1 backup/restore and tenant-specific recovery.
- Measure ledger/report latency with production-shaped GL, Stock Ledger and Payment Ledger volumes.

## 7. Promotion

Promotion requires immutable evidence tied to the exact ZIP SHA-256 for clean Linux install, all source/runtime gates, pinned ERPNext differential capture for promoted modules, migration rehearsal, staging smoke, load/security testing, reconciliation, provider/legal review, rollback and tenant restore. Missing evidence is a stop-ship condition.
