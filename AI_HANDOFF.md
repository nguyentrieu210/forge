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
- Pilot-01 real source batch: **WAITING APPROVED SOURCE DATA**.
- Current truthful Pilot-01 verdict: `PILOT-01-WAITING-SOURCE-BATCH`.
- Exact frozen pilot software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Release bundle: `838218167db020d8`.
- Packages: Alumdoor `2.2.3`, HRM `1.8.0`, VN Accounting `1.6.1`.
- Active profile: `alumdoor-pilot@1`, valid, no blocked capabilities.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** unless a newer materialized convergence record changes it.

Pilot authorities:

- `docs/pilot/alumdoor/README.md`;
- `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`;
- `docs/pilot/alumdoor/PILOT_00_LOCK.json`;
- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_READINESS.md`;
- `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- `docs/pilot/alumdoor/PILOT_01_BATCH_MANIFEST_TEMPLATE.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_BATCH_REQUIREMENTS.md`.

## What is next

Active phase remains **Pilot-01 — Master + Opening Data Readiness**.

The validation/control-plane work is complete. The next missing input is a real approved immutable source batch normalized to mapping V1 in a secure directory outside Git.

The batch must include:

1. customers/contacts;
2. suppliers;
3. items/BOM/work centers;
4. warehouses/opening stock;
5. AR/AP openings;
6. cash/bank only when explicitly scoped in;
7. employees;
8. named pilot user/role allowlist.

Use one file per dataset, SHA-256-bound in `manifest.json`. Empty approved datasets must be explicit `[]`, not omitted.

Preview command:

```bash
node docs/pilot/alumdoor/tools/validate-pilot-batch.mjs \
  --batch-dir /approved/secure/alu-pilot-batch \
  --output /approved/evidence/alu-pilot-01-preview.json
```

Only a real `PREVIEW_PASS` with zero unexplained variance can advance Pilot-01 to READY.

## Validator invariants

- required datasets/fields are fail-closed;
- source keys, item codes and pilot accounts cannot conflict;
- SHA-256 and row counts must match exact files;
- unknown Customer/Supplier/Item/Warehouse/Employee references fail closed;
- opening money uses integer minor-unit semantics;
- opening stock qty/rate cannot be invalid or negative;
- Stock/AR/AP/cash-bank source totals must exactly match mapped totals;
- exactly one active named `Giám đốc` account is required;
- `PREVIEW_PASS` never authorizes production write.

## Production boundary

No Pilot-01 real production import/write has occurred.

Real customer/master/opening-data import/write, production cutover, DNS/route/secret/provider mutation, production restore/PITR and destructive state operations remain explicit authorization boundaries.

Do not fabricate a batch from package fixtures, demo records or R6 Golden Flow data. Those are not real opening-data evidence.

## Read order

1. exact GitHub `main` + relevant PR/branch;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `docs/pilot/alumdoor/README.md`;
5. `docs/pilot/alumdoor/PILOT_01_READINESS.md`;
6. `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
7. `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
8. `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md` for certified entry provenance;
9. `PROJECT_CONTEXT.md` and architecture/domain contracts as needed.
