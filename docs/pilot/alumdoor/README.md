# Alumdoor Controlled Pilot

Status: **ACTIVE**  
Pilot entry gate: **R6 PILOT-GO**  
Certified software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`  
Pilot target: tenant `alu` at `https://alu.kairo.vn`

## Current phase

- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 source ingest: **DONE**.
- duplicate identity policy: **LOCKED**.
- 60 journal item identities: **60/60 DISPOSITIONED**.
- supplier purchase-party role gaps: **4 -> 0**.
- UOM/quantity: **21 reviewed / 19 resolved-or-classified / 2 fail-closed**.
- VND rounding: **LOCKED / per-row integer VND**.
- future stock dates: **2 VIPST700 rows quarantined**.
- cutoff `30/06/2026`: **NOT PROVEN / NOT FROZEN**.
- Pilot-01 verdict: `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`.
- Active work: **source-authoritative opening evidence + residual source-owner/access blockers**.

## Read order

1. `PILOT_00_CONTRACT.md`
2. `PILOT_DATA_MAPPING_V1.json`
3. `PILOT_01_IDENTITY_DISPOSITION_V1.json`
4. `PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`
5. `PILOT_01_UOM_RECONCILIATION_V1.json`
6. `PILOT_01_MONEY_ROUNDING_V1.json`
7. `PILOT_01_STOCK_ANOMALY_DISPOSITION_V1.json`
8. `PILOT_01_CUTOFF_FEASIBILITY_20260805.json`
9. `PILOT_01_STATUS.json`
10. `tools/reconcile-pilot-uom.mjs`
11. `tools/normalize-pilot-money.mjs`
12. `tools/validate-pilot-batch.mjs`
13. `../../../NEXT_TASKS.md`

## Program shape

```text
R6 PILOT-GO
  -> Pilot-00 LOCKED
  -> source ingest DONE
  -> identity + supplier reconciliation DONE
  -> UOM 19/21 locked, 2 blocked
  -> VND rounding LOCKED
  -> 2 future stock rows QUARANTINED
  -> common opening evidence [ACTIVE / BLOCKED]
  -> PREVIEW_PASS
  -> Pilot-02 Dry Run
  -> Pilot-03 Parallel Run
  -> Pilot-04 Cutover Decision
  -> Pilot-05 Hypercare/Exit
```

## Rounding rule

The source `Tổng thanh toán` column displays integer VND. Forty-five underlying source values are fractional, so normalization rounds **each row/document** to nearest integer VND, exact half away from zero, while retaining raw source value and rounding delta. This is a declared reconciliation transformation, not unexplained variance.

## Stock anomaly rule

`VIPST700` rows 46–47 are raw-dated `23/12/2026`, with 157 pieces total. No history entry proves a corrected date. They remain unchanged in source evidence but are **quarantined from opening** until corrected by the source owner.

After quarantine, physical source-status metrics are 1,150 rows / 40,980 pieces-leaves. These are physical metrics only, not canonical Kg/value.

Stock scope is still incomplete versus the process specification (23 aluminum + 2 mesh expected vs 18 inventory sheets observed, no separate mesh opening source).

## Preview blockers

The remaining blockers are source-authoritative AR/AP opening snapshots, canonical Stock Kg/value and complete scope at one common cutoff, two unresolved UOM conversions, two row-level quantity conflicts, source correction of quarantined dates, and minimum BOM/work-center/employee/pilot-user data including exactly one active named `Giám đốc` account.

`30/06/2026` remains an evaluated candidate only; missing AR/AP openings are never treated as zero.

## Boundaries

`PREVIEW_PASS` remains preview-only. No direct D1 edits, shadow ledgers, guessed UOM conversions, guessed financial openings or silent source-date rewrites are allowed. Real production import/write, cutover, provider mutation and destructive recovery remain explicit authorization boundaries.
