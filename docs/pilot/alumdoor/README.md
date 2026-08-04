# Alumdoor Controlled Pilot

Status: **ACTIVE**  
Pilot entry gate: **R6 PILOT-GO**  
Certified software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`  
Pilot target: tenant `alu` at `https://alu.kairo.vn`

This directory is the durable authority for the controlled Alumdoor pilot after R6 production certification.

## Current phase

- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 control plane: **READY / PREVIEW-ONLY**.
- Pilot-01 real uploaded source set: **OBSERVED / HASHED / INGESTED**.
- Pilot-01 duplicate identity policy: **LOCKED**.
- Current truthful Pilot-01 verdict: `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`.
- Active work: source reconciliation + normalization into a private Mapping-V1 batch.

Do not advance to Pilot-02 merely because real files exist. Pilot-01 requires one coherent cutoff, resolved references, canonical Stock/money semantics and a real zero-variance `PREVIEW_PASS` first.

## Read order

1. `PILOT_00_CONTRACT.md` — frozen pilot scope, roles, transaction families, reconciliation and stop/cutover rules.
2. `PILOT_00_LOCK.json` — machine-readable exact release/package/profile and governance lock.
3. `PILOT_DATA_MAPPING_V1.json` — frozen master/opening-data mapping contract.
4. `PILOT_01_IDENTITY_DISPOSITION_V1.json` — locked duplicate Customer/item-code normalization policy.
5. `PILOT_01_SOURCE_INGEST_20260805.md` — disposition of the real uploaded Alumdoor source set.
6. `PILOT_01_SOURCE_INGEST_20260805.json` — immutable source digests, structural counts and original blocker observations.
7. `PILOT_01_READINESS.md` — source-batch, validation and preview acceptance contract.
8. `PILOT_01_STATUS.json` — machine-readable current Pilot-01 state.
9. `PILOT_01_BATCH_MANIFEST_TEMPLATE.json` — immutable normalized batch manifest template.
10. `tools/normalize-pilot-identities.mjs` — deterministic duplicate normalization; no production write.
11. `tools/validate-pilot-batch.mjs` — preview-only validator; never writes production.
12. `../../agents/r6/R6_FINAL_CERTIFICATION_20260805.md` — exact R6 entry evidence.
13. `../../../NEXT_TASKS.md` — active pilot queue.

## Program shape

```text
R6 PILOT-GO
  -> Pilot-00 Freeze Contract [LOCKED]
  -> Pilot-01 Source ingest [DONE]
  -> Pilot-01 Duplicate identity disposition [LOCKED]
  -> Pilot-01 Reconcile + normalize [ACTIVE / PREVIEW-BLOCKED]
  -> real PREVIEW_PASS
  -> Pilot-02 Representative Transaction Dry Run
  -> Pilot-03 Parallel Run + Daily Reconciliation
  -> Pilot-04 Cutover Decision
  -> Pilot-05 Hypercare + Exit Gate
  -> PILOT-ACCEPTED / PILOT-REJECTED
```

## Duplicate identity rule

The operator-approved rule is deterministic:

- duplicate Customer names normalize to one canonical Customer: retain the first source row, drop later duplicate Customer output rows, and remap Customer references to the retained `source_key`;
- exact duplicate item codes retain the first code; later collisions receive the lowest free suffix `01`, `02`, `03`... and preserve `source_code_original`;
- pre-existing source codes are reserved, so a generated suffix never overwrites a real code;
- the uploaded item master currently has 277/277 unique codes, so the suffix rule is a collision guard for normalization rather than a change to those observed rows;
- 60 journal item strings that do not match master codes remain an alias/reference problem and are not auto-created as suffixed codes.

## Real-source handling

The source set supplied through the operator conversation includes item-master, customer/supplier/operational-ledger, purchase-order, customer-order history, aluminum-stock and process/formula files.

Raw customer workbooks are intentionally **not committed to Git**. Git retains only:

- source file name/role;
- SHA-256 digest;
- structural row/sheet counts;
- non-sensitive validation/reconciliation findings;
- normalized acceptance/evidence contracts.

## Pilot-01 preview rule

The eventual private normalized batch is bound by:

- one immutable batch ID;
- exact source system/cutoff/extract timestamps;
- exact SHA-256 for every normalized data file;
- frozen mapping v1;
- locked identity disposition v1;
- exact source-authoritative opening totals;
- named account allowlist;
- exactly one active named `Giám đốc` account;
- zero unexplained reconciliation variance.

Current source evidence is not yet a normalized `PREVIEW_PASS` batch. Remaining major blockers include common-cutoff drift, supplier/item alias gaps, missing actual Kg evidence for aluminum opening stock, unproven opening AR/AP, stock-sheet scope drift and incomplete access/operating masters.

The validator returns `PREVIEW_PASS` or `PREVIEW_FAIL`. It has no deployment/import/migration path and always reports `production_write_authorized=false`.

## Non-negotiable boundaries

- The certified product identity remains exact-SHA bound. Documentation/evidence/control-plane commits on `main` do not change the deployed product identity.
- Any product-source change creates a new release candidate and must rerun affected release evidence before use in the pilot.
- Any package/profile identity change invalidates the corresponding pilot identity lock until affected runtime/Golden Flow evidence is rerun.
- Real customer/master/opening-data import or write is not authorized by Pilot-00 or a Pilot-01 preview PASS.
- No direct D1 edits, vertical shadow Stock/Finance ledgers, or bypass of canonical lifecycle APIs are allowed.
- Theoretical kg/m evidence is not measured opening-stock Kg unless an explicit source-bound conversion policy is approved and its evidence semantics remain distinct.
- Code rollback does not imply data rollback. PITR/restore remains a separate explicit operation.
- Package fixtures/demo/Golden Flow records are not accepted as real opening-data evidence.
