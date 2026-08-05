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
- Synthetic Pilot-03: **PARALLEL RECONCILIATION PASS / 3 of 3 days / tolerance 0**.
- Synthetic Pilot-04: **DECISION REHEARSAL PASS / baseline GO 11/11 / all 7 NO-GO classes PASS**.
- Pilot-04 run `30972065238`: **SUCCESS**; artifact `8916878582`, SHA-256 `315dc49d345c0cbead7a6b1c6f02034e455c51df32bd6fcdc7e3521bd798d072`.
- Real Pilot-02/03/04: **NOT STARTED**, gated by real Pilot-01 READY.
- Active synthetic next step: **Pilot-05 synthetic hypercare + exit-gate rehearsal**.

Synthetic PASS validates tooling/governance only. It never authorizes real pilot transition, production write or cutover.

## 1. Real Pilot-01 — externally blocked

Required source-owner inputs remain:

1. full-customer AR opening at one named cutoff;
2. full-supplier AP opening at the same cutoff;
3. canonical Stock quantity + value with actual aluminum Kg/value and complete scope;
4. matching cash/bank balances if in scope, or explicit scope exclusion;
5. UOM/conversion evidence for `NVL-AL595-GS`;
6. UOM/conversion evidence for `NVL-BO1VIS AL71`;
7. corrected dates for the two quarantined `VIPST700` rows;
8. named pilot-account allowlist with exactly one active named `Giám đốc` account.

These values may not be synthesized for the real pilot.

## 2. Synthetic Pilot-01..04 — DONE / PASS

### Pilot-01

All 12 Mapping-V1 datasets; `PREVIEW_PASS`; zero unexplained variance.

### Pilot-02

Nine representative transaction segments PASS across Sales, Procurement, Stock, Manufacturing, Finance, correction/return, warranty/service and idempotency.

### Pilot-03

Three cumulative business days reconcile at tolerance `0` across Stock qty/value, AR/AP, Bank, revenue/COGS, Manufacturing/WIP, GL, document state and retries. Independent AR/AP/cross-ledger auditors PASS.

### Pilot-04

Authority: `docs/pilot/alumdoor/PILOT_04_SYNTHETIC_DECISION_V1.json`.

Run `30972065238` proves:

- baseline synthetic evidence -> `GO` with **11/11** gates;
- unresolved P0/P1 -> `NO-GO`;
- non-zero reconciliation variance -> `NO-GO`;
- missing/duplicate `Giám đốc` approval -> `NO-GO`;
- release/package/profile drift -> `NO-GO`;
- stale/failed recovery -> `NO-GO`;
- invalid cutoff/delta -> `NO-GO`;
- non-synthetic invocation -> `NO-GO`.

Even the synthetic `GO` has `production_write_authorized=false`, `cutover_authorized=false`, `real_pilot_transition_allowed=false`.

## 3. Active synthetic next step — Pilot-05

Build a **synthetic hypercare + exit-gate rehearsal**, not GA and not a real production exit.

Required evidence:

- bounded multi-day health/transaction/reconciliation snapshots;
- no unresolved P0/P1 at exit;
- zero unexplained Stock/AR/AP/Finance variance;
- stable idempotency/correction behavior;
- recovery evidence continuity/freshness;
- all synthetic incidents either absent or closed with recheck evidence;
- deterministic `EXIT` for clean evidence;
- deterministic `NO-EXIT` for runtime-health failure, open P0/P1, non-zero variance, unresolved incident or stale recovery.

Any synthetic `EXIT` must still retain `production_write_authorized=false`, `ga_authorized=false`, `real_pilot_transition_allowed=false`.

Target verdict: **`PILOT-05-SYNTHETIC-EXIT-REHEARSAL-PASS`**.

## 4. Real transition rule

Real Pilot-01 stays PREVIEW-BLOCKED until source-owner evidence supplies a source-proven common cutoff. Only then can real `PREVIEW_PASS`, named account freeze and real Pilot-02/03/04 proceed. Real cutover requires explicit `Giám đốc` approval under Pilot-00; real Pilot-05 comes only after an authorized real cutover.

## 5. Standing boundaries

- Controlled pilot is not GA.
- Synthetic values are never substituted for real openings.
- Synthetic GO/EXIT never authorizes production write, cutover or GA.
- Real production data import/write, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
