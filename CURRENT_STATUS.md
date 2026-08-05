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
- Latest verified synthetic Pilot-02 run `30969301875`: **SUCCESS**.
- Accompanying R6/source-safety run `30969301881`: **SUCCESS**.
- Real Pilot-02: **NOT STARTED**, gated by real Pilot-01 READY.
- Next synthetic validation step: **Pilot-03 synthetic parallel-run + daily reconciliation**.

Documentation/test evidence does not change the exact deployed R6 product identity.

## 2. Capability truth

Canonical distribution remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** until a newer convergence record explicitly changes it.

## 3. Real Pilot-01 truth

Accepted real Alumdoor sources are the six operator-provided files recorded in `PILOT_01_SOURCE_INGEST_20260805.json`. Raw workbooks remain outside Git.

Closed normalization work includes 60/60 journal identity disposition, supplier gaps `4 -> 0`, duplicate policies, 19/21 UOM resolution/classification with two fail-closed identities, deterministic VND rounding, quarantine of two future-dated VIPST700 rows, and rejection of `30/06/2026` as an unproven common cutoff.

The current uploads + File Library were exhausted for additional Alumdoor-authoritative opening/access evidence.

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

Authority: `docs/pilot/alumdoor/PILOT_01_SYNTHETIC_FIXTURE_V1.json`.

The deterministic synthetic batch covers all 12 Mapping-V1 datasets, all six personas and exactly one active synthetic `Giám đốc`. It reaches `PREVIEW_PASS` with zero unexplained reconciliation variance and contains no real customer data.

Synthetic opening totals are Stock qty `5468`, Stock value `89,500,000` VND, AR `22,750,000` VND and AP `13,000,000` VND.

## 5. Synthetic Pilot-02 truth

Authorities:

- `docs/pilot/alumdoor/PILOT_02_SYNTHETIC_DRY_RUN_V1.json`;
- `docs/pilot/alumdoor/PILOT_02_STATUS.json`;
- `.github/workflows/pilot-02-synthetic-dry-run.yml`.

Latest verified executable run `30969301875`: **SUCCESS**.

Nine representative segments passed: synthetic Pilot-01 handoff, Sales/O2C, Procurement/P2P, Stock/fulfilment, Manufacturing, Finance settlement + cross-ledger reconciliation, correction/return negative paths, warranty/service lineage, and idempotency/retry safety.

Execution is GitHub-hosted local CI/workerd/in-memory only: no production environment, no production Cloudflare secrets, no production origin call, no deploy/migration and no remote D1 mutation.

A synthetic PASS validates executable paths only. It does not make real Pilot-01/Pilot-02 ready.

## 6. Active sequence

```text
REAL:
R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 EXTERNAL SOURCE BLOCKED -> real PREVIEW_PASS -> real Pilot-02 -> Pilot-03 -> Pilot-04 -> Pilot-05

SYNTHETIC:
Pilot-01 PREVIEW_PASS -> Pilot-02 DRY-RUN PASS (9/9) -> Pilot-03 parallel reconciliation [NEXT]
```

## 7. Standing boundaries

- Synthetic values are never substituted for missing real openings.
- `PREVIEW_PASS` and synthetic Pilot-02 PASS do not authorize production write.
- No guessed opening balances, guessed UOM conversions, silent source-date rewrites or unrelated-source substitution.
- Real customer/master/opening-data write/import, cutover, provider/DNS/secret mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
- Controlled pilot is not GA.

## 8. Documentation authority

Start with `docs/pilot/alumdoor/README.md`, `NEXT_TASKS.md`, `PILOT_01_STATUS.json`, `PILOT_02_STATUS.json`, `PILOT_02_SYNTHETIC_DRY_RUN_V1.json`, and `PILOT_01_EXTERNAL_SOURCE_DEPENDENCIES_20260805.json`.
