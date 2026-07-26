# Commercial Operations Runbook

> **v0.8 maturity note:** this runbook promotes only the hardened O2C subset. Frappe Core Beta follows `RUNBOOK_FRAPPE_CORE_BETA.md`; valuation/serial-batch/returns/manufacturing/assets follow `RUNBOOK_ERPNEXT_CORE_PREVIEW.md`. Preview features are excluded from automatic GA claims. — O2C Limited GA

## 1. Build and test

Run on Linux/WSL2 with Node 22:

```bash
npm ci
npm run check:full
npm --prefix apps/web run build
npm run verify:commercial
```

Preserve command output as immutable evidence.

## 2. Migration rehearsal

Local migration mechanics are covered by:

```bash
python3 scripts/test-commercial-migration.py
```

Before promotion, apply migrations 0001–0003 to a clone/export of production-shaped tenant data. Migration 0003 adds `base_amount_minor`, backfills supplied pre-commercial single-currency rows from `amount_minor`, adds the base-outstanding trigger and recreates the AR projection.

Verify:

```sql
SELECT COUNT(*) FROM payment_ledger_entries WHERE base_amount_minor IS NULL;

SELECT against_voucher_type, against_voucher_no,
       SUM(amount_minor), SUM(base_amount_minor)
FROM payment_ledger_entries
WHERE against_voucher_type IS NOT NULL AND against_voucher_no IS NOT NULL
GROUP BY against_voucher_type, against_voucher_no
HAVING SUM(amount_minor) < 0 OR SUM(base_amount_minor) < 0
    OR (SUM(amount_minor) = 0 AND SUM(base_amount_minor) <> 0);
```

Any independent historic multicurrency deployment requires a reviewed backfill based on original invoice base totals and allocations. Do not rely on the single-currency backfill.

## 3. Staging deployment order

1. Export/backup the tenant database.
2. Deploy Control Plane.
3. Rebuild reverse tenant route records until `next_after_tenant_id` is null.
4. Put tenant secrets into encrypted dispatch bindings and verify names.
5. Apply D1 migrations.
6. Deploy Tenant Worker.
7. Deploy Jobs and Query Workers.
8. Deploy Gateway.
9. Deploy the web app.
10. Run synthetic smoke and reconciliation.

## 4. Reconciliation probe

Call the Tenant Worker through a protected operator/service path, never through the public Gateway:

```bash
curl -fsS \
  -H "Authorization: Bearer $INTERNAL_SERVICE_TOKEN" \
  https://TENANT_WORKER/internal/reconciliation
```

It checks bounded tenant-scoped findings for:

- GL imbalance by voucher revision;
- negative or transaction/base reference drift;
- GL customer receivable vs Payment Ledger base outstanding;
- ledger/document posting-date mismatch;
- orphan Payment Ledger references;
- failed outbox events.

HTTP 200 and `ok: true` are required. HTTP 409 is stop-ship.

## 5. Staging smoke

Use synthetic data only:

- create/submit SO;
- partial and full DN;
- SI with inclusive/multi-row tax and round-off;
- foreign SI and fully allocated Payment Entry;
- three-part FX payment rounding case;
- verify unallocated receipt is rejected;
- cancel PE, SI and DN in valid order;
- AR and Stock Balance;
- retry same `command_id` after simulated lost response;
- two stale-version conflict;
- outbox flush/delivery/replay.

Run reconciliation after smoke and again after cancellation.

## 6. Backup and restore drill

Before GA, execute a tenant-specific D1 export/restore in staging. Restore to a separate database/tenant identity. Compare:

- documents and versions counts;
- audit and receipt counts;
- GL debit/credit totals by voucher/currency;
- Payment Ledger transaction/base totals;
- stock quantities and values;
- outbox/inbox state;
- AR/Stock reports;
- reconciliation result.

Record commands, timestamps, database identifiers, output hashes and comparison results. Never include secret values in evidence.

## 7. Rollback

Worker/web rollback may deploy a previous **migration-compatible** release. Migration 0003 is forward-only; never drop or ignore `base_amount_minor` after application.

A valid drill must prove:

- previous compatible Workers can read the migrated schema;
- posting is paused during rollback decision;
- route and secret versions remain valid;
- reconciliation is clean after rollback;
- restore procedure is available if migration/data verification fails.

## 8. Promotion evidence

Copy `PROMOTION_EVIDENCE.example.json` and fill each check as:

```json
{
  "passed": true,
  "evidence": "immutable path, CI URL or artifact reference"
}
```

Set `release_sha256` to the exact distributed ZIP hash. Then run:

```bash
npm run verify:promotion
```

Do not edit the verifier or weaken checks to make promotion green.

## 9. Incident rules

- Any GL imbalance, base residual, GL-vs-PLE mismatch or cross-tenant access is Severity 1.
- Stop financial posting for the affected tenant.
- Preserve trace, command receipt, versions, document snapshots, ledger rows, audit and outbox/inbox state.
- Never patch immutable ledger rows manually. Use an approved compensating/repost procedure after root-cause analysis.


## Preview separation

Migrations 0004–0007 add Frappe/ERP core schema. Their presence does not expand the O2C commercial contract. Follow the platform, Frappe Core and ERPNext Core preview runbooks for provisioning, smoke, reconciliation and feature-flag rollout.
