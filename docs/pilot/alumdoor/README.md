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
- UOM/quantity review: **21 reviewed / 19 resolved-or-classified / 2 fail-closed**.
- evaluated cutoff `30/06/2026`: **NOT PROVEN / NOT FROZEN**.
- Pilot-01 verdict: `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`.
- Active work: **source-authoritative opening evidence + residual data/UOM blockers**.

Do not advance to Pilot-02 until one common cutoff is source-proven and the normalized Mapping-V1 batch reaches zero-variance `PREVIEW_PASS`.

## Read order

1. `PILOT_00_CONTRACT.md`
2. `PILOT_00_LOCK.json`
3. `PILOT_DATA_MAPPING_V1.json`
4. `PILOT_01_IDENTITY_DISPOSITION_V1.json`
5. `PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`
6. `PILOT_01_UOM_RECONCILIATION_V1.json`
7. `PILOT_01_CUTOFF_FEASIBILITY_20260805.md`
8. `PILOT_01_CUTOFF_FEASIBILITY_20260805.json`
9. `PILOT_01_SOURCE_INGEST_20260805.json`
10. `PILOT_01_STATUS.json`
11. `tools/normalize-pilot-identities.mjs`
12. `tools/normalize-pilot-aliases-suppliers.mjs`
13. `tools/reconcile-pilot-uom.mjs`
14. `tools/validate-pilot-batch.mjs`
15. `../../../NEXT_TASKS.md`

## Program shape

```text
R6 PILOT-GO
  -> Pilot-00 LOCKED
  -> Pilot-01 source ingest DONE
  -> duplicate identity LOCKED
  -> item identity 60/60 + supplier roles DONE
  -> UOM/quantity 19/21 locked, 2 fail-closed
  -> 30/06 cutoff evaluated: NOT PROVEN
  -> source-authoritative opening evidence [ACTIVE]
  -> real PREVIEW_PASS
  -> Pilot-02 Dry Run
  -> Pilot-03 Parallel Run
  -> Pilot-04 Cutover Decision
  -> Pilot-05 Hypercare/Exit
```

## Identity and UOM truth

Duplicate and journal identity rules remain deterministic: no fuzzy matching and no fabricated suffix codes.

UOM reconciliation now adds a critical context-split rule for `NVL-TON-DL7.2Dx124-XNXLC`:

- raw inventory/opening/purchase context -> keep the source identity in `Kg`; source snapshot is 552 Kg on 27/03/2026;
- sales context -> commercial finished identity `TP-TOLEKEM124_6D` in `m2`;
- no business context -> fail closed.

Other source-backed rules include ray/trục quantity from structured length × piece count, consumables in Kg/Cái, service identities with no stock UOM, and legacy derived commercial lines in m2.

Two stock-UOM identities remain blocked rather than guessed:

- `NVL-AL595-GS`: source snapshot `504 KG/M` conflicts with commercial m2 use; `KG/M` is rate-like, not a safe stock quantity axis.
- `NVL-BO1VIS AL71`: source purchase `159 KG` conflicts with canonical BỌ-family Stock `Con`; no conversion evidence exists.

See `PILOT_01_UOM_RECONCILIATION_V1.json` for exact source rows and row-level blockers.

## Cutoff truth

`30/06/2026` is not a frozen pilot cutoff.

- Cash activity reaches 30/06.
- AR receipts precede observed credit sales and exceed them, proving carry-in AR; AR opening column has 0 populated customer rows.
- AP opening column has 0 populated supplier rows.
- Aluminum stock has physical history but 0 populated actual-Kg cells, no authoritative opening valuation, incomplete scope and two future-dated rows.

Missing financial openings are never treated as zero.

## Real-source handling

Raw customer/master/opening workbooks remain outside Git. Git retains source file identity/hash, structural counts, non-sensitive reconciliation findings and acceptance contracts.

## Preview rule

The private normalized batch must have one source-proven common cutoff, SHA-256-bound files, Mapping V1, resolved references, exact source opening totals, named accounts including exactly one active `Giám đốc`, and **zero unexplained variance**.

`PREVIEW_PASS` remains preview-only and does not authorize production write.

## Non-negotiable boundaries

- certified product identity remains exact-SHA bound;
- no direct D1 edits or shadow Stock/Finance ledgers;
- rate-like source labels such as `KG/M` and `KG/M2` are not silently promoted to stock quantities;
- missing AR/AP openings are not assumed zero;
- real production import/write, cutover, provider mutation and destructive recovery remain explicit authorization boundaries.
