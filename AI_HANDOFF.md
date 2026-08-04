# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Đây là handoff ngắn cho phiên tiếp theo. Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo: `nguyentrieu210/forge`.
- RC4: **DONE**.
- R5: **DONE / R5-GO** via PR `#638`.
- R6 Production Certification: **DONE / PILOT-GO**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Exact frozen pilot software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Release bundle: `838218167db020d8`.
- Packages: Alumdoor `2.2.3`, HRM `1.8.0`, VN Accounting `1.6.1`.
- Active profile: `alumdoor-pilot@1`, valid, no blocked capabilities.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** unless a newer materialized convergence record changes it.

Pilot-00 authorities:

- `docs/pilot/alumdoor/README.md`;
- `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`;
- `docs/pilot/alumdoor/PILOT_00_LOCK.json`;
- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`.

## What is next

Active phase: **Pilot-01 — Master + Opening Data Readiness**.

Use the frozen mapping V1. Build one immutable batch manifest with explicit cutoff/extract timestamps, SHA-256 per source file, row counts/totals and source provenance. Preview and reconcile before any production write.

Datasets in scope:

1. customers/contacts;
2. suppliers;
3. items/BOM/routing/work centers where applicable;
4. warehouses/opening stock;
5. AR/AP openings;
6. cash/bank only if explicitly included;
7. employees;
8. named pilot user/role allowlist.

Pilot personas are frozen as `Giám đốc`, `Chủ xưởng`, `Kinh doanh`, `Thủ kho`, `Kế toán`, `Sản xuất`. One named account holding `Giám đốc` authority must exist before Pilot-04. Named account allowlist must exist before Pilot-02.

## Pilot invariants

- Reconciliation tolerance is zero unexplained variance.
- Compare like-for-like quantity axes only; do not synthesize measured evidence.
- All money remains canonical integer minor-unit semantics.
- Direct D1/ledger writes are prohibited as normal import/correction paths.
- Vertical apps consume shared Stock/Finance/HRM/CRM authorities; no shadow ledgers.
- A source-code change creates a new candidate and requires affected release evidence rerun.
- A package/profile change requires pilot identity re-lock and affected runtime/Golden Flow evidence rerun.
- Code rollback does not imply data rollback.

## Production boundary

Pilot-00 made no real customer/master/opening-data production write.

Real data import/write, production cutover, DNS/route/secret/provider mutation, production restore/PITR and destructive state operations remain explicit authorization boundaries. Exhaust source inspection, mapping, duplicate/reference validation and dry-run reconciliation before reaching that boundary.

## Read order

1. exact GitHub `main` + relevant PR/branch;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `docs/pilot/alumdoor/README.md`;
5. `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`;
6. `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
7. `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md` for certified entry provenance;
8. `PROJECT_CONTEXT.md` and architecture/domain contracts as needed.
