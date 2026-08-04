# CURRENT STATUS

Ngày cập nhật: **2026-08-05**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, workflow run, merge và production evidence. File này chỉ giữ **live verified state**, không giữ lịch sử dài.

## 1. Repository checkpoint

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Product baseline: **Forge 0.2.0 — Enterprise Parallel Baseline**.
- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6 Production Certification: **DONE / PILOT-GO**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 preview/control-plane: **READY**.
- Pilot-01 real uploaded source set: **OBSERVED / HASHED / INGESTED**.
- Pilot-01 duplicate identity disposition: **LOCKED**.
- Pilot-01 journal item identity reconciliation: **60/60 DISPOSITIONED**.
- Pilot-01 supplier-role reconciliation: **DONE / 4 -> 0 ROLE GAPS**.
- Pilot-01 current verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED** pending cutoff, quantity/UOM and opening-data evidence.
- Exact R6 certified/deployed source SHA and frozen pilot software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Canonical full production deploy run: `30952411424` — **SUCCESS**.
- Final post-release certification run: `30952703083` — **SUCCESS**.
- Final machine evidence: `deploy-evidence/r6-final-production-certification-49315112a211.json`.

Evidence/docs/control-plane commits after the certified SHA may advance `main`; they do not change the exact deployed product identity. Product-runtime/source changes require new affected release evidence before replacing the frozen pilot baseline.

## 2. Capability truth

Canonical denominator remains exactly **956 capabilities** unless a later convergence record explicitly materializes a new maturity distribution.

| Maturity | Count |
|---|---:|
| Hardened | 0 |
| RC | 66 |
| Wired | 406 |
| Foundation | 327 |
| Missing | 157 |
| **Total** | **956** |

R6/Pilot-00/Pilot-01 do not reopen a blanket capability-promotion wave. Pilot acceptance is governed by exact package/profile/runtime/domain/data evidence.

## 3. R6 final certification truth

Candidate `49315112a21182d2ce077b08a1fb9e26db07fd36` is certified **PILOT-GO** for tenant `alu`.

Verified identity:

