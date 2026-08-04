# CURRENT STATUS

Ngày cập nhật: **2026-08-05**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, workflow run, merge và production evidence. File này chỉ giữ **live verified state**, không giữ lịch sử dài.

## 1. Repository checkpoint

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Product baseline: **Forge 0.2.0 — Enterprise Parallel Baseline**.
- RC4 integrated closure: **DONE**.
- R5 integrated hardening/productization: **DONE / R5-GO** via PR `#638`.
- R6 Production Certification: **DONE / PILOT-GO**.
- Pilot-00 Freeze Production Profile + Pilot Contract: **DONE / PILOT-00-LOCKED**.
- Exact R6 certified/deployed source SHA and frozen initial pilot software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Canonical full production deploy run: `30952411424` — **SUCCESS**.
- Final post-release certification run: `30952703083` — **SUCCESS**.
- Final machine evidence: `deploy-evidence/r6-final-production-certification-49315112a211.json`.
- Pilot-00 authority: `docs/pilot/alumdoor/PILOT_00_CONTRACT.md` and `docs/pilot/alumdoor/PILOT_00_LOCK.json`.

Evidence/docs commits after the certified SHA may advance `main`; they do not change the exact deployed product identity. Any later product-source change requires new affected release evidence before it can replace the frozen pilot baseline.

## 2. Capability truth

Canonical denominator remains exactly **956 capabilities** unless a later convergence record explicitly materializes a new maturity distribution.

Latest accepted materialized distribution remains:

| Maturity | Count |
|---|---:|
| Hardened | 0 |
| RC | 66 |
| Wired | 406 |
| Foundation | 327 |
| Missing | 157 |
| **Total** | **956** |

R6/Pilot-00 do not reopen a blanket capability-promotion wave. Pilot-critical acceptance is governed by exact package/profile/runtime/domain evidence instead.

## 3. R6 final certification truth

The exact candidate `49315112a21182d2ce077b08a1fb9e26db07fd36` is certified **PILOT-GO** for the ALU Alumdoor controlled pilot.

Verified identity:

- release SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`;
- UI bundle hash: `838218167db020d8`;
- Alumdoor: `2.2.3`;
- HRM: `1.8.0`;
- VN Accounting: `1.6.1`;
- active capability profile: `alumdoor-pilot@1`;
- profile content hash: `3e3124018aa3c7d233f0af8b81f751cd3e4a8329b94a2c9295956bc58ac8f7f8`;
- profile valid: `true`;
- blocked capabilities: none.

Final R6 evidence:

- matrix: **23/23 PASS** (`R6-E01..R6-E23`);
- migration inventory: **80 expected / 80 applied / 0 pending / 0 unknown**;
- fresh production backup/replay: PASS;
- disposable remote D1 restore and source/restored reconciliation: PASS;
- PITR read-only plan: PASS;
- auth/session/CSRF/tenant-isolation: PASS;
- provider/bindings/observability: PASS;
- exact release health/guest boundary: PASS;
- authenticated Golden Flow + Stock/Finance readback + correction/idempotency/warranty lineage: PASS;
- bounded live pressure: 50 requests, concurrency 5, 0 errors, p50 21.84 ms, p95 78.08 ms, p99 97.82 ms, 141.85 RPS.

No unresolved R6 blocker remains in controlled-pilot scope.

## 4. Pilot-00 locked truth

Pilot-00 has frozen the governance/data-readiness contract before any real opening/master data write.

Locked scope:

- target: tenant `alu` only at `https://alu.kairo.vn`;
- software/package/profile identity: exact R6-certified identity above;
- pilot personas: `Giám đốc`, `Chủ xưởng`, `Kinh doanh`, `Thủ kho`, `Kế toán`, `Sản xuất`;
- business cutover authority: one named account holding `Giám đốc` role, to be bound before Pilot-04;
- named-account allowlist required before Pilot-02;
- permitted transaction families limited to canonical Sales/CRM, Procurement, Stock, Manufacturing/Alumdoor, Finance and Warranty/Service paths;
- frozen source cutoff/extract manifest rules;
- frozen master/opening mapping contract V1;
- reconciliation default: **zero unexplained variance**;
- direct D1/ledger writes and vertical shadow ledgers prohibited;
- product-source changes create a new candidate and require affected release evidence rerun;
- code rollback does not imply data rollback; destructive restore/PITR remains a separate operation.

Pilot-00 performed **no real customer/master/opening-data production mutation**.

## 5. Active phase — Pilot-01

Active work is now **Master + Opening Data Readiness** using:

- `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`;
- `docs/pilot/alumdoor/PILOT_00_LOCK.json`;
- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`.

Pilot-01 must create an immutable source batch manifest, deterministic mappings, duplicate/reference checks, tenant-scope checks and preview reconciliations for customer/contact, supplier, item/BOM/work-center, warehouse/opening stock, AR/AP, optional cash-bank, employee and named pilot-user datasets.

Real production import/write is a later explicit operation, not implied by Pilot-00 closure.

## 6. Current architecture authorities

- Document/business writes: canonical Document Kernel / Durable Object path.
- Tenant/query store: D1 under repository migration governance.
- Money authority: canonical GL + Payment Ledger contracts; no shadow finance ledger.
- Stock authority: canonical Stock Ledger/valuation contracts; no vertical stock ledger fork.
- Permission: server-side tenant/role/DocPerm/owner/share/user-permission enforcement.
- App lifecycle: App Registry / App Factory install/upgrade contracts.
- Capability activation: versioned server-authoritative profile; disable != uninstall/data purge.
- Frontend: shared metadata-driven MetaForge runtime; verticals do not fork shared runtime.
- Alumdoor: reference vertical consuming generic Finance/CRM/Procurement/Stock/Manufacturing/HCM/Service authorities.

## 7. Active sequence

`RC4 DONE -> R5 DONE -> R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 Data Readiness -> Pilot-02 Dry Run -> Pilot-03 Parallel Run -> Pilot-04 Cutover Decision -> Pilot-05 Hypercare/Exit -> Accepted Production Reference -> GA`

The active queue is `NEXT_TASKS.md`.

## 8. Standing boundaries

- Controlled pilot is not GA.
- Real customer/master/opening-data import or mutation remains an explicit authorization boundary.
- Production cutover, restore/PITR, DNS/route/secret/provider mutation and destructive queue/state operations remain explicit authorization boundaries.
- Pilot cutover requires accepted reconciliation plus explicit `Giám đốc` business acceptance.
- Worker rollback does not imply D1/KV/R2/external-state rollback.
- Source/config presence does not equal observed provider state.
- Future source/package/profile changes invalidate affected exact-identity claims until required evidence reruns.

## 9. Documentation authority

Start at `docs/README.md`, then `docs/pilot/alumdoor/README.md` and `NEXT_TASKS.md` for the controlled-pilot queue. R6 final evidence remains historical entry authority for the frozen pilot baseline.
