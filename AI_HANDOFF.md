# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Đây là handoff ngắn cho phiên tiếp theo. Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo: `nguyentrieu210/forge`.
- RC4: **DONE**.
- R5: **DONE / R5-GO** via PR `#638`.
- R6 Production Certification: **DONE / PILOT-GO**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 control plane: **READY / PREVIEW-ONLY**.
- Pilot-01 real uploaded source set: **OBSERVED / HASHED / INGESTED**.
- Pilot-01 duplicate identity policy: **LOCKED**.
- Current truthful Pilot-01 verdict: `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`.
- Exact frozen pilot software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Release bundle: `838218167db020d8`.
- Packages: Alumdoor `2.2.3`, HRM `1.8.0`, VN Accounting `1.6.1`.
- Active profile: `alumdoor-pilot@1`, valid, no blocked capabilities.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** unless a newer materialized convergence record changes it.

Pilot authorities include `PILOT_01_IDENTITY_DISPOSITION_V1.json`, `PILOT_01_STATUS.json`, the source-ingest evidence, Mapping V1 and the Pilot-00 lock.

## Locked duplicate rule

- Duplicate Customer names: retain the first canonical row in immutable source order; later duplicate Customer rows are dropped and their `customer_source_key` references are remapped to the retained Customer.
- Exact duplicate item codes: keep the first original code; later exact collisions receive the lowest free `01`, `02`, `03`... suffix and preserve `source_code_original`.
- The uploaded item master is already **277/277 unique**, so suffixing currently acts as a normalization collision guard.
- The **60 journal item strings not matching master codes remain open alias/reference gaps**; do not manufacture `01` codes for them and do not fuzzy-match them.

## Remaining blockers to PREVIEW_PASS

- one coherent Stock/AR/AP/cash-bank cutoff is not frozen;
- supplier role/party aliases remain;
- 60 item alias/reference gaps remain;
- opening aluminum Stock has no populated actual-Kg evidence;
- stock source scope differs from the process specification and has two future-dated `VIPST700` rows;
- complete opening AR/AP at the common cutoff is not proven;
- 45 journal rows need a deterministic integer-VND rounding rule;
- work-center/BOM/employee/pilot-user inputs remain incomplete;
- exactly one active named `Giám đốc` account is still required.

## Next execution order

1. apply the locked identity normalizer to the private batch;
2. resolve canonical item aliases and remaining supplier party roles;
3. freeze one coherent source cutoff and matching opening snapshots;
4. close Stock quantity/value evidence and stock-source anomalies;
5. lock VND conversion/rounding and remaining operating/access masters;
6. generate the private Mapping-V1 batch and run `validate-pilot-batch.mjs` until real zero-variance `PREVIEW_PASS`.

## Production boundary

No Pilot-01 production import/write has occurred. `PREVIEW_PASS` still does not authorize real customer/master/opening-data import/write. Production import, cutover, DNS/route/secret/provider mutation, restore/PITR and destructive state operations remain explicit authorization boundaries.

## Read order

1. exact GitHub `main` + relevant PR/branch;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `docs/pilot/alumdoor/README.md`;
5. `docs/pilot/alumdoor/PILOT_01_IDENTITY_DISPOSITION_V1.json`;
6. `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
7. `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.md`;
8. `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
9. `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`.
