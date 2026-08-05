# NEXT TASKS

Ngày cập nhật: **2026-08-05**.

Real pilot state và synthetic validation state phải được giữ tách biệt.

## 0. Current state

- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6 Production Certification: **DONE / PILOT-GO**.
- Exact certified/deployed R6 SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Real Pilot-01: **SOURCE INGESTED / PREVIEW-BLOCKED / EXTERNAL SOURCE DEPENDENCY**.
- Synthetic Pilot-01: **PREVIEW_PASS / TEST ONLY**.
- Synthetic Pilot-02: **DRY-RUN PASS / 9 of 9 representative segments**.
- Synthetic Pilot-03: **PARALLEL RECONCILIATION PASS / 3 of 3 business days / tolerance 0**.
- Pilot-03 executable run `30970432986`: **SUCCESS**.
- Real Pilot-02 and Real Pilot-03: **NOT STARTED**, gated by real Pilot-01 READY.
- Active synthetic next step: **Pilot-04 synthetic cutover-decision rehearsal**.

Synthetic PASS results validate tooling and executable business paths only. They do not authorize real pilot transition, production write or cutover.

## 1. Real Pilot-01 — externally blocked

Current accepted Alumdoor files have already been pushed as far as source evidence safely permits. Closed work includes duplicate policies, 60/60 journal identities, Supplier gaps `4 -> 0`, UOM `19/21`, deterministic VND rounding, quarantine of two future-dated `VIPST700` rows and rejection of `30/06/2026` as an unproven common cutoff.

### Required real source-owner inputs

1. full-customer AR opening at one named cutoff;
2. full-supplier AP opening at the same cutoff;
3. canonical Stock quantity + value at that cutoff with actual aluminum Kg/value and complete scope;
4. matching cash/bank balances if in scope, or explicit scope exclusion;
5. UOM/conversion evidence for `NVL-AL595-GS`;
6. UOM/conversion evidence for `NVL-BO1VIS AL71`;
7. corrected dates for the two quarantined `VIPST700` rows;
8. named pilot-account allowlist with exactly one active named `Giám đốc` account.

These values may not be synthesized for the real pilot.

## 2. Synthetic Pilot-01 — DONE / PASS

`docs/pilot/alumdoor/PILOT_01_SYNTHETIC_FIXTURE_V1.json` covers all 12 Mapping-V1 datasets and reaches `PREVIEW_PASS` with zero unexplained variance.

## 3. Synthetic Pilot-02 — DONE / PASS

`docs/pilot/alumdoor/PILOT_02_SYNTHETIC_DRY_RUN_V1.json` records nine passing representative segments: Sales/O2C, Procurement/P2P, Stock, Manufacturing, Finance, correction/return, warranty/service and idempotency, with no production mutation.

## 4. Synthetic Pilot-03 — DONE / PASS

Authorities:

- `docs/pilot/alumdoor/PILOT_03_SYNTHETIC_PARALLEL_V1.json`;
- `docs/pilot/alumdoor/PILOT_03_STATUS.json`;
- `.github/workflows/pilot-03-synthetic-parallel.yml`;
- `server/apps/tenant-worker/test/pilot-03-synthetic-parallel.integration.test.mts`.

Run `30970432986` reconciled **3 cumulative business days** in one local workerd/D1 state. Every daily checkpoint had exact zero variance across:

- Stock quantity/value;
- AR/AP;
- Bank;
- revenue/COGS;
- Manufacturing progress and zero WIP closing residual;
- GL debit/credit equality;
- document count/status;
- Payment Entry retry idempotency.

Independent cross-ledger, AR and AP auditors also passed. Artifact ID `8916292176`; artifact zip SHA-256 `6728e53db65f663915211249a8cc5987e2c1fa6736e08d4834d53179172b132a`.

## 5. Active synthetic next step — Pilot-04 decision rehearsal

Build a **decision-gate rehearsal only**, never a real cutover. Required scenarios:

1. all synthetic evidence present, zero variance, exact identity, named Giám đốc approval -> synthetic `GO`;
2. any unresolved P0/P1 -> `NO-GO`;
3. any reconciliation variance > 0 -> `NO-GO`;
4. missing/duplicate Giám đốc approval -> `NO-GO`;
5. release/profile/package drift -> `NO-GO`;
6. stale or missing recovery evidence -> `NO-GO`.

The output must explicitly keep `production_write_authorized=false`, `cutover_authorized=false`, and `real_pilot_transition_allowed=false` even when the synthetic verdict is `GO`.

Target verdict: **`PILOT-04-SYNTHETIC-DECISION-REHEARSAL-PASS`**.

## 6. Real transition rule

Real Pilot-01 stays PREVIEW-BLOCKED until external source inputs are supplied and one common cutoff is source-proven. Only then may the real batch reach `PREVIEW_PASS`, named accounts be frozen, real Pilot-02 begin, and later real Pilot-03/Pilot-04 proceed under explicit business approval.

## 7. Standing boundaries

- Controlled pilot is not GA.
- Synthetic values are never substituted for missing real openings.
- Missing opening values are never assumed zero.
- Real production data write/import, real cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
