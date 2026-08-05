# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo `nguyentrieu210/forge`.
- RC4 **DONE**; R5 **DONE / R5-GO**; R6 **DONE / PILOT-GO**.
- Exact certified/deployed R6 SHA `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Pilot-00 **DONE / PILOT-00-LOCKED**.
- Real Pilot-01 **SOURCE INGESTED / PREVIEW-BLOCKED / EXTERNAL SOURCE DEPENDENCY**.
- Real Pilot-02/03/04/05 **NOT STARTED**.
- Synthetic Pilot-01 **PREVIEW_PASS**.
- Synthetic Pilot-02 **DRY-RUN PASS / 9 of 9**.
- Synthetic Pilot-03 **PARALLEL PASS / 3 of 3 days / variance 0**.
- Synthetic Pilot-04 **DECISION REHEARSAL PASS / GO 11 of 11 / 7 NO-GO classes**.
- Synthetic Pilot-05 **EXIT REHEARSAL PASS / EXIT 12 of 12 / 9 NO-EXIT classes**; run `30972650497`.
- **Synthetic validation lane COMPLETE / TEST ONLY**.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956**.

## Synthetic evidence summary

### Pilot-01

`PILOT_01_SYNTHETIC_FIXTURE_V1.json`: all 12 Mapping-V1 datasets, six personas, one active synthetic `Giám đốc`, `PREVIEW_PASS`, zero unexplained variance.

### Pilot-02

`PILOT_02_SYNTHETIC_DRY_RUN_V1.json`: nine representative segments PASS across Sales, Procurement, Stock, Manufacturing, Finance, correction/return, warranty/service and idempotency.

### Pilot-03

Run `30970432986`: three cumulative workerd/D1 business days reconcile at tolerance `0` across Stock qty/value, AR/AP, Bank, revenue/COGS, Manufacturing/WIP, GL, document state and retries. Independent AR/AP/cross-ledger auditors PASS.

### Pilot-04

Run `30972065238`: baseline synthetic `GO` requires all 11/11 gates. P0/P1, variance, approval defects, release/package/profile drift, stale recovery, invalid cutoff or non-synthetic invocation produce `NO-GO`. `cutover_authorized=false` always.

### Pilot-05

Authorities:

- `docs/pilot/alumdoor/PILOT_05_SYNTHETIC_EXIT_V1.json`;
- `docs/pilot/alumdoor/PILOT_05_STATUS.json`;
- `.github/workflows/pilot-05-synthetic-exit.yml`;
- `docs/pilot/alumdoor/tools/evaluate-pilot-05-synthetic.mjs`.

Run `30972650497` passed:

- baseline three-day synthetic hypercare -> `EXIT` with 12/12 gates;
- all 9 NO-EXIT scenario classes;
- local runtime health rerun;
- Pilot-03 transaction/reconciliation continuity rerun;
- backup/recovery safety rerun;
- Pilot-04 decision-governance rerun.

Artifact ID `8917093954`; SHA-256 `c2e1b5e2b1c3bd08913285a0988b6638715ea0a87de7fa6ffe2d5306d53834b8`.

Synthetic EXIT still keeps `production_write_authorized=false`, `cutover_authorized=false`, `ga_authorized=false`, `accepted_production_reference_authorized=false`, and `real_pilot_transition_allowed=false`.

## Real Pilot-01 remains externally blocked

Required source-owner evidence:

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

No further synthetic pilot phase is required. Next meaningful work is **real Pilot-01 source completion**: bind actual extracts by SHA-256/provenance, freeze one source-proven common cutoff, build the private Mapping-V1 batch, obtain real zero-variance `PREVIEW_PASS`, freeze named pilot accounts, then start real Pilot-02 only after those conditions are satisfied.

## Production boundary

Synthetic PASS/GO/EXIT never authorizes production write, real cutover, Accepted Production Reference or GA. Real customer/master/opening import, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
