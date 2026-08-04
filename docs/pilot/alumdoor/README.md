# Alumdoor Controlled Pilot

Status: **ACTIVE**  
Pilot entry gate: **R6 PILOT-GO**  
Certified software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`  
Pilot target: tenant `alu` at `https://alu.kairo.vn`

This directory is the durable authority for the controlled Alumdoor pilot after R6 production certification.

## Read order

1. `PILOT_00_CONTRACT.md` — frozen pilot scope, roles, transaction families, reconciliation and stop/cutover rules.
2. `PILOT_00_LOCK.json` — machine-readable exact release/package/profile and governance lock.
3. `PILOT_DATA_MAPPING_V1.json` — frozen master/opening-data mapping contract for Pilot-01.
4. `../../agents/r6/R6_FINAL_CERTIFICATION_20260805.md` — exact R6 entry evidence.
5. `../../../NEXT_TASKS.md` — active pilot queue.

## Program shape

```text
R6 PILOT-GO
  -> Pilot-00 Freeze Contract
  -> Pilot-01 Master + Opening Data Readiness
  -> Pilot-02 Representative Transaction Dry Run
  -> Pilot-03 Parallel Run + Daily Reconciliation
  -> Pilot-04 Cutover Decision
  -> Pilot-05 Hypercare + Exit Gate
  -> PILOT-ACCEPTED / PILOT-REJECTED
```

## Non-negotiable boundaries

- The certified product identity remains exact-SHA bound. Documentation/evidence commits on `main` do not change the deployed product identity.
- Any product-source change creates a new release candidate and must rerun affected release evidence before use in the pilot.
- Any package/profile identity change invalidates the corresponding pilot identity lock until affected runtime/Golden Flow evidence is rerun.
- Real customer/master/opening-data import or write is not part of Pilot-00.
- No direct D1 edits, vertical shadow Stock/Finance ledgers, or bypass of canonical lifecycle APIs are allowed.
- Code rollback does not imply data rollback. PITR/restore remains a separate explicit operation.

Pilot-00 is complete only when the contract and lock files are merged to `main` with verdict `PILOT-00-LOCKED`.
