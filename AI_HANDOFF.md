# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Đây là handoff ngắn cho phiên tiếp theo. Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo: `nguyentrieu210/forge`.
- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6: **DONE / PILOT-GO**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 control plane: **READY / PREVIEW-ONLY**.
- real uploaded source set: **OBSERVED / HASHED / INGESTED**.
- duplicate identity policy: **LOCKED**.
- journal item identity reconciliation: **60/60 DISPOSITIONED** = 41 canonical aliases + 18 supplemental source identities + 1 composite explosion.
- supplier purchase-party reconciliation: **DONE / role gaps 4 -> 0**.
- truthful Pilot-01 verdict: `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`.
- Exact frozen pilot software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** unless a newer materialized convergence record changes it.

## Latest identity decisions

Duplicate policy:

- duplicate Customer names -> retain first canonical source row and remap references;
- exact duplicate item codes -> retain first, suffix later exact collisions with lowest free `01`, `02`, `03`... and preserve lineage.

The separate 60 journal strings are now identity-dispositioned, not suffixed blindly:

- 41 map to explicit existing canonical Items;
- 18 remain source-only supplemental stock/component/service identities;
- `NVL-LD-3LD` explodes to `TP-TD325`, `TP-TD326`, `TP-TD327`, `TP-A282`.

No fuzzy item matching is allowed. Quantity/UOM semantics are still open for the 18 supplemental identities and for three identity-only aliases: `NVL-TOLE1.2x190-CORON`, `NVL-TON-DL7.2Dx124-XNXLC`, `NVL-TRUC114_2.4LY`.

Supplier role gaps are closed without fuzzy party merges:

- `TIẾN ĐẠT` binds canonical Supplier;
- `ANH HIẾU CẦN THƠ` becomes/ensures Supplier while retaining Customer dual role;
- `PHÁT AN KHANG` and `VIỆT ĐÔNG HƯNG` become exact Supplier identities.

## Remaining blockers to PREVIEW_PASS

1. one coherent Stock/AR/AP/cash-bank cutoff is not frozen; `30/06/2026` is only a candidate;
2. supplemental/axis-sensitive quantity and UOM semantics are not accepted;
3. opening aluminum Stock has no populated actual-Kg evidence;
4. stock workbook scope differs from process specification and has two `VIPST700` future dates;
5. opening AR/AP at the same cutoff is not proven;
6. 45 journal rows need deterministic integer-VND rounding;
7. work-center/BOM/employee/pilot-user inputs remain incomplete;
8. exactly one active named `Giám đốc` account remains required.

## Next execution order

1. test `30/06/2026` as a coherent cutoff candidate against Stock + AR/AP + cash/bank; freeze only if evidenced;
2. reconcile quantity/UOM semantics for supplemental and axis-sensitive item identities;
3. produce source-authoritative opening Stock/AR/AP/cash-bank evidence at the frozen cutoff;
4. resolve stock source anomalies and VND rounding;
5. complete minimum operating/access masters;
6. generate private Mapping-V1 batch and run validator to real zero-variance `PREVIEW_PASS`.

## Production boundary

No Pilot-01 production import/write has occurred. `PREVIEW_PASS` still does not authorize real customer/master/opening-data import/write. Production import, cutover, DNS/route/secret/provider mutation, restore/PITR and destructive state operations remain explicit authorization boundaries.

## Read order

1. exact GitHub `main` + relevant PR/branch;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `docs/pilot/alumdoor/README.md`;
5. `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
6. `docs/pilot/alumdoor/PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`;
7. `docs/pilot/alumdoor/PILOT_01_IDENTITY_DISPOSITION_V1.json`;
8. `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`;
9. `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
10. `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`.