- release SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`;
- UI bundle hash: `838218167db020d8`;
- Alumdoor `2.2.3`, HRM `1.8.0`, VN Accounting `1.6.1`;
- capability profile `alumdoor-pilot@1`, valid, no blocked capabilities;
- R6 matrix **23/23 PASS**;
- migrations **80/80**, recovery/security/provider/Golden Flow/pressure evidence PASS.

No unresolved R6 blocker remains in controlled-pilot scope.

## 4. Pilot-00 locked truth

Pilot-00 froze the exact product/package/profile, tenant, personas, business approval role, source cutoff/extract contract, mapping V1, reconciliation rules and production boundaries before any real opening/master data write.

Pilot-00 performed **no real customer/master/opening-data production mutation**.

## 5. Pilot-01 current truth

The operator-provided uploads are the real Pilot-01 source evidence. Raw workbooks remain outside Git; Git stores immutable digests, structural evidence and reconciliation decisions.

Observed coverage:

- item master: **277 rows / 277 unique item codes**;
- customer source: **258 rows / 256 exact names**;
- supplier master: **8 typed NCC**;
- operating journal: **730 typed rows**;
- purchase reference: `TIẾN ĐẠT` / `84,883,448 VND` / `0% received`;
- customer order/history: **11 sheets**;
- aluminum stock: **21 total / 18 inventory sheets / 1,506 source lot rows**;
- source status replay: **1,152 available rows / 41,137 pieces-leaves**;
- actual populated opening aluminum Kg cells: **0**.

### Duplicate identity disposition

- duplicate Customer names -> retain first canonical row, remap references;
- exact duplicate Item codes -> retain first, later collisions get lowest free `01`, `02`, `03`... suffix with lineage preserved;
- uploaded item master remains **277/277 unique**, so no master code is currently changed by suffixing.

### Journal item identity reconciliation

The original **60** journal item strings absent from the 277-code master are no longer an unresolved identity gap:

- **41** source-backed aliases -> existing canonical Item identities;
- **18** supplemental source identities -> kept explicit, not fuzzily merged;
- **1** composite `NVL-LD-3LD` -> canonical atomic items `TP-TD325`, `TP-TD326`, `TP-TD327`, `TP-A282`.

No fuzzy matching is used and the duplicate-suffix policy is not abused to fabricate these identities.

Identity is closed, but quantity/UOM semantics are still open for the 18 supplemental identities and for three identity-only aliases whose source axes differ from canonical axes:

- `NVL-TOLE1.2x190-CORON`;
- `NVL-TON-DL7.2Dx124-XNXLC`;
- `NVL-TRUC114_2.4LY`.

### Supplier reconciliation

Eight distinct purchase parties were observed. Four already had source NCC typing; four role gaps are now dispositioned:

- `TIẾN ĐẠT` -> bind existing canonical Supplier;
- `ANH HIẾU CẦN THƠ` -> ensure Supplier under the same exact name while preserving Customer dual-role identity;
- `PHÁT AN KHANG` -> ensure Supplier from exact purchase-party identity;
- `VIỆT ĐÔNG HƯNG` -> ensure Supplier from exact purchase-party identity.

Supplier role gaps are **4 -> 0**; normalized Supplier population would be **12** if materialized. No fuzzy party merge is used.

### Remaining blockers

1. no proven single common cutoff across Stock + AR/AP + cash/bank;
2. quantity/UOM semantics for supplemental/axis-sensitive source identities are not yet accepted;
3. aluminum opening Stock has no populated actual-Kg evidence;
4. process source expects 23 aluminum + 2 mesh sheets while observed stock workbook has 21 total / 18 inventory sheets;
5. two `VIPST700` rows have future source date `23/12/2026`;
6. complete opening AR/AP at the common cutoff is not proven;
7. 45 journal rows require deterministic integer-VND rounding;
8. work-center/BOM/employee/pilot-user inputs remain incomplete;
9. exactly one active named `Giám đốc` pilot account remains required.

`30/06/2026` is a **cutoff candidate**, not yet a frozen cutoff, because cash/bank has a snapshot hint at that date but Stock/AR/AP still need proof at the same point.

Pilot-01 remains **PREVIEW BLOCKED**. No real production import/write has occurred.

## 6. Current architecture authorities

- Document/business writes: canonical Document Kernel / Durable Object path.
- Tenant/query store: D1 under repository migration governance.
- Money authority: canonical GL + Payment Ledger; no shadow finance ledger.
- Stock authority: canonical Stock Ledger/valuation; no vertical stock ledger fork.
- Permission: server-side tenant/role/DocPerm/owner/share/user-permission enforcement.
- App lifecycle: App Registry / App Factory contracts.
- Capability activation: versioned server-authoritative profile.
- Frontend: shared metadata-driven MetaForge runtime.
- Alumdoor: reference vertical consuming generic Finance/CRM/Procurement/Stock/Manufacturing/HCM/Service authorities.

## 7. Active sequence

`RC4 DONE -> R5 DONE -> R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 SOURCE INGESTED -> duplicate identity LOCKED -> item identity 60/60 + supplier roles DONE -> cutoff/UOM/opening reconciliation -> real PREVIEW_PASS -> Pilot-02 Dry Run -> Pilot-03 Parallel Run -> Pilot-04 Cutover Decision -> Pilot-05 Hypercare/Exit -> Accepted Production Reference -> GA`

The active queue is `NEXT_TASKS.md`.

## 8. Standing boundaries

- Controlled pilot is not GA.
- `PREVIEW_PASS` is not production-write authorization.
- Real customer/master/opening-data import or mutation remains an explicit authorization boundary.
- Production cutover, restore/PITR, DNS/route/secret/provider mutation and destructive state operations remain explicit authorization boundaries.
- Pilot cutover requires accepted reconciliation and explicit `Giám đốc` business acceptance.
- Worker rollback does not imply data rollback.
- Future product-source/package/profile changes invalidate affected exact-identity claims until evidence reruns.

## 9. Documentation authority

Start at `docs/README.md`, then:

- `docs/pilot/alumdoor/README.md`;
- `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- `docs/pilot/alumdoor/PILOT_01_IDENTITY_DISPOSITION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`;
- `NEXT_TASKS.md`.
