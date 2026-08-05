# Alumdoor Controlled Pilot

Status: **ACTIVE**  
Pilot entry gate: **R6 PILOT-GO**  
Certified software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`  
Pilot target: tenant `alu` at `https://alu.kairo.vn`

## Current phase

- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Real Pilot-01: **SOURCE INGESTED / PREVIEW-BLOCKED / EXTERNAL SOURCE DEPENDENCY**.
- Real Pilot-02 and Pilot-03: **NOT STARTED / gated by real Pilot-01 READY**.
- Synthetic Pilot-01: **PREVIEW_PASS / TEST ONLY**.
- Synthetic Pilot-02: **DRY-RUN PASS / 9 of 9 segments / TEST ONLY**.
- Synthetic Pilot-03: **PARALLEL RECONCILIATION PASS / 3 of 3 days / variance 0 / TEST ONLY**.
- Pilot-03 executable evidence: workflow run `30970432986`.
- Next synthetic validation step: **Pilot-04 cutover-decision rehearsal**.

Synthetic validation is deliberately separated from the real pilot state. A synthetic PASS never replaces source-authoritative opening data, named pilot accounts or production approval.

## Synthetic Pilot-01

`tools/generate-pilot-01-synthetic-batch.mjs` generates all 12 required Mapping-V1 datasets with fake `SYN-` identities and `.invalid` accounts. It reaches `PREVIEW_PASS` with zero unexplained reconciliation variance and contains no real customer data.

## Synthetic Pilot-02

Authorities: `PILOT_02_SYNTHETIC_DRY_RUN_V1.json`, `PILOT_02_STATUS.json`, `.github/workflows/pilot-02-synthetic-dry-run.yml`.

Nine representative segments pass: Pilot-01 handoff, Sales/O2C, Procurement/P2P, Stock/fulfilment, Manufacturing, Finance settlement/cross-ledger reconciliation, correction/return, warranty/service lineage and idempotency.

## Synthetic Pilot-03

Authorities:

- `PILOT_03_SYNTHETIC_PARALLEL_V1.json`;
- `PILOT_03_STATUS.json`;
- `.github/workflows/pilot-03-synthetic-parallel.yml`;
- `server/apps/tenant-worker/test/pilot-03-synthetic-parallel.integration.test.mts`.

Run `30970432986` executed three cumulative business days in one local workerd/D1 state. The default tolerance is `0`.

Daily reconciliation surfaces:

- Stock quantity/value;
- AR/AP;
- Bank;
- revenue/COGS;
- Manufacturing progress and WIP closing quantity;
- GL debit/credit equality;
- document count/status;
- Payment Entry replay idempotency.

All variances were exactly zero on Day 1, Day 2 and Day 3. Independent cross-ledger, AR and AP auditors also passed. Artifact ID `8916292176`; artifact zip SHA-256 `6728e53db65f663915211249a8cc5987e2c1fa6736e08d4834d53179172b132a`.

The lane uses local GitHub-hosted CI/workerd/D1 only: no production environment, Cloudflare production secrets, production origin, deploy/migration or remote D1.

## Real Pilot-01 truth

Current accepted Alumdoor files have been exhausted as far as source evidence permits. Real blockers remain authoritative AR/AP openings, canonical Stock Kg/value + complete scope at one common cutoff, two unresolved UOM conversions, corrected VIPST700 dates and named pilot users including exactly one active named `Giám đốc` account.

Missing real openings are never treated as zero and synthetic values are never substituted for them.

## Program shape

```text
REAL LANE
R6 PILOT-GO
  -> Pilot-00 LOCKED
  -> Pilot-01 EXTERNAL SOURCE BLOCKED
  -> real PREVIEW_PASS [WAITING SOURCE OWNER]
  -> real Pilot-02
  -> real Pilot-03
  -> real Pilot-04 Cutover Decision
  -> Pilot-05 Hypercare/Exit

SYNTHETIC VALIDATION LANE
synthetic Pilot-01 PREVIEW_PASS
  -> synthetic Pilot-02 DRY-RUN PASS (9/9)
  -> synthetic Pilot-03 PARALLEL PASS (3/3, tolerance 0)
  -> synthetic Pilot-04 decision rehearsal [NEXT]
```

## Pilot-04 synthetic boundary

Pilot-04 synthetic may only rehearse decision logic. It must prove `GO` for complete synthetic evidence and deterministic `NO-GO` for P0/P1 blockers, non-zero variance, missing/duplicate Giám đốc approval, release/profile drift or stale recovery evidence. A synthetic `GO` must still have `production_write_authorized=false`, `cutover_authorized=false` and `real_pilot_transition_allowed=false`.

## Read order

1. `PILOT_00_CONTRACT.md`
2. `PILOT_DATA_MAPPING_V1.json`
3. `PILOT_01_STATUS.json`
4. `PILOT_01_EXTERNAL_SOURCE_DEPENDENCIES_20260805.json`
5. `PILOT_01_SYNTHETIC_FIXTURE_V1.json`
6. `PILOT_02_SYNTHETIC_DRY_RUN_V1.json`
7. `PILOT_02_STATUS.json`
8. `PILOT_03_SYNTHETIC_PARALLEL_V1.json`
9. `PILOT_03_STATUS.json`
10. `tools/verify-pilot-03-synthetic-contract.mjs`
11. `../../../NEXT_TASKS.md`

## Boundaries

- Synthetic evidence is not source-authoritative customer evidence.
- Synthetic PASS does not authorize production write or real cutover.
- No direct D1 edits, shadow Stock/Finance ledgers, guessed UOM conversions, guessed financial openings or silent source-date rewrites.
- Real production import/write, cutover, DNS/routes/secrets/provider mutation and destructive recovery remain explicit authorization boundaries.
