# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo `nguyentrieu210/forge`.
- RC4 **DONE**; R5 **DONE / R5-GO**; R6 **DONE / PILOT-GO**.
- Exact certified/deployed R6 SHA `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Pilot-00 **DONE / PILOT-00-LOCKED**.
- Real Pilot-01 **SOURCE INGESTED / PREVIEW-BLOCKED / EXTERNAL SOURCE DEPENDENCY**.
- Synthetic Pilot-01 **PREVIEW_PASS / TEST ONLY**.
- Synthetic Pilot-02 **DRY-RUN PASS / 9 of 9 segments**.
- Synthetic Pilot-03 **PARALLEL RECONCILIATION PASS / 3 of 3 days / zero variance**; run `30970432986`.
- Real Pilot-02 and Real Pilot-03 **NOT STARTED**, gated by real Pilot-01 READY.
- Next synthetic validation step: **Pilot-04 synthetic cutover-decision rehearsal**.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956**.

## Synthetic validation lane

### Pilot-01

`PILOT_01_SYNTHETIC_FIXTURE_V1.json` generates all 12 Mapping-V1 datasets and reaches `PREVIEW_PASS` with zero unexplained variance, no real customer data and exactly one active synthetic `Giám đốc`.

### Pilot-02

`PILOT_02_SYNTHETIC_DRY_RUN_V1.json` records nine passing representative segments across Sales, Procurement, Stock, Manufacturing, Finance, corrections/returns, warranty/service and idempotency.

### Pilot-03

Authorities:

- `docs/pilot/alumdoor/PILOT_03_SYNTHETIC_PARALLEL_V1.json`;
- `docs/pilot/alumdoor/PILOT_03_STATUS.json`;
- `.github/workflows/pilot-03-synthetic-parallel.yml`;
- `server/apps/tenant-worker/test/pilot-03-synthetic-parallel.integration.test.mts`.

Run `30970432986` passed three cumulative business-day checkpoints in one local workerd/D1 state. Default tolerance: `0`.

All three days had zero variance for Stock qty/value, AR, AP, Bank, revenue, COGS, Manufacturing progress, WIP closing quantity, GL balance, document count/status and Payment Entry retry idempotency. Independent cross-ledger, AR and AP auditors also passed.

Artifact: ID `8916292176`; zip SHA-256 `6728e53db65f663915211249a8cc5987e2c1fa6736e08d4834d53179172b132a`.

## Real Pilot-01 remains externally blocked

Required source-owner evidence remains:

1. full-customer AR opening at one named cutoff;
2. full-supplier AP opening at the same cutoff;
3. canonical Stock quantity/value with actual aluminum Kg/value and complete scope;
4. cash/bank at the same cutoff if in scope, or explicit exclusion;
5. UOM evidence for `NVL-AL595-GS`;
6. UOM evidence for `NVL-BO1VIS AL71`;
7. corrected dates for quarantined VIPST700 rows;
8. named pilot account allowlist with exactly one active named `Giám đốc`.

These values may not be synthesized for the real pilot.

## Next execution

Synthetic lane: build **Pilot-04 cutover-decision rehearsal**. Required deterministic cases:

- complete synthetic evidence + zero variance + exact release/profile + one Giám đốc approval -> synthetic GO;
- P0/P1 blocker -> NO-GO;
- non-zero reconciliation variance -> NO-GO;
- missing/duplicate Giám đốc approval -> NO-GO;
- release/profile/package drift -> NO-GO;
- stale/missing recovery evidence -> NO-GO.

Even a synthetic GO must keep `production_write_authorized=false`, `cutover_authorized=false`, and `real_pilot_transition_allowed=false`.

Real lane: wait for source-owner evidence, then hash/bind extracts, freeze one common cutoff, generate private batch and require real `PREVIEW_PASS` before real Pilot-02.

## Production boundary

Synthetic PASS does not authorize production write or cutover. Real customer/master/opening import, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
