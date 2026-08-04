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
- evaluated cutoff `30/06/2026`: **NOT PROVEN / NOT FROZEN**.
- Pilot-01 verdict: `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`.
- Active work: **source-authoritative opening evidence + quantity/UOM reconciliation**.

Do not advance to Pilot-02 until one common cutoff is source-proven and the normalized Mapping-V1 batch reaches zero-variance `PREVIEW_PASS`.

## Read order

1. `PILOT_00_CONTRACT.md`
2. `PILOT_00_LOCK.json`
3. `PILOT_DATA_MAPPING_V1.json`
4. `PILOT_01_IDENTITY_DISPOSITION_V1.json`
5. `PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`
6. `PILOT_01_CUTOFF_FEASIBILITY_20260805.md`
7. `PILOT_01_CUTOFF_FEASIBILITY_20260805.json`
8. `PILOT_01_SOURCE_INGEST_20260805.md`
9. `PILOT_01_SOURCE_INGEST_20260805.json`
10. `PILOT_01_STATUS.json`
11. `PILOT_01_READINESS.md`
12. `tools/normalize-pilot-identities.mjs`
13. `tools/normalize-pilot-aliases-suppliers.mjs`
14. `tools/validate-pilot-batch.mjs`
15. `../../../NEXT_TASKS.md`

## Program shape

```text
R6 PILOT-GO
  -> Pilot-00 LOCKED
  -> Pilot-01 source ingest DONE
  -> duplicate identity LOCKED
  -> item identity 60/60 + supplier roles DONE
  -> 30/06 cutoff evaluated: NOT PROVEN
  -> opening evidence + UOM reconciliation [ACTIVE]
  -> real PREVIEW_PASS
  -> Pilot-02 Dry Run
  -> Pilot-03 Parallel Run
  -> Pilot-04 Cutover Decision
  -> Pilot-05 Hypercare/Exit
```

## Identity truth

- duplicate Customer: keep first canonical row and remap references;
- exact duplicate Item code: later collisions get lowest free `01`, `02`, `03`... suffix with lineage preserved;
- uploaded master is 277/277 unique, so the suffix rule is currently a guard;
- 60 historical journal identities are closed as 41 canonical aliases, 18 supplemental source identities, and one composite explosion;
- no fuzzy item or party matching is used;
- supplier purchase-party role gaps are closed 4 -> 0.

Identity resolution does **not** automatically authorize a stock/accounting UOM conversion. The 18 supplemental identities and three axis-sensitive aliases still require canonical quantity/UOM semantics.

## Cutoff truth

`30/06/2026` is not a frozen pilot cutoff.

- Cash activity reaches 30/06.
- AR has receipts from 08/04 before observed credit sales begin 01/06; observed receipts exceed observed sales, proving carry-in AR. The AR `ĐẦU KỲ` column has 0 populated customer rows.
- AP `ĐẦU KỲ` has 0 populated supplier rows.
- Aluminum stock has physical history but 0 populated actual-Kg cells, no source-authoritative opening valuation, incomplete scope versus the process specification, and two future-dated source rows.

Missing financial openings are never treated as zero. See `PILOT_01_CUTOFF_FEASIBILITY_20260805.json` for exact counts.

## Real-source handling

Raw customer/master/opening workbooks remain outside Git. Git retains source file identity/hash, structural counts, non-sensitive reconciliation findings and acceptance contracts.

## Preview rule

The private normalized batch must have one source-proven common cutoff, SHA-256-bound files, Mapping V1, resolved references, exact source opening totals, named accounts including exactly one active `Giám đốc`, and **zero unexplained variance**.

`PREVIEW_PASS` remains preview-only and does not authorize production write.

## Non-negotiable boundaries

- certified product identity remains exact-SHA bound;
- no direct D1 edits or shadow Stock/Finance ledgers;
- theoretical kg/m is not silently relabelled as measured opening Kg;
- missing AR/AP openings are not assumed zero;
- real production import/write, cutover, provider mutation and destructive recovery remain explicit authorization boundaries.
