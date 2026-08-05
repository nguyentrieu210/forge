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
- Real Pilot-02/03/04/05: **NOT STARTED**, gated by real Pilot-01 READY and later explicit real cutover approval.
- Synthetic Pilot-01: **PREVIEW_PASS / TEST ONLY**.
- Synthetic Pilot-02: **DRY-RUN PASS / 9 of 9**.
- Synthetic Pilot-03: **PARALLEL PASS / 3 of 3 days / zero variance**.
- Synthetic Pilot-04: **DECISION REHEARSAL PASS / GO 11 of 11 / 7 NO-GO classes PASS**.
- Synthetic Pilot-05: **EXIT REHEARSAL PASS / EXIT 12 of 12 / 9 NO-EXIT classes PASS**.
- Synthetic Pilot-05 run `30972650497`: **SUCCESS**.
- **Synthetic validation lane: COMPLETE / TEST ONLY**.

Synthetic evidence does not change the exact deployed R6 product identity and never authorizes real pilot transition, production write, cutover, Accepted Production Reference or GA.

### R6 package relock — Alumdoor 2.2.4 (2026-08-05): PASS

- Historical R6 certification remains historical evidence and is not rewritten by the package relock.
- Current observed Worker/UI release marker: `3999c2929053f11d4f1c5b59ccc2f0934446b750`.
- Current observed UI bundle hash: `05c918e048271583`.
- Alumdoor package metadata: `2.2.4`.
- Alumdoor package content hash: `e6a5a1d55b4aa8b7cbe62173e9532a08298eac13472dd79ff2c9fb7e949a284d`.
- Active capability profile: `alumdoor-pilot` v1, hash `3e3124018aa3c7d233f0af8b81f751cd3e4a8329b94a2c9295956bc58ac8f7f8`, `valid=true`, zero blocked capabilities.
- Protected production metadata install run `30969702876`, job `92191164491`: **SUCCESS**.
- R6 package relock run `30970665494`, job `92194053937`: **SUCCESS / E18 PASS / zero blockers**.
- Relock source authority: `1f7ca95760998c4ab30bdf6c9870647f5ee2938f`; this is source authority for the relock, not a claim that current `main` is the deployed Worker/UI release.
- No Worker/client deploy occurred during metadata upgrade or package relock. Business data was not written by the relock.
- Durable evidence: `deploy-evidence/r6-alumdoor-package-relock-20260805.json`.
- Controlled pilot remains **not GA**.

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

## 4. Synthetic Pilot-01..05 truth

### Pilot-01

`PILOT_01_SYNTHETIC_FIXTURE_V1.json`: all 12 Mapping-V1 datasets, all six personas, exactly one active synthetic `Giám đốc`; `PREVIEW_PASS`, variance `0`.

### Pilot-02

`PILOT_02_SYNTHETIC_DRY_RUN_V1.json`: nine representative transaction segments PASS across Sales/O2C, Procurement/P2P, Stock, Manufacturing, Finance, correction/return, warranty/service and idempotency.

### Pilot-03

`PILOT_03_SYNTHETIC_PARALLEL_V1.json`: run `30970432986` executes three cumulative business days in one local workerd/D1 state. Stock qty/value, AR/AP, Bank, revenue/COGS, Manufacturing/WIP, GL, document state and retry idempotency all reconcile at tolerance `0`. Independent AR/AP/cross-ledger auditors PASS.

### Pilot-04

`PILOT_04_SYNTHETIC_DECISION_V1.json`: run `30972065238` returns baseline synthetic `GO` only with all **11/11** gates. P0/P1, non-zero variance, approval defects, identity drift, stale/failed recovery, invalid cutoff and non-synthetic invocation all return `NO-GO`. Cutover authority remains false.

### Pilot-05

`PILOT_05_SYNTHETIC_EXIT_V1.json`: run `30972650497` returns baseline synthetic `EXIT` only with **12/12** gates and passes all **9** NO-EXIT scenario classes. The workflow reruns local runtime health, Pilot-03 reconciliation continuity, recovery safety and Pilot-04 governance. Artifact ID `8917093954`; SHA-256 `c2e1b5e2b1c3bd08913285a0988b6638715ea0a87de7fa6ffe2d5306d53834b8`.

Synthetic EXIT still has:

- `production_write_authorized=false`;
- `cutover_authorized=false`;
- `ga_authorized=false`;
- `accepted_production_reference_authorized=false`;
- `real_pilot_transition_allowed=false`.

## 5. Active sequence

```text
REAL:
R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 EXTERNAL SOURCE BLOCKED -> real PREVIEW_PASS -> real Pilot-02 -> real Pilot-03 -> real Pilot-04 -> real Pilot-05 -> Accepted Production Reference -> GA

SYNTHETIC:
Pilot-01 PREVIEW_PASS -> Pilot-02 PASS -> Pilot-03 PASS -> Pilot-04 PASS -> Pilot-05 EXIT REHEARSAL PASS -> COMPLETE / TEST ONLY
```

## 6. Next meaningful milestone

No further synthetic pilot phase is required. Next work is real Pilot-01 source completion: bind source-authoritative AR/AP/Stock/cash-bank/access evidence, freeze one common cutoff, generate the private real Mapping-V1 batch and obtain real zero-variance `PREVIEW_PASS` before real Pilot-02.

## 7. Standing boundaries

- Controlled pilot is not GA.
- Synthetic values are never substituted for real openings.
- Synthetic PASS/GO/EXIT never authorizes production write, cutover, Accepted Production Reference or GA.
- Real customer/master/opening-data write/import, cutover, provider/DNS/secret mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.

## 8. Documentation authority

Start with `docs/pilot/alumdoor/README.md`, `NEXT_TASKS.md`, `PILOT_01_STATUS.json`, `PILOT_02_STATUS.json`, `PILOT_03_STATUS.json`, `PILOT_04_STATUS.json`, `PILOT_05_STATUS.json`, and `PILOT_01_EXTERNAL_SOURCE_DEPENDENCIES_20260805.json`.
