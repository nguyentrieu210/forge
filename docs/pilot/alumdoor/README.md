# Alumdoor Controlled Pilot

Status: **ACTIVE**  
Pilot entry gate: **R6 PILOT-GO**  
Certified software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`  
Pilot target: tenant `alu` at `https://alu.kairo.vn`

This directory is the durable authority for the controlled Alumdoor pilot after R6 production certification.

## Current phase

- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 control plane: **READY / PREVIEW-ONLY**.
- Pilot-01 real source set: **OBSERVED / HASHED / INGESTED**.
- duplicate Customer/item-code policy: **LOCKED**.
- 60 historical journal item identities: **60/60 DISPOSITIONED**.
- supplier purchase-party roles: **RECONCILED / 4 -> 0 gaps**.
- current Pilot-01 verdict: `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`.
- active work: **cutoff + quantity/UOM + opening-data reconciliation**.

Do not advance to Pilot-02 until one coherent cutoff, canonical quantity/money semantics, resolved opening references and a real zero-variance `PREVIEW_PASS` exist.

## Read order

1. `PILOT_00_CONTRACT.md`
2. `PILOT_00_LOCK.json`
3. `PILOT_DATA_MAPPING_V1.json`
4. `PILOT_01_IDENTITY_DISPOSITION_V1.json`
5. `PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`
6. `PILOT_01_SOURCE_INGEST_20260805.md`
7. `PILOT_01_SOURCE_INGEST_20260805.json`
8. `PILOT_01_READINESS.md`
9. `PILOT_01_STATUS.json`
10. `PILOT_01_BATCH_MANIFEST_TEMPLATE.json`
11. `tools/normalize-pilot-identities.mjs`
12. `tools/normalize-pilot-aliases-suppliers.mjs`
13. `tools/validate-pilot-batch.mjs`
14. `../../../NEXT_TASKS.md`

## Program shape

```text
R6 PILOT-GO
  -> Pilot-00 Freeze Contract [LOCKED]
  -> Pilot-01 Source ingest [DONE]
  -> Duplicate identity disposition [LOCKED]
  -> Journal item identity 60/60 + supplier roles [DONE]
  -> Cutoff/UOM/opening reconciliation [ACTIVE / PREVIEW-BLOCKED]
  -> real PREVIEW_PASS
  -> Pilot-02 Representative Transaction Dry Run
  -> Pilot-03 Parallel Run + Daily Reconciliation
  -> Pilot-04 Cutover Decision
  -> Pilot-05 Hypercare + Exit Gate
  -> PILOT-ACCEPTED / PILOT-REJECTED
```

## Identity rules

### Duplicate identities

- duplicate Customer names: retain the first source row and remap references to it;
- exact duplicate item codes: retain first; later collisions receive lowest free `01`, `02`, `03`... suffix and preserve `source_code_original`;
- existing source codes are reserved, so generated suffixes never overwrite real codes.

### 60 historical journal item strings

They are no longer unresolved identity gaps:

- 41 explicit source-backed aliases map to existing master Items;
- 18 source-only stock/component/service identities remain explicit supplemental identities;
- `NVL-LD-3LD` explodes to the canonical atomic leaf-bottom items.

No fuzzy matching and no fake suffix codes are used.

Identity resolution does **not** imply quantity-axis acceptance. The 18 supplemental identities and three existing-master aliases retain quantity/UOM reconciliation where source units differ from canonical Stock/commercial axes.

### Supplier roles

Four purchase-party role gaps are dispositioned without fuzzy party merge:

- `TIẾN ĐẠT` -> existing canonical Supplier;
- `ANH HIẾU CẦN THƠ` -> Supplier under the same exact name while preserving Customer role;
- `PHÁT AN KHANG` -> exact Supplier identity;
- `VIỆT ĐÔNG HƯNG` -> exact Supplier identity.

## Real-source handling

Raw customer workbooks are intentionally **not committed to Git**. Git retains only source file identity/hash, structural counts, non-sensitive findings and normalization contracts.

## Remaining preview blockers

- one coherent Stock/AR/AP/cash-bank cutoff is not yet proven; `30/06/2026` is only a candidate;
- supplemental/axis-sensitive quantity and UOM semantics remain to be accepted;
- aluminum opening Stock has physical evidence but no populated actual-Kg cells;
- stock-source scope differs from process specification and contains two future-dated `VIPST700` rows;
- complete opening AR/AP at the same cutoff is not proven;
- 45 journal rows require deterministic integer-VND rounding;
- minimum BOM/work-center/employee/pilot-user datasets are incomplete;
- exactly one active named `Giám đốc` account remains required.

## Preview rule

The private normalized batch must be SHA-256 bound, Mapping-V1 conformant, fully reference-resolved and reconcile with **zero unexplained variance**. `validate-pilot-batch.mjs` remains preview-only and reports `production_write_authorized=false`.

## Non-negotiable boundaries

- Certified product identity remains exact-SHA bound.
- Real customer/master/opening-data import/write is not authorized by Pilot-01 preview work.
- No direct D1 edits or shadow Stock/Finance ledgers.
- Theoretical kg/m is not silently relabelled as measured Kg.
- Code rollback does not imply data rollback.
- Production cutover, destructive recovery and provider mutation remain explicit authorization boundaries.
