# ERPNext Core Preview Runbook — v0.8.0

This runbook is mandatory before enabling v0.8 preview modules for any tenant with valuable data.

## 1. Verify the exact artifact

```bash
sha256sum -c CloudForge_v0.8.0_ERPNext_Core_Preview.sha256
npm run verify:manifest
npm ci
npm run check:erpnext-core
npm run test:workers
npm --prefix apps/web run build
```

Do not substitute evidence from v0.7 or another source tree.

## 2. Migration rehearsal

1. Clone a production-shaped tenant D1 dataset.
2. Record pre-migration document, GL, stock, payment and outbox counts.
3. Apply migrations 0001–0007 in order.
4. Run SQL verification and `/internal/reconciliation`.
5. Compare counts and balances; investigate every unexplained difference.
6. Rehearse rollback/restore from the pre-migration backup.

## 3. Required runtime smoke

### Valuation

- Receive two price layers.
- Issue across both layers using FIFO and Moving Average items.
- Cancel the issue at the same business timestamp and verify the original value is restored.
- Run bounded repost and verify zero-quantity stock adjustment plus balanced GL.

### Serial and batch

- Create inward bundle, receive stock and verify bundle is single-use.
- Cancel receipt, verify tracked stock and bundle usage reverse.
- Reuse the released bundle and then issue through an outward bundle.
- Attempt duplicate serial stock and negative batch stock; both must fail atomically.

### Returns

- Post partial Credit Note, Debit Note and Stock Return.
- Attempt cumulative over-return, wrong party and wrong warehouse.
- Cancel and verify outstanding, stock and return progress reverse exactly.

### Manufacturing

- Submit BOM and Work Order.
- Manufacture a partial and final quantity.
- Verify raw-material value, proportional operating cost, finished stock and Work Order progress.
- Attempt overproduction and overconsumption.

### Assets

- Submit Asset and several depreciation entries.
- Verify balanced GL, accumulated depreciation and net book value.
- Attempt depreciation beyond depreciable value and posting into a locked period.

## 4. Oracle and reconciliation

Before parity or commercial claims:

- capture pinned ERPNext fixtures for valuation, repost, serial/batch, returns, pricing, manufacturing and depreciation;
- classify exact parity, semantic parity, intentional differences and unsupported paths;
- run full GL, stock-value, AP/AR and projection reconciliation;
- preserve immutable inputs, outputs, environment fingerprint and SHA-256 hashes.

## 5. Operations gate

- Staging tenant-isolation matrix.
- High-volume stock-ledger/report benchmark.
- Queue/outbox retry and dead-letter drill.
- Tenant backup and isolated restore drill.
- Rollback rehearsal.
- Alerting for negative projection attempts, reconciliation drift, repost failures and queue lag.

## 6. Rollout rule

Enable v0.8 preview features only for named design-partner tenants behind feature flags. Keep O2C commercial promotion and ERPNext Core Preview maturity separate. Stop rollout on any unexplained ledger/projection drift.
