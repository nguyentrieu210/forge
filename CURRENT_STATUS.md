# CURRENT STATUS

Ngày cập nhật: **2026-08-05**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, workflow run, merge và production evidence.

## 1. Repository checkpoint

- Repository: `nguyentrieu210/forge`.
- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6: **DONE / PILOT-GO**.
- Exact certified/deployed product SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- R6 final evidence: **23/23 PASS**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Real Pilot-01: **SOURCE INGESTED / PREVIEW-BLOCKED / EXTERNAL SOURCE DEPENDENCY**.
- Synthetic Pilot-01: **PREVIEW_PASS / TEST ONLY**.
- Synthetic Pilot-02: **DRY-RUN PASS / 9 of 9 representative segments**.
- Synthetic Pilot-03: **PARALLEL RECONCILIATION PASS / 3 of 3 days / zero variance**.
- Pilot-03 executable run `30970432986`: **SUCCESS**.
- Real Pilot-02 and Real Pilot-03: **NOT STARTED**, gated by real Pilot-01 READY.
- Next synthetic validation step: **Pilot-04 synthetic cutover-decision rehearsal**.

Synthetic documentation/test evidence does not change the exact deployed R6 product identity.

### R6 package relock — Alumdoor 2.2.4 (2026-08-05): PASS

- Historical R6 certification above remains historical evidence and is not rewritten by this package relock.
- Current observed Worker/UI release marker: `3999c2929053f11d4f1c5b59ccc2f0934446b750`.
- Current observed UI bundle hash: `05c918e048271583`.
- Alumdoor package metadata: `2.2.4`.
- Alumdoor package content hash: `e6a5a1d55b4aa8b7cbe62173e9532a08298eac13472dd79ff2c9fb7e949a284d`.
- Active capability profile: `alumdoor-pilot` v1, hash `3e3124018aa3c7d233f0af8b81f751cd3e4a8329b94a2c9295956bc58ac8f7f8`, `valid=true`, zero blocked capabilities.
- Protected production metadata install run `30969702876`, job `92191164491`: **SUCCESS**.
- R6 package relock run `30970665494`, job `92194053937`: **SUCCESS / E18 PASS / zero blockers**.
- Relock source authority: `1f7ca95760998c4ab30bdf6c9870647f5ee2938f`; this is source authority for the relock, not a claim that current `main` is the deployed Worker/UI release.
- No Worker/client deploy occurred during the metadata upgrade or package relock. Business data was not written by the relock.
- Durable evidence: `deploy-evidence/r6-alumdoor-package-relock-20260805.json`.
- Controlled pilot remains **not GA**. Real Pilot-01/Pilot-02 authorization and data-readiness boundaries are unchanged.

## 2. Capability truth

Canonical distribution remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** until a newer convergence record explicitly changes it.

## 3. Real Pilot-01 truth

Accepted real Alumdoor sources are the six operator-provided files recorded in `PILOT_01_SOURCE_INGEST_20260805.json`. Raw workbooks remain outside Git.

Closed normalization work includes 60/60 journal identity disposition, supplier gaps `4 -> 0`, duplicate policies, 19/21 UOM resolution/classification with two fail-closed identities, deterministic VND rounding, quarantine of two future-dated VIPST700 rows, and rejection of `30/06/2026` as an unproven common cutoff.

### Real source-owner dependencies

1. full-customer AR opening at one named cutoff;
2. full-supplier AP opening at the same cutoff;
3. canonical Stock quantity + value at that cutoff with actual aluminum Kg/value and complete scope;
4. matching cash/bank balances if in scope, or explicit exclusion;
5. source-owner UOM evidence for `NVL-AL595-GS`;
6. source-owner UOM evidence for `NVL-BO1VIS AL71`;
7. corrected dates for the two quarantined `VIPST700` rows;
8. named pilot-user allowlist with exactly one active named `Giám đốc` account.

These values may not be synthesized for the real pilot.

## 4. Synthetic Pilot-01 truth

`docs/pilot/alumdoor/PILOT_01_SYNTHETIC_FIXTURE_V1.json` covers all 12 Mapping-V1 datasets, all six personas and exactly one active synthetic `Giám đốc`. It reaches `PREVIEW_PASS` with zero unexplained reconciliation variance and contains no real customer data.

## 5. Synthetic Pilot-02 truth

`docs/pilot/alumdoor/PILOT_02_SYNTHETIC_DRY_RUN_V1.json` records a nine-segment executable PASS across Sales/O2C, Procurement/P2P, Stock, Manufacturing, Finance, correction/return, warranty/service and idempotency.

## 6. Synthetic Pilot-03 truth

Authorities:

- `docs/pilot/alumdoor/PILOT_03_SYNTHETIC_PARALLEL_V1.json`;
- `docs/pilot/alumdoor/PILOT_03_STATUS.json`;
- `.github/workflows/pilot-03-synthetic-parallel.yml`;
- `server/apps/tenant-worker/test/pilot-03-synthetic-parallel.integration.test.mts`.

Run `30970432986`: **SUCCESS**. Three cumulative business days were executed in one local workerd/D1 state with default tolerance `0`.

Every daily checkpoint reconciled exactly across Stock quantity/value, AR/AP, Bank, revenue/COGS, Manufacturing progress, WIP closing quantity, GL debit/credit equality, document count/status and Payment Entry retry idempotency. All recorded variances were `0` on all three days.

Independent RC4 cross-ledger, Finance AR and Finance AP auditors also passed. Artifact ID `8916292176`; artifact zip SHA-256 `6728e53db65f663915211249a8cc5987e2c1fa6736e08d4834d53179172b132a`.

This is synthetic/test evidence only and does not satisfy real Pilot-01/Pilot-03 acceptance.

## 7. Active sequence

```text
REAL:
R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 EXTERNAL SOURCE BLOCKED -> real PREVIEW_PASS -> real Pilot-02 -> real Pilot-03 -> real Pilot-04 -> Pilot-05

SYNTHETIC:
Pilot-01 PREVIEW_PASS -> Pilot-02 DRY-RUN PASS (9/9) -> Pilot-03 PARALLEL PASS (3/3, variance 0) -> Pilot-04 decision rehearsal [NEXT]
```

## 8. Next synthetic gate

Pilot-04 synthetic is a **decision rehearsal only**. It must prove deterministic `GO`/`NO-GO` behavior for complete evidence versus blockers such as P0/P1 defects, non-zero reconciliation variance, missing/duplicate Giám đốc approval, release/profile drift or stale recovery evidence. Even a synthetic `GO` must retain `production_write_authorized=false`, `cutover_authorized=false` and `real_pilot_transition_allowed=false`.

## 9. Standing boundaries

- Synthetic values are never substituted for missing real openings.
- Synthetic PASS does not authorize production write or real cutover.
- Real customer/master/opening-data write/import, cutover, provider/DNS/secret mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
- Controlled pilot is not GA.

## 10. Documentation authority

Start with `docs/pilot/alumdoor/README.md`, `NEXT_TASKS.md`, `PILOT_01_STATUS.json`, `PILOT_02_STATUS.json`, `PILOT_03_STATUS.json`, `PILOT_03_SYNTHETIC_PARALLEL_V1.json`, and `PILOT_01_EXTERNAL_SOURCE_DEPENDENCIES_20260805.json`.
