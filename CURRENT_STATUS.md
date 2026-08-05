# CURRENT STATUS

Ngày cập nhật: **2026-08-05**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, workflow run, merge và production evidence. File này giữ live verified state.

## 1. Repository checkpoint

- Repository: `nguyentrieu210/forge`.
- Product baseline: **Forge 0.2.0 — Enterprise Parallel Baseline**.
- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6 Production Certification: **DONE / PILOT-GO**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 source set: **OBSERVED / HASHED / INGESTED**.
- Duplicate identity policy: **LOCKED**.
- Journal item identity reconciliation: **60/60 DISPOSITIONED**.
- Supplier role reconciliation: **DONE / 4 -> 0 gaps**.
- UOM/quantity reconciliation: **21 reviewed / 19 resolved-or-classified / 2 fail-closed**.
- Candidate cutoff `30/06/2026`: **NOT PROVEN / NOT FROZEN**.
- Pilot-01 verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED**.
- Exact R6 certified/deployed source SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Canonical full deploy run `30952411424`: **SUCCESS**.
- Final post-release certification run `30952703083`: **SUCCESS**.
- Final R6 evidence: `deploy-evidence/r6-final-production-certification-49315112a211.json` — **23/23 PASS**.

Documentation/control-plane commits may advance `main` without changing deployed product identity. Product-runtime/source changes require affected release evidence rerun.

## 2. Capability truth

Canonical denominator remains exactly **956** unless a newer convergence record materializes a different distribution.

| Maturity | Count |
|---|---:|
| Hardened | 0 |
| RC | 66 |
| Wired | 406 |
| Foundation | 327 |
| Missing | 157 |
| **Total** | **956** |

Pilot work does not itself reclassify the global capability denominator.

## 3. R6 certified identity

- release SHA `49315112a21182d2ce077b08a1fb9e26db07fd36`;
- UI bundle `838218167db020d8`;
- Alumdoor `2.2.3`;
- HRM `1.8.0`;
- VN Accounting `1.6.1`;
- capability profile `alumdoor-pilot@1`, valid, no blocked capabilities;
- migrations **80/80**;
- recovery/security/provider/Golden Flow/pressure evidence PASS.

No unresolved R6 blocker remains in controlled-pilot scope.

## 4. Pilot-00 locked truth

Pilot-00 froze tenant `alu`, exact software/package/profile, pilot personas, `Giám đốc` cutover role, Mapping V1, source manifest/cutoff rules, zero-unexplained-variance reconciliation and production boundaries before real opening/master data writes.

Pilot-00 performed **no real production data mutation**.

## 5. Pilot-01 source and identity truth

Observed source coverage includes:

- item master: **277 rows / 277 unique codes**;
- customer source: **258 rows / 256 exact names**;
- supplier master: **8 typed NCC**;
- operating journal: **730 typed business rows** in the source-ingest pass;
- purchase-order reference: `TIẾN ĐẠT / 84,883,448 VND / 0% received`;
- customer order/history: **11 sheets**;
- aluminum stock: **21 total / 18 inventory sheets / 1,506 physical rows**;
- source-status replay: **1,152 available rows / 41,137 pieces-leaves**.

Raw customer workbooks remain outside Git.

### Duplicate policy

- duplicate Customer name -> retain first canonical source row and remap references;
- exact duplicate Item code -> retain first; later exact collisions get lowest free `01`, `02`, `03`... suffix with source lineage preserved;
- uploaded item master is already 277/277 unique, so suffixing is currently a guard.

### 60 journal item identities

All original 60 journal item strings absent from the 277-code master now have deterministic disposition:

- **41** -> existing canonical Item aliases;
- **18** -> explicit supplemental source identities;
- **1** `NVL-LD-3LD` -> atomic `TP-TD325`, `TP-TD326`, `TP-TD327`, `TP-A282`.

No fuzzy matching and no fabricated suffix codes are used.

### Supplier roles

Observed purchase-party role gaps are closed **4 -> 0** without fuzzy party merging. Canonical `TIẾN ĐẠT` is preserved; `ANH HIẾU CẦN THƠ` keeps dual Customer/Supplier identity; `PHÁT AN KHANG` and `VIỆT ĐÔNG HƯNG` are exact Supplier identities.

## 6. Pilot-01 UOM / quantity truth

Authority: `docs/pilot/alumdoor/PILOT_01_UOM_RECONCILIATION_V1.json`.

Review scope: **21 source identities**.

- **10** have source-backed opening/stock UOM semantics;
- **9** are locked as non-stock service or legacy derived commercial transaction lines;
- **2** remain fail-closed stock-UOM blockers.

### Context split correction

`NVL-TON-DL7.2Dx124-XNXLC` supersedes the earlier global-alias assumption.

- `Trang tính29` row 158 contains a real inventory snapshot: **552 Kg on 27/03/2026** under this source code.
- sales rows use the same legacy code with structured area and a finished-commercial `m2` interpretation.
- therefore stock/opening/purchase context keeps the raw source identity in **Kg**; sales context maps to `TP-TOLEKEM124_6D` in **m2**.
- missing business context fails closed. The source code is overloaded and must never silently collapse across the two axes.

