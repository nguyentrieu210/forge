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
- Real Pilot-02/03/04/05: **NOT STARTED**, gated by real Pilot-01 READY and later explicit real cutover approval.
- Synthetic Pilot-01: **PREVIEW_PASS**.
- Synthetic Pilot-02: **DRY-RUN PASS / 9 of 9**.
- Synthetic Pilot-03: **PARALLEL PASS / 3 of 3 days / variance 0**.
- Synthetic Pilot-04: **DECISION REHEARSAL PASS / GO 11 of 11 + all 7 NO-GO classes**.
- Synthetic Pilot-05: **EXIT REHEARSAL PASS / EXIT 12 of 12 + all 9 NO-EXIT classes**.
- Pilot-05 run `30972650497`: **SUCCESS**; artifact `8917093954`, SHA-256 `c2e1b5e2b1c3bd08913285a0988b6638715ea0a87de7fa6ffe2d5306d53834b8`.
- **Synthetic validation lane: COMPLETE / TEST ONLY**.

Synthetic PASS/GO/EXIT never authorizes production write, real cutover, Accepted Production Reference or GA.

## 1. Real Pilot-01 — active dependency

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

## 2. Synthetic lane — DONE

### Pilot-01

All 12 Mapping-V1 datasets reach `PREVIEW_PASS` with zero unexplained variance.

### Pilot-02

Nine representative transaction segments PASS across Sales, Procurement, Stock, Manufacturing, Finance, correction/return, warranty/service and idempotency.

### Pilot-03

Three cumulative business days reconcile at tolerance `0` across Stock qty/value, AR/AP, Bank, revenue/COGS, Manufacturing/WIP, GL, document state and retries. Independent AR/AP/cross-ledger auditors PASS.

### Pilot-04

Baseline synthetic evidence returns `GO` only when all 11 gates pass. P0/P1, variance, approval defects, identity drift, stale recovery, invalid cutoff or non-synthetic invocation return `NO-GO`. Cutover authority remains false.

### Pilot-05

Run `30972650497` passed:

- baseline three-day synthetic hypercare -> `EXIT` with **12/12** gates;
- runtime/transaction health rerun;
- Pilot-03 transaction/reconciliation continuity rerun;
- local backup/recovery safety rerun;
- Pilot-04 GO/NO-GO governance rerun;
- 9 negative scenario classes -> deterministic `NO-EXIT`.

Even synthetic `EXIT` retains:

- `production_write_authorized=false`;
- `cutover_authorized=false`;
- `ga_authorized=false`;
- `accepted_production_reference_authorized=false`;
- `real_pilot_transition_allowed=false`.

## 3. Next real milestone

There is no further synthetic pilot phase required. The next meaningful step is to satisfy the **real Pilot-01 external source dependencies**, then:

1. bind actual source extracts by SHA-256/provenance;
2. freeze one source-proven common cutoff;
3. create the private real Mapping-V1 batch;
4. obtain real zero-variance `PREVIEW_PASS`;
5. freeze named pilot accounts;
6. start real Pilot-02 only after those conditions are met.

Real production import/write remains a separate explicit authorization boundary even after a real `PREVIEW_PASS`.

## 4. Standing boundaries

- Controlled pilot is not GA.
- Synthetic values are never substituted for real openings.
- Missing opening values are never assumed zero.
- Synthetic PASS/GO/EXIT is test evidence only.
- Real production data import/write, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
