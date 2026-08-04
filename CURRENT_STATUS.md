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

No fuzzy matching and no fabricated suffix codes are used. Quantity/UOM semantics remain open for the 18 supplemental identities and three axis-sensitive aliases.

### Supplier roles

Observed purchase-party role gaps are closed **4 -> 0** without fuzzy party merging. Canonical `TIẾN ĐẠT` is preserved; `ANH HIẾU CẦN THƠ` keeps dual Customer/Supplier identity; `PHÁT AN KHANG` and `VIỆT ĐÔNG HƯNG` are exact Supplier identities.

## 6. Pilot-01 cutoff truth

Authority: `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`.

`30/06/2026` was evaluated and is **not frozen**.

### Cash/bank

`THU-CHI` has **194 dated rows from 08/04 through 30/06** and explicitly selects day 30/month 6. This gives partial support to the candidate date.

### AR

The journal contains:

- **514** credit-sale rows, 01/06–13/06, totaling `1,377,136,021.969` VND before rounding;
- **177** customer-receipt rows, 08/04–25/06, totaling `2,553,550,874` VND.

Receipts start before the observed sales window and exceed observed credit sales, proving carry-in AR. `CHI TIẾT CNO KH` has **152** customer summary rows and **0 populated `ĐẦU KỲ` rows**. Missing opening cannot be treated as zero.

### AP

There are **14** unpaid-purchase rows through 02/07; 8 occur on/before 30/06 and 6 after. `CNO NCC` has **8** supplier summary rows and **0 populated `ĐẦU KỲ` rows**. No supplier-payment row is observed. Historical AP is therefore not source-proven as zero or as any exact opening value.

### Stock

Physical history is substantial but canonical opening is incomplete:

- `LỊCH SỬ`: **1,268** dated rows, 18/05–20/06;
- `LICH_SU`: **863** actions, 25/06–27/07; 202 on/before 30/06 and 661 after;
- **178** current rows carry receipt/re-entry dates after 30/06;
- actual populated `SỐ KG TỔNG`: **0**;
- no source-authoritative opening valuation;
- process source expects **23 aluminum + 2 mesh sheets**, while the upload exposes **18 inventory sheets** and no separate mesh opening source;
- two `VIPST700` rows carry `23/12/2026`.

Physical rewind may be possible in principle, but canonical Kg/value at 30/06 is **not proven**.

### Cutoff verdict

There is currently **no source-proven common cutoff** across Stock + AR + AP + cash/bank in the uploaded set. Do not synthesize openings or assume blanks are zero.

## 7. Remaining Pilot-01 blockers

1. source-authoritative full-customer AR opening snapshot at one named cutoff;
2. source-authoritative full-supplier AP opening snapshot at the same cutoff;
3. canonical Stock quantity + value at the same cutoff with complete scope;
4. matching cash/bank balances if included;
5. quantity/UOM semantics for supplemental and axis-sensitive identities;
6. stock scope/future-date disposition;
7. deterministic integer-VND rounding for 45 fractional totals;
8. minimum BOM/work-center/employee/pilot-user inputs and exactly one active named `Giám đốc` account.

Pilot-01 remains PREVIEW-BLOCKED. **No real Pilot-01 production import/write has occurred.**

## 8. Architecture authorities

- Document/business writes: canonical Document Kernel / Durable Object path.
- Money: canonical GL + Payment Ledger; no shadow finance ledger.
- Stock: canonical Stock Ledger/valuation; no vertical stock fork.
- Permission: server-side tenant/role/DocPerm/owner/share/user-permission enforcement.
- App lifecycle: App Registry / App Factory.
- Capability activation: server-authoritative profile.
- Frontend: shared metadata-driven MetaForge runtime.
- Alumdoor consumes shared Finance/CRM/Procurement/Stock/Manufacturing/HCM/Service authorities.

## 9. Active sequence

`R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 SOURCE INGESTED -> identity/NCC reconciled -> cutoff candidate rejected as unproven -> source-authoritative opening evidence + UOM reconciliation -> PREVIEW_PASS -> Pilot-02 -> Pilot-03 -> Pilot-04 -> Pilot-05 -> Accepted Production Reference -> GA`

## 10. Standing boundaries

- Controlled pilot is not GA.
- `PREVIEW_PASS` is not production-write authorization.
- Real customer/master/opening-data import/write remains an explicit authorization boundary.
- Cutover, restore/PITR, DNS/routes/secrets/provider mutation and destructive state operations remain explicit authorization boundaries.
- Missing financial opening values are never assumed zero.

## 11. Documentation authority

Start with `docs/pilot/alumdoor/README.md`, `NEXT_TASKS.md`, `PILOT_01_STATUS.json`, `PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`, and `PILOT_01_CUTOFF_FEASIBILITY_20260805.json`.
