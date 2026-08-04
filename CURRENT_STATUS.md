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
- Pilot-01 preview/control-plane: **READY**.
- Pilot-01 real immutable source batch: **NOT YET AVAILABLE / PILOT-01-WAITING-SOURCE-BATCH**.
- Exact R6 certified/deployed source SHA and frozen initial pilot software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Canonical full production deploy run: `30952411424` — **SUCCESS**.
- Final post-release certification run: `30952703083` — **SUCCESS**.
- Final machine evidence: `deploy-evidence/r6-final-production-certification-49315112a211.json`.
- Pilot-00 authority: `docs/pilot/alumdoor/PILOT_00_CONTRACT.md` and `docs/pilot/alumdoor/PILOT_00_LOCK.json`.
- Pilot-01 authority: `docs/pilot/alumdoor/PILOT_01_READINESS.md` and `docs/pilot/alumdoor/PILOT_01_STATUS.json`.

Evidence/docs/control-plane commits after the certified SHA may advance `main`; they do not change the exact deployed product identity. Any later product-runtime/source change requires new affected release evidence before it can replace the frozen pilot baseline.

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

R6/Pilot-00/Pilot-01 do not reopen a blanket capability-promotion wave. Pilot-critical acceptance is governed by exact package/profile/runtime/domain/data evidence instead.

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

Pilot-00 froze the governance/data-readiness contract before any real opening/master data write.

Locked scope:

- target: tenant `alu` only at `https://alu.kairo.vn`;
- software/package/profile identity: exact R6-certified identity above;
- pilot personas: `Giám đốc`, `Chủ xưởng`, `Kinh doanh`, `Thủ kho`, `Kế toán`, `Sản xuất`;
- business cutover authority: one named account holding `Giám đốc` role;
- named-account allowlist required before Pilot-02;
- permitted transaction families limited to canonical Sales/CRM, Procurement, Stock, Manufacturing/Alumdoor, Finance and Warranty/Service paths;
- frozen source cutoff/extract manifest rules;
- frozen master/opening mapping contract V1;
- reconciliation default: **zero unexplained variance**;
- direct D1/ledger writes and vertical shadow ledgers prohibited;
- product-source changes create a new candidate and require affected release evidence rerun;
- code rollback does not imply data rollback; destructive restore/PITR remains a separate operation.

Pilot-00 performed **no real customer/master/opening-data production mutation**.

## 5. Pilot-01 current truth

Pilot-01 now has a complete preview-only source intake/control plane:

- frozen mapping: `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
- immutable manifest template: `docs/pilot/alumdoor/PILOT_01_BATCH_MANIFEST_TEMPLATE.json`;
- preview validator: `docs/pilot/alumdoor/tools/validate-pilot-batch.mjs`;
- fail-closed tests: `docs/pilot/alumdoor/tools/validate-pilot-batch.test.mjs`;
- identity verifier: `docs/pilot/alumdoor/tools/verify-pilot-01-contract.mjs`;
- CI: `.github/workflows/pilot-01-data-readiness.yml`;
- source handoff checklist: `docs/pilot/alumdoor/PILOT_01_SOURCE_BATCH_REQUIREMENTS.md`.

The validator enforces:

- immutable SHA-256/file identity and exact row counts;
- required datasets/fields;
- duplicate source-key/item/account refusal;
- unknown Customer/Supplier/Item/Warehouse/Employee reference refusal;
- frozen Pilot-00 personas;
- exactly one active named `Giám đốc` account;
- integer money semantics;
- non-negative opening stock quantity/rate;
- exact Stock/AR/AP/cash-bank opening source-total reconciliation;
- zero unexplained variance;
- `production_write_authorized=false` and `production_data_mutated=false`.

Current missing input is a **real approved immutable source batch**. Package fixtures, demo records and R6 Golden Flow data are not accepted as real opening/customer migration evidence.

Pilot-01 therefore remains `PILOT-01-WAITING-SOURCE-BATCH`, not READY.

No Pilot-01 real production import/write has occurred.

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

`RC4 DONE -> R5 DONE -> R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 WAITING SOURCE BATCH -> real PREVIEW_PASS -> Pilot-02 Dry Run -> Pilot-03 Parallel Run -> Pilot-04 Cutover Decision -> Pilot-05 Hypercare/Exit -> Accepted Production Reference -> GA`

The active queue is `NEXT_TASKS.md`.

## 8. Standing boundaries

- Controlled pilot is not GA.
- A Pilot-01 preview PASS is not production-write authorization.
- Real customer/master/opening-data import or mutation remains an explicit authorization boundary.
- Production cutover, restore/PITR, DNS/route/secret/provider mutation and destructive queue/state operations remain explicit authorization boundaries.
- Pilot cutover requires accepted reconciliation plus explicit `Giám đốc` business acceptance.
- Worker rollback does not imply D1/KV/R2/external-state rollback.
- Source/config presence does not equal observed provider state.
- Future product-source/package/profile changes invalidate affected exact-identity claims until required evidence reruns.

## 9. Documentation authority

Start at `docs/README.md`, then `docs/pilot/alumdoor/README.md` and `NEXT_TASKS.md` for the controlled-pilot queue. R6 final evidence remains historical entry authority for the frozen pilot baseline.
