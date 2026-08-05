# Alumdoor Controlled Pilot

Status: **ACTIVE**  
Pilot entry gate: **R6 PILOT-GO**  
Certified software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`  
Pilot target: tenant `alu` at `https://alu.kairo.vn`

## Current phase

- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Real Pilot-01: **SOURCE INGESTED / PREVIEW-BLOCKED / EXTERNAL SOURCE DEPENDENCY**.
- Real Pilot-02: **NOT STARTED / gated by real Pilot-01 READY**.
- Synthetic Pilot-01 fixture: **PREVIEW_PASS / TEST ONLY**.
- Synthetic Pilot-02 representative dry run: **PASS / 9 of 9 segments / TEST ONLY**.
- Latest verified synthetic Pilot-02 evidence: workflow run `30969301875`.
- Accompanying R6/source-safety evidence: workflow run `30969301881` — SUCCESS.
- Next synthetic validation step: **Pilot-03 parallel-run + daily reconciliation harness**.

Synthetic validation is deliberately separated from the real pilot state. A synthetic PASS never replaces source-authoritative opening data, named pilot accounts or production approval.

## Synthetic Pilot-01 test batch

A deterministic fake-data generator exists at `tools/generate-pilot-01-synthetic-batch.mjs`.

```bash
node docs/pilot/alumdoor/tools/generate-pilot-01-synthetic-batch.mjs /tmp/alu-pilot-synthetic
```

The generated directory contains `manifest.json`, all 12 required Mapping-V1 dataset JSON files and `preview.json`. It covers 4 Customers, 4 Contacts, 3 Suppliers, 6 Items, 2 BOMs, 2 Work Centers, 3 Warehouses, opening Stock/AR/AP, 6 Employees and all six frozen personas with exactly one active `Giám đốc` account.

Expected synthetic opening totals are Stock quantity `5468`, Stock value `89,500,000` VND, AR `22,750,000` VND and AP `13,000,000` VND. Every `source_key` is `SYN-` prefixed and test accounts use `.invalid`.

The generator hashes every dataset and runs `validate-pilot-batch.mjs`; generation fails unless the fixture reaches `PREVIEW_PASS` with zero unexplained reconciliation variance.

## Pilot-02 synthetic dry run

Authority: `PILOT_02_SYNTHETIC_DRY_RUN_V1.json` and `PILOT_02_STATUS.json`.

Workflow: `.github/workflows/pilot-02-synthetic-dry-run.yml`.

The lane executes nine representative segments:

1. Pilot-01 synthetic `PREVIEW_PASS` handoff;
2. Sales/O2C;
3. Procurement/P2P;
4. Stock + fulfilment;
5. Manufacturing;
6. Finance settlement + cross-ledger reconciliation;
7. correction/return negative paths;
8. warranty/service/replacement/return lineage;
9. idempotency/retry safety.

Latest verified run `30969301875` passed all steps. It runs only on GitHub-hosted local CI/workerd/in-memory fixtures: no production environment, no Cloudflare production secrets, no `alu.kairo.vn` call, no deploy/migration and no remote D1 write.

This proves the business paths are executable against synthetic data; it does **not** satisfy real Pilot-01/Pilot-02 acceptance.

## Real Pilot-01 truth

The safe normalization work from current accepted Alumdoor files remains locked: 60/60 journal identities, supplier role gaps `4 -> 0`, 19/21 UOM resolution/classification with two fail-closed identities, per-row integer-VND rounding, quarantine of two future-dated VIPST700 rows, and rejection of `30/06/2026` as an unproven common cutoff.

The remaining real blockers are source-authoritative AR/AP opening snapshots, canonical Stock Kg/value and complete scope at one common cutoff, two unresolved UOM conversions, source correction of quarantined dates, and named pilot users including exactly one active named `Giám đốc` account.

Missing real openings are never treated as zero and synthetic values are never substituted for them.

## Program shape

```text
REAL LANE
R6 PILOT-GO
  -> Pilot-00 LOCKED
  -> Pilot-01 SOURCE INGESTED / EXTERNAL SOURCE BLOCKED
  -> real PREVIEW_PASS [WAITING SOURCE OWNER]
  -> real Pilot-02
  -> real Pilot-03
  -> Pilot-04 Cutover Decision
  -> Pilot-05 Hypercare/Exit

SYNTHETIC VALIDATION LANE
synthetic Pilot-01 PREVIEW_PASS
  -> synthetic Pilot-02 DRY-RUN PASS (9/9)
  -> synthetic Pilot-03 parallel reconciliation [NEXT]
```

## Read order

1. `PILOT_00_CONTRACT.md`
2. `PILOT_DATA_MAPPING_V1.json`
3. `PILOT_01_STATUS.json`
4. `PILOT_01_EXTERNAL_SOURCE_DEPENDENCIES_20260805.json`
5. `PILOT_01_SYNTHETIC_FIXTURE_V1.json`
6. `PILOT_02_SYNTHETIC_DRY_RUN_V1.json`
7. `PILOT_02_STATUS.json`
8. `tools/generate-pilot-01-synthetic-batch.mjs`
9. `tools/verify-pilot-02-synthetic-contract.mjs`
10. `../../../NEXT_TASKS.md`

## Boundaries

- Synthetic test evidence is not source-authoritative customer evidence.
- `PREVIEW_PASS` or synthetic Pilot-02 PASS does not authorize production write.
- No direct D1 edits, shadow Stock/Finance ledgers, guessed UOM conversions, guessed financial openings or silent source-date rewrites.
- Real production import/write, cutover, DNS/routes/secrets/provider mutation and destructive recovery remain explicit authorization boundaries.
