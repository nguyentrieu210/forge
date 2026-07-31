# Alumdoor Inventory Slice B review

Date: 2026-07-31

Scope: warehouse roles, canonical physical stock identity, lineage, reversal and concurrency.

Authoritative metadata: `server/briefs/alumdoor-v2.json` version `2.0.34`.

## Result

- Score: **97/100**.
- Critical findings: **0**.
- High findings: **0** after remediation.
- Merge quality threshold `>=95`: **PASS**.

## Score

| Area | Score | Evidence |
|---|---:|---|
| Physical-stock correctness | 29/30 | Server-built identity; inventory mode/profile; colour, condition, generation and dimensions; batch/serial/Aluminium Lot lineage; warehouse-role rules. One point remains for the standalone physical-stock report/read model owned by Slice D. |
| Atomicity and concurrency | 24/25 | Existing append-only stock ledger and document commit stay in one MutationPlan/D1 batch. All Stock Entry and Work Order submit/cancel commands for one company share one Durable Object key. Race regression proves only one competing issue wins. One point remains for production load/latency benchmarking of the deliberately coarse company lock. |
| Lineage and exact reversal | 20/20 | Bundle quantity/direction/warehouse checks, explicit value vs lot checks, transfer lineage, second-transfer handling after stale Aluminium Lot location, and cancel from original ledger rows. |
| Compatibility and security | 10/10 | Existing generic stock/batch/serial behavior remains; server authority rejects unsupported roles, disabled/group warehouses, quarantine release without evidence and scrap recovery without reason. No browser-supplied balance or valuation is trusted. |
| Tests and repository gates | 10/10 | Focused identity, warehouse, mismatch, transfer, cancel, race and inventory-coordinator tests plus SQL, brief, repository tests, typecheck, build and browser/auth regression workflows. |
| Performance and observability | 4/5 | Stable physical identity key and existing ledger/voucher references are reportable without a second stock book. Company-wide coordination avoids deadlocks but intentionally reduces same-company write parallelism; benchmark remains a release-observation task. |

## Findings remediated during review

1. **High:** document-key Durable Objects allowed two differently named Stock Entries to race on the same batch or warehouse balance.
   - Fixed with `inventory:tenant:company` coordination for Stock Entry and Work Order submit/cancel.
2. **High:** explicit row colour or length could disagree with the selected Aluminium Lot.
   - Fixed with server-side identity compatibility checks.
3. **High:** legacy `Aluminium Lot.warehouse` could reject a valid second transfer after the stock ledger had already moved the batch.
   - Fixed by treating the append-only batch balance as location authority and the lot warehouse as descriptive legacy data.
4. **Medium:** dimensioned stock could be submitted without physical bundle lineage.
   - Fixed by requiring submitted bundle/lot/serial references and exact bundle quantity.
5. **Medium:** quarantine and scrap/offcut transitions lacked explicit release/recovery evidence.
   - Fixed with `quality_release_reference` and `recovery_reason` guards.

## Architecture decision

No new physical movement table or migration is introduced. The existing append-only `stock_ledger_entries` remains the sole quantity/value ledger. Immutable physical identity and warehouse-role snapshots live on canonical Stock Entry rows; ledger voucher/revision/line references preserve the join. This avoids two stock ledgers drifting while retaining exact reversal and reportability.

## Remaining release gates

These do not block code merge, but block production rollout and Slice D completion:

1. Read-only live tenant catalog audit and remediation plan.
2. Staging journeys for receive, transfer, issue, quarantine release, scrap recovery and cancel.
3. Physical-stock read model/report and operator UI in Slice D.
4. Production load/latency observation for company-wide inventory coordination.
5. Separate explicit deployment approval.

## Safety

- No tenant migration or mutation was performed.
- No Cloudflare deployment or production secret change was performed.
- FIFO remains disabled.
- No `.env`, `server/work/`, `tmp/`, backup or generated report was committed.
