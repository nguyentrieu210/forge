# NEXT TASKS

Ngày cập nhật: **2026-08-05**.

Đây là active queue của Forge. Real pilot state và synthetic validation state phải được giữ tách biệt.

## 0. Current state

- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6 Production Certification: **DONE / PILOT-GO**.
- Exact certified/deployed R6 SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Real Pilot-01: **SOURCE INGESTED / PREVIEW-BLOCKED / EXTERNAL SOURCE DEPENDENCY**.
- Synthetic Pilot-01: **PREVIEW_PASS / TEST ONLY**.
- Synthetic Pilot-02: **DRY-RUN PASS / 9 of 9 representative segments**.
- Synthetic Pilot-02 initial executable run: `30968821466`.
- Real Pilot-02: **NOT STARTED** until real Pilot-01 becomes READY.
- Active synthetic next step: **Pilot-03 synthetic parallel-run + daily reconciliation harness**.

Synthetic PASS results validate tooling and executable business paths only. They do not authorize real pilot transition or production mutation.

## 1. Real Pilot-01 — externally blocked

Current accepted Alumdoor files have already been pushed as far as the evidence safely permits:

- duplicate Customer references collapse to one retained canonical Customer;
- exact duplicate Item codes, if encountered, use lowest free `01`, `02`, `03`... suffix with source lineage;
- 60/60 historical journal Item strings have deterministic disposition;
- Supplier role gaps are closed `4 -> 0` without fuzzy party merge;
- overloaded `NVL-TON-DL7.2Dx124-XNXLC` is context-split between raw Stock `Kg` and commercial Sales `m2`;
- 19/21 reviewed UOM identities are resolved/classified; two remain fail-closed;
- 45 fractional VND totals use locked per-row integer-VND rounding with raw provenance;
- two future-dated `VIPST700` rows are quarantined rather than silently redated;
- `30/06/2026` was evaluated and rejected as an unproven common cutoff.

The current-conversation uploads, File Library and repository authorities were reviewed. No additional Alumdoor-authoritative AR/AP opening, actual-Kg/value Stock opening, missing stock-scope extract or named pilot-user allowlist was found.

### Required real source-owner inputs

1. full-customer AR opening at one named cutoff;
2. full-supplier AP opening at the same cutoff;
3. canonical Stock quantity + value at that cutoff, including actual aluminum Kg/value and complete scope;
4. matching cash/bank balances if in scope, or explicit cash/bank scope exclusion;
5. physical UOM/conversion evidence for `NVL-AL595-GS`;
6. physical UOM/conversion evidence for `NVL-BO1VIS AL71`;
7. corrected dates for the two quarantined `VIPST700` rows;
8. named pilot account allowlist with exactly one active named `Giám đốc` account.

These values may not be synthesized for the real pilot.

## 2. Synthetic Pilot-01 — DONE

Authority: `docs/pilot/alumdoor/PILOT_01_SYNTHETIC_FIXTURE_V1.json`.

The deterministic synthetic batch contains all 12 required Mapping-V1 datasets and reaches `PREVIEW_PASS` with zero unexplained variance. It contains no real customer data and does not satisfy the real Pilot-01 dependencies.

## 3. Synthetic Pilot-02 — DONE / PASS

Authorities:

- `docs/pilot/alumdoor/PILOT_02_SYNTHETIC_DRY_RUN_V1.json`;
- `docs/pilot/alumdoor/PILOT_02_STATUS.json`;
- `.github/workflows/pilot-02-synthetic-dry-run.yml`.

Initial executable run `30968821466` passed all nine representative segments:

1. synthetic Pilot-01 handoff;
2. Sales/O2C;
3. Procurement/P2P;
4. Stock/fulfilment;
5. Manufacturing;
6. Finance settlement + cross-ledger reconciliation;
7. correction/return negative paths;
8. warranty/service/replacement/return lineage;
9. idempotency/retry safety.

The lane runs only on GitHub-hosted CI using local workerd/in-memory/synthetic fixtures. It does not load production secrets, call `alu.kairo.vn`, deploy, migrate or write remote D1.

## 4. Active synthetic next step — Pilot-03

Build a bounded synthetic parallel-run/reconciliation harness that replays repeated business days and compares canonical authority surfaces after each day.

Required Pilot-03 synthetic evidence:

- Stock quantity/value reconciliation;
- AR/AP reconciliation;
- scoped cash/bank reconciliation when included;
- revenue/COGS reconciliation;
- Manufacturing/WIP reconciliation;
- GL debit/credit/balance equality;
- document count/status equality;
- deterministic retries/idempotency across repeated daily runs;
- explicit discrepancy register with default tolerance `0`;
- no production environment or customer data.

Target verdict: **`PILOT-03-SYNTHETIC-PASS`**. This remains test evidence only and does not advance the real pilot.

## 5. Real transition rule

Real Pilot-01 stays PREVIEW-BLOCKED until the external source inputs are supplied and one common cutoff is source-proven. Then:

1. bind source extracts by SHA-256/provenance;
2. normalize under Mapping V1 and locked identity/UOM/money policies;
3. generate the private real batch;
4. run `validate-pilot-batch.mjs`;
5. require zero unexplained variance and real `PREVIEW_PASS`;
6. freeze named accounts;
7. only then start **real Pilot-02 Dry Run**.

`PREVIEW_PASS` still does not authorize production write/import.

## 6. Standing boundaries

- Controlled pilot is not GA.
- Synthetic values are never substituted for missing real openings.
- Raw real customer/master/opening files remain outside Git.
- Missing opening values are never assumed zero.
- Rate-like `KG/M` / `KG/M2` labels are never silently promoted to stock quantities.
- Future-dated source rows are never silently rewritten.
- Real production data write/import, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
