# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo `nguyentrieu210/forge`.
- RC4 **DONE**; R5 **DONE / R5-GO**; R6 **DONE / PILOT-GO**.
- Exact certified/deployed R6 SHA `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Pilot-00 **DONE / PILOT-00-LOCKED**.
- Real Pilot-01 **SOURCE INGESTED / PREVIEW-BLOCKED / EXTERNAL SOURCE DEPENDENCY**.
- Synthetic Pilot-01 **PREVIEW_PASS / TEST ONLY**.
- Synthetic Pilot-02 **DRY-RUN PASS / 9 of 9 segments**; latest verified run `30969301875`.
- Accompanying R6/source-safety run `30969301881` **SUCCESS**.
- Real Pilot-02 **NOT STARTED**, gated by real Pilot-01 READY.
- Next synthetic validation step: **Pilot-03 synthetic parallel-run + daily reconciliation**.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956**.

## Synthetic validation lane

### Pilot-01 synthetic

`docs/pilot/alumdoor/PILOT_01_SYNTHETIC_FIXTURE_V1.json` + `tools/generate-pilot-01-synthetic-batch.mjs` generate all 12 Mapping-V1 datasets, all six personas and exactly one active synthetic `Giám đốc` account. Validator result: `PREVIEW_PASS`, zero unexplained variance, no real customer data.

### Pilot-02 synthetic

Authorities:

- `docs/pilot/alumdoor/PILOT_02_SYNTHETIC_DRY_RUN_V1.json`;
- `docs/pilot/alumdoor/PILOT_02_STATUS.json`;
- `.github/workflows/pilot-02-synthetic-dry-run.yml`.

Latest verified run `30969301875` passed:

1. synthetic Pilot-01 handoff;
2. Sales/O2C;
3. Procurement/P2P;
4. Stock/fulfilment;
5. Manufacturing;
6. Finance settlement + cross-ledger reconciliation;
7. correction/return negative paths;
8. warranty/service/replacement/return lineage;
9. idempotency/retry safety.

The workflow uses GitHub-hosted local CI/workerd/in-memory fixtures only. It loads no production Cloudflare secrets, calls no production origin, performs no deploy/migration and does not write remote D1.

## Real Pilot-01 remains externally blocked

Already closed from accepted real sources: 60/60 journal identities, Supplier role gaps `4 -> 0`, duplicate rules, UOM `19/21`, deterministic VND rounding, two VIPST700 rows quarantined, and `30/06/2026` rejected as an unproven common cutoff.

Required real source-owner evidence remains:

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

Synthetic lane: build **Pilot-03 parallel-run/reconciliation harness** with repeated business-day replay and zero-tolerance reconciliation across Stock, AR/AP, scoped cash/bank, revenue/COGS, Manufacturing/WIP, GL and document state.

Real lane: wait for source-owner evidence, then hash/bind extracts, freeze one common cutoff, generate private batch and require real `PREVIEW_PASS` before real Pilot-02.

## Production boundary

Synthetic PASS does not authorize production write. Real customer/master/opening import, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
