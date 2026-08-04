# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Đây là handoff ngắn cho phiên tiếp theo. Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo: `nguyentrieu210/forge`.
- Product brand: **Forge**. Naming authority: `docs/BRAND_AND_NAMING.md`.
- Repo/docs North Star rebaseline audit: `docs/FORGE_REPOSITORY_NORTH_STAR_AUDIT_20260805.md`.
- RC4: **DONE**.
- R5: **DONE / R5-GO** via PR `#638`.
- R6 Production Certification: **DONE / PILOT-GO**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 control plane: **READY / PREVIEW-ONLY**.
- Pilot-01 real uploaded source set: **OBSERVED / HASHED / INGESTED**.
- Current truthful Pilot-01 verdict: `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`.
- Exact frozen pilot software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Release bundle: `838218167db020d8`.
- Packages: Alumdoor `2.2.3`, HRM `1.8.0`, VN Accounting `1.6.1`.
- Active profile: `alumdoor-pilot@1`, valid, no blocked capabilities.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** unless a newer materialized convergence record changes it.

Technical identifiers such as `@metaforge/*`, `metaforge.api.*`, `cloudforge-*` and exact `kairo.vn` hostnames may remain. Do not reinterpret them as separate current product brands or mass-rename them without a compatibility/migration program.

Pilot authorities:

- `docs/pilot/alumdoor/README.md`;
- `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`;
- `docs/pilot/alumdoor/PILOT_00_LOCK.json`;
- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_READINESS.md`;
- `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.md`;
- `docs/pilot/alumdoor/PILOT_01_BATCH_MANIFEST_TEMPLATE.json`.

## What is next

Active phase remains **Pilot-01 — Master + Opening Data Readiness**, but source acquisition is no longer the blocker. The uploaded Alumdoor files are real source evidence. The next work is reconciliation + normalization into a private Mapping-V1 batch.

Observed source coverage includes:

1. 277-row unique item-code master export;
2. 258 customer source rows / 256 exact customer names;
3. 8 supplier-master rows;
4. 730 typed operating-journal rows;
5. current TIẾN ĐẠT purchase-order reference;
6. 11-sheet customer order/history workbook;
7. aluminum lot workbook with 21 total sheets / 18 inventory sheets / 1,506 source lot rows;
8. supplied business-process/formula specification.

Raw customer workbooks remain outside Git. Their exact SHA-256 digests and structural evidence are recorded in `PILOT_01_SOURCE_INGEST_20260805.json`.

## Current blockers to PREVIEW_PASS

- no single proven business cutoff across Stock + AR/AP + cash/bank;
- two duplicate customer identities need source-owner disposition;
- supplier role/party aliases remain after preserving canonical TIẾN ĐẠT;
- 60 distinct journal item-code strings do not exact-match the uploaded item export and need canonical alias reconciliation;
- aluminum lots contain length/piece evidence but no populated actual-Kg values; canonical `Nhôm cây/lá` Stock UOM is Kg and theoretical kg/m must not be relabelled as measured quantity;
- process specification says 23 aluminum sheets + 2 mesh sheets, while the uploaded aluminum workbook has 21 total / 18 inventory sheets and no separate mesh source was observed;
- two `VIPST700` source rows carry future date `23/12/2026`;
- opening AR/AP cannot be safely reconstructed from the observed activity window;
- 45 typed journal rows contain fractional `Tổng thanh toán` and need a deterministic integer-VND rule;
- complete work-center/BOM/employee/pilot-user datasets are not migration-ready;
- exactly one active named `Giám đốc` pilot account remains required.

## Next execution order

1. reconcile item codes against canonical Alumdoor aliases/standardization;
2. reconcile customer/supplier party identities without fuzzy merging;
3. freeze one coherent source cutoff;
4. obtain matching AR/AP/cash-bank opening snapshots at that cutoff;
5. disposition stock sheet scope and the two future dates;
6. obtain actual measured Kg/value evidence for opening aluminum stock, or an explicitly approved source-bound conversion policy that does not mislabel theoretical evidence;
7. complete work-center/BOM/employee scope and named pilot accounts;
8. generate a private normalized batch and run `validate-pilot-batch.mjs`;
9. only a real zero-variance `PREVIEW_PASS` advances Pilot-01 to READY.

## Documentation / hygiene rule

Do not restore deleted handoff/status/candidate/debug files because an old workflow, PR or commit mentions them. Historical provenance belongs in Git/PR history and final convergence evidence. Current authority/read order is defined by `docs/README.md`.

## Production boundary

No Pilot-01 real production import/write has occurred.

A `PREVIEW_PASS` still does not authorize real customer/master/opening-data import/write. Production import, cutover, DNS/route/secret/provider mutation, restore/PITR and destructive state operations remain explicit authorization boundaries.

## Read order

1. exact GitHub `main` + relevant PR/branch;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `PROJECT_CONTEXT.md`;
5. `docs/README.md`;
6. `docs/BRAND_AND_NAMING.md`;
7. `docs/pilot/alumdoor/README.md`;
8. `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.md`;
9. `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
10. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
11. `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md` for certified entry provenance.
