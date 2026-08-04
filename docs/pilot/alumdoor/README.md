# Alumdoor Controlled Pilot

Status: **ACTIVE**  
Pilot entry gate: **R6 PILOT-GO**  
Certified software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`  
Pilot target: tenant `alu` at `https://alu.kairo.vn`

This directory is the durable authority for the controlled Alumdoor pilot after R6 production certification.

## Current phase

- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 control plane: **READY / PREVIEW-ONLY**.
- Pilot-01 real source batch: **WAITING APPROVED SOURCE DATA**.
- Current truthful Pilot-01 verdict: `PILOT-01-WAITING-SOURCE-BATCH`.

Do not advance to Pilot-02 merely because the validator/tooling exists. Pilot-01 requires a real approved immutable batch to produce `PREVIEW_PASS` first.

## Read order

1. `PILOT_00_CONTRACT.md` — frozen pilot scope, roles, transaction families, reconciliation and stop/cutover rules.
2. `PILOT_00_LOCK.json` — machine-readable exact release/package/profile and governance lock.
3. `PILOT_DATA_MAPPING_V1.json` — frozen master/opening-data mapping contract.
4. `PILOT_01_READINESS.md` — source-batch, validation and preview acceptance contract.
5. `PILOT_01_STATUS.json` — machine-readable current Pilot-01 state.
6. `PILOT_01_BATCH_MANIFEST_TEMPLATE.json` — immutable real-source batch manifest template.
7. `tools/validate-pilot-batch.mjs` — preview-only validator; never writes production.
8. `../../agents/r6/R6_FINAL_CERTIFICATION_20260805.md` — exact R6 entry evidence.
9. `../../../NEXT_TASKS.md` — active pilot queue.

## Program shape

```text
R6 PILOT-GO
  -> Pilot-00 Freeze Contract [LOCKED]
  -> Pilot-01 Master + Opening Data Readiness [WAITING REAL SOURCE BATCH]
  -> Pilot-02 Representative Transaction Dry Run
  -> Pilot-03 Parallel Run + Daily Reconciliation
  -> Pilot-04 Cutover Decision
  -> Pilot-05 Hypercare + Exit Gate
  -> PILOT-ACCEPTED / PILOT-REJECTED
```

## Pilot-01 preview rule

Real customer/master/opening data should remain outside Git in an approved secure batch directory.

Each batch is bound by:

- one immutable batch ID;
- exact source system/cutoff/extract timestamps;
- exact SHA-256 for every normalized data file;
- frozen mapping v1;
- exact source-authoritative opening totals;
- named account allowlist;
- exactly one active named `Giám đốc` account;
- zero unexplained reconciliation variance.

The validator returns `PREVIEW_PASS` or `PREVIEW_FAIL`. It has no deployment/import/migration path and always reports `production_write_authorized=false`.

## Non-negotiable boundaries

- The certified product identity remains exact-SHA bound. Documentation/evidence/control-plane commits on `main` do not change the deployed product identity.
- Any product-source change creates a new release candidate and must rerun affected release evidence before use in the pilot.
- Any package/profile identity change invalidates the corresponding pilot identity lock until affected runtime/Golden Flow evidence is rerun.
- Real customer/master/opening-data import or write is not authorized by Pilot-00 or a Pilot-01 preview PASS.
- No direct D1 edits, vertical shadow Stock/Finance ledgers, or bypass of canonical lifecycle APIs are allowed.
- Code rollback does not imply data rollback. PITR/restore remains a separate explicit operation.
- Package fixtures/demo/Golden Flow records are not accepted as real opening-data evidence.