### Resolved source axes

Examples:

- `NVL-TOLE1.2x190-CORON` -> `TP-RS7P (CÓ RON)` / Stock `Mét`; deterministic quantity = structured length × piece count. Source row 327 remains row-level blocked because structured quantity fields are blank.
- `NVL-TRUC114_2.4LY` -> `TP-TRUC140` / Stock `Mét`; observed 6m × 4 cây = 24m.
- `CROMATE 3+`, `TẨY NHÔM` -> Stock `Kg`.
- `MŨI MÀI HỘP KIM` -> Stock `Cái`.
- `NVL-VIS-BANLO2P` -> Stock `Con` from a source inventory snapshot; a historical sales line described as `1 KG` is not auto-converted to Con.
- Tanker/YHLD identities -> Stock `Cái`.
- `CPVC`, phụ thu and labor identities -> `Dịch vụ`, **no stock_uom**.
- `NVL-LUOIMV_STD`, `NVL-TDAL70THO`, `NVL-TOLE0.42x598-TR-XLC`, `NVL-TON3.8D-XN-VK` are legacy derived sales lines resolved to commercial `m2`, not standalone opening-stock Items.

### Fail-closed UOM blockers

1. `NVL-AL595-GS`: inventory snapshot `504 KG/M` conflicts dimensionally with sales-area use. `KG/M` is a rate, not a safe stock quantity. No conversion to Kg or m2 is source-proven.
2. `NVL-BO1VIS AL71`: source purchase quantity `159 KG`, while the canonical BỌ family uses Stock `Con`. No Kg-to-Con conversion evidence exists.

UOM reconciliation therefore materially reduced the blocker surface, but it does not fabricate conversions for the remaining two identities.

## 7. Pilot-01 cutoff truth

Authority: `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`.

`30/06/2026` was evaluated and is **not frozen**.

- Cash/bank: **194 dated rows 08/04–30/06**; partial support.
- AR: **514** observed credit-sale rows `1,377,136,021.969` VND before rounding versus **177** receipts `2,553,550,874` VND starting earlier; carry-in AR is proven. AR summary has **0 populated opening rows**.
- AP: **14** unpaid-purchase rows through 02/07; AP summary has **0 populated opening rows** and no observed supplier-payment rows.
- Stock: physical history is substantial but actual populated `SỐ KG TỔNG` remains **0**, opening valuation is absent, scope is incomplete versus the process specification, and two `VIPST700` rows are future-dated `23/12/2026`.

There is currently **no source-proven common cutoff** across Stock + AR + AP + cash/bank. Missing financial openings are never assumed zero.

## 8. Remaining Pilot-01 blockers

1. source-authoritative full-customer AR opening snapshot at one named cutoff;
2. source-authoritative full-supplier AP opening snapshot at the same cutoff;
3. canonical Stock quantity + value at the same cutoff with complete scope, including aluminum Kg/value;
4. matching cash/bank balances if included;
5. source-owner UOM evidence for `NVL-AL595-GS` and `NVL-BO1VIS AL71`;
6. row-level quantity disposition for ray source row 327 and VIS historical sales unit conflict;
7. stock scope/future-date disposition;
8. deterministic integer-VND rounding for 45 fractional totals;
9. minimum BOM/work-center/employee/pilot-user inputs and exactly one active named `Giám đốc` account.

Pilot-01 remains PREVIEW-BLOCKED. **No real Pilot-01 production import/write has occurred.**

## 9. Architecture authorities

- Document/business writes: canonical Document Kernel / Durable Object path.
- Money: canonical GL + Payment Ledger; no shadow finance ledger.
- Stock: canonical Stock Ledger/valuation; no vertical stock fork.
- Permission: server-side tenant/role/DocPerm/owner/share/user-permission enforcement.
- App lifecycle: App Registry / App Factory.
- Capability activation: server-authoritative profile.
- Frontend: shared metadata-driven MetaForge runtime.
- Alumdoor consumes shared Finance/CRM/Procurement/Stock/Manufacturing/HCM/Service authorities.

## 10. Active sequence

`R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 SOURCE INGESTED -> identity/NCC reconciled -> UOM 19/21 locked -> cutoff candidate rejected as unproven -> remaining opening/UOM/data evidence -> PREVIEW_PASS -> Pilot-02 -> Pilot-03 -> Pilot-04 -> Pilot-05 -> Accepted Production Reference -> GA`

## 11. Standing boundaries

- Controlled pilot is not GA.
- `PREVIEW_PASS` is not production-write authorization.
- Real customer/master/opening-data import/write remains an explicit authorization boundary.
- Cutover, restore/PITR, DNS/routes/secrets/provider mutation and destructive state operations remain explicit authorization boundaries.
- Missing financial opening values are never assumed zero.
- Rate-like `KG/M` / `KG/M2` labels are never silently promoted to stock quantities.

## 12. Documentation authority

Start with `docs/pilot/alumdoor/README.md`, `NEXT_TASKS.md`, `PILOT_01_STATUS.json`, `PILOT_01_UOM_RECONCILIATION_V1.json`, `PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`, and `PILOT_01_CUTOFF_FEASIBILITY_20260805.json`.
