# CURRENT STATUS

Ngày cập nhật: **2026-08-05**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, workflow run, merge và production evidence. File này chỉ giữ **live verified state**, không giữ lịch sử dài.

## 1. Repository checkpoint

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Product baseline: **Forge 0.2.0 — Enterprise Parallel Baseline**.
- Product brand/positioning authority: **Forge — Enterprise Operating Platform**; naming rules ở `docs/BRAND_AND_NAMING.md`.
- North Star repository/docs rebaseline audit: `docs/FORGE_REPOSITORY_NORTH_STAR_AUDIT_20260805.md`.
- RC4 integrated closure: **DONE**.
- R5 integrated hardening/productization: **DONE / R5-GO** via PR `#638`.
- R6 Production Certification: **DONE / PILOT-GO**.
- Pilot-00 Freeze Production Profile + Pilot Contract: **DONE / PILOT-00-LOCKED**.
- Pilot-01 preview/control-plane: **READY**.
- Pilot-01 real uploaded source set: **OBSERVED / HASHED / INGESTED**.
- Pilot-01 current verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED** pending reconciliation/normalization.
- Exact R6 certified/deployed source SHA and frozen initial pilot software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Canonical full production deploy run: `30952411424` — **SUCCESS**.
- Final post-release certification run: `30952703083` — **SUCCESS**.
- Final machine evidence: `deploy-evidence/r6-final-production-certification-49315112a211.json`.
- Pilot-00 authority: `docs/pilot/alumdoor/PILOT_00_CONTRACT.md` and `docs/pilot/alumdoor/PILOT_00_LOCK.json`.
- Pilot-01 authority: `docs/pilot/alumdoor/PILOT_01_STATUS.json`, `PILOT_01_SOURCE_INGEST_20260805.json` and `PILOT_01_SOURCE_INGEST_20260805.md`.

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

Final R6 evidence remains **23/23 PASS**, migrations **80/80**, recovery/security/provider/Golden Flow/pressure evidence PASS. No unresolved R6 blocker remains in controlled-pilot scope.

## 4. Pilot-00 locked truth

Pilot-00 froze the governance/data-readiness contract before any real opening/master data write.

Locked scope:

- target: tenant `alu` only at `https://alu.kairo.vn`;
- software/package/profile identity: exact R6-certified identity above;
- pilot personas: `Giám đốc`, `Chủ xưởng`, `Kinh doanh`, `Thủ kho`, `Kế toán`, `Sản xuất`;
- business cutover authority: one named account holding `Giám đốc` role;
- named-account allowlist required before Pilot-02;
- canonical Sales/Procurement/Stock/Manufacturing/Finance/Warranty authorities only;
- frozen source cutoff/extract and mapping V1 rules;
- reconciliation default: **zero unexplained variance**;
- direct D1/ledger writes and vertical shadow ledgers prohibited.

Pilot-00 performed **no real customer/master/opening-data production mutation**.

## 5. Pilot-01 current truth

Pilot-01 no longer waits for source acquisition. The operator-provided uploads have been ingested as immutable source evidence without committing raw customer workbooks to Git.

Observed real-source coverage:

- item master: **277 rows / 277 unique item codes**;
- customer source: **258 rows / 256 exact names**;
- supplier master: **8 typed NCC rows**;
- operating journal: **730 typed rows** (515 sales, 178 receipts, 14 purchases, 6 supplier returns, 16 other expenses, 1 transfer);
- purchase-order reference: **TIẾN ĐẠT / 84,883,448 VND / 0% received**;
- customer order/history reference: **11 sheets**;
- aluminum stock source: **21 total sheets / 18 inventory sheets / 1,506 source lot rows**.

The stock workbook's own status formula can classify blank statuses from length/piece count. Replaying only that source formula yields **1,152 available lot rows / 41,137 pieces-leaves**. This is physical evidence, not canonical opening Stock quantity.

Current blockers are evidence-specific:

1. no proven single common cutoff across Stock + AR/AP + cash/bank;
2. two duplicate customer identities need disposition;
3. supplier-role and party-alias gaps remain after preserving canonical TIẾN ĐẠT;
4. 60 journal item codes do not exact-match the uploaded item export and require canonical alias reconciliation;
5. aluminum source contains **zero populated actual-Kg cells** while canonical `Nhôm cây/lá` Stock UOM is Kg; theoretical kg/m must not be promoted to measured quantity;
6. process source expects 23 aluminum + 2 mesh sheets, while observed aluminum workbook has 21 total / 18 inventory sheets and no separate mesh source in the set;
7. two `VIPST700` rows have future source date `23/12/2026`;
8. observed activity cannot safely reconstruct opening AR/AP;
9. 45 typed journal rows contain fractional `Tổng thanh toán` and require a deterministic integer-VND rule;
10. complete work-center/BOM/employee/pilot-user data is not migration-ready.

Therefore Pilot-01 is **SOURCE INGESTED but PREVIEW BLOCKED**, not `WAITING-SOURCE-BATCH` and not READY.

No Pilot-01 production import/write has occurred.

## 6. Current architecture authorities

- Document/business writes: canonical Document Kernel / Durable Object path.
- Tenant/query store: D1 under repository migration governance.
- Money authority: canonical GL + Payment Ledger contracts; no shadow finance ledger.
- Stock authority: canonical Stock Ledger/valuation contracts; no vertical stock ledger fork.
- Permission: server-side tenant/role/DocPerm/owner/share/user-permission enforcement.
- App lifecycle: App Registry / App Factory install/upgrade contracts.
- Capability activation: versioned server-authoritative profile; disable != uninstall/data purge.
- Frontend: shared metadata-driven **Forge runtime**; existing `@metaforge/*` names are technical namespaces, not a separate product brand.
- Alumdoor: reference vertical consuming generic Finance/CRM/Procurement/Stock/Manufacturing/HCM/Service authorities.

## 7. Active sequence

`RC4 DONE -> R5 DONE -> R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 SOURCE INGESTED -> reconcile/normalize -> real PREVIEW_PASS -> Pilot-02 Dry Run -> Pilot-03 Parallel Run -> Pilot-04 Cutover Decision -> Pilot-05 Hypercare/Exit -> Accepted Production Reference -> GA`

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

Start at `docs/README.md`, then `docs/pilot/alumdoor/README.md`, `PILOT_01_SOURCE_INGEST_20260805.md` and `NEXT_TASKS.md`. Product naming is governed by `docs/BRAND_AND_NAMING.md`; the repository rebaseline record is `docs/FORGE_REPOSITORY_NORTH_STAR_AUDIT_20260805.md`. R6 final evidence remains historical entry authority for the frozen pilot baseline.
