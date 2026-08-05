# NEXT TASKS

Ngày cập nhật: **2026-08-05**.

Đây là **active queue** của Forge. Lịch sử đã hoàn thành nằm trong Git/PR/convergence evidence, không lặp lại ở đây.

## 0. Current state

- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6 Production Certification: **DONE / PILOT-GO**.
- Exact certified/deployed R6 SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Final R6 evidence: `deploy-evidence/r6-final-production-certification-49315112a211.json` — **23/23 PASS**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 source set: **OBSERVED / HASHED / INGESTED**.
- Duplicate identity policy: **LOCKED**.
- Journal item identities: **60/60 DISPOSITIONED**.
- Supplier purchase-party roles: **4 -> 0 gaps**.
- UOM/quantity pass: **21 reviewed / 19 resolved-or-classified / 2 fail-closed blockers**.
- Cutoff candidate `30/06/2026`: **EVALUATED / NOT PROVEN / NOT FROZEN**.
- Pilot-01 verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED**.
- Active phase: **source-authoritative opening evidence + residual UOM/data blockers**.
- Next milestone: **one proven common cutoff -> private normalized batch `PREVIEW_PASS` -> Pilot-01 READY -> Pilot-02**.

Do not reopen R6 merely because controlled-pilot data/cutover work remains.

## 1. Pilot-00 — DONE

Exact product/package/profile/tenant/personas, Mapping V1, reconciliation and production boundaries are locked. Pilot-00 performed no real customer/master/opening production mutation.

## 2. Pilot-01 — current work

### Completed

- real uploaded source set ingested by hash/evidence;
- 277/277 item master codes observed unique;
- duplicate Customer and exact item-code collision policies locked;
- 60 historical journal item identities dispositioned: 41 canonical aliases + 18 supplemental identities + 1 composite explosion;
- supplier role gaps closed `4 -> 0` without fuzzy merge;
- UOM/quantity review completed for 21 source identities: **19 resolved/classified**, **2 explicitly blocked**;
- preview-only validators/normalizers/CI guards remain fail-closed.

### UOM/quantity reconciliation — partial lock

Authority: `docs/pilot/alumdoor/PILOT_01_UOM_RECONCILIATION_V1.json`.

Important correction: `NVL-TON-DL7.2Dx124-XNXLC` is **not** a safe global alias to finished item `TP-TOLEKEM124_6D`.

- `Trang tính29` row 158 proves a raw-stock snapshot: **552 Kg on 27/03/2026** under the legacy source code.
- in sales context the same source code is used with structured area and maps commercially to `TP-TOLEKEM124_6D` / `m2`.
- therefore normalization now requires **context split**: stock/opening/purchase -> raw source identity in Kg; sales -> finished commercial identity in m2. No business context means fail-closed.

Resolved examples:

- `NVL-TOLE1.2x190-CORON` -> `TP-RS7P (CÓ RON)`, Stock `Mét`, quantity = structured length × piece count; row 327 remains blocked because structured quantity fields are blank.
- `NVL-TRUC114_2.4LY` -> `TP-TRUC140`, Stock `Mét`; observed 6m × 4 cây = 24m.
- `CROMATE 3+`, `TẨY NHÔM` -> Stock `Kg`.
- `MŨI MÀI HỘP KIM` -> Stock `Cái`.
- `NVL-VIS-BANLO2P` -> Stock `Con` from source inventory snapshot; historical sales description using `KG` is not auto-converted.
- Tanker/YHLD source identities -> Stock `Cái`.
- `CPVC`, phụ thu and labor lines -> services with **no stock_uom**.
- legacy derived sales lines such as `NVL-LUOIMV_STD`, `NVL-TDAL70THO`, `NVL-TOLE0.42x598-TR-XLC`, `NVL-TON3.8D-XN-VK` are commercial m2 transaction lines, not standalone opening-stock identities.

Two UOM identities remain fail-closed:

1. `NVL-AL595-GS`: source inventory snapshot is `504 KG/M`, while sales rows use area/m2. `KG/M` is rate-like and cannot be promoted to a canonical stock quantity without source-owner confirmation.
2. `NVL-BO1VIS AL71`: purchase row says `159 KG`, while the canonical BỌ family uses `Con`; no Kg-to-Con conversion evidence exists.

### Cutoff feasibility — 30/06/2026 is NOT frozen

Machine evidence: `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`.

- Cash has partial support through 30/06.
- AR proves carry-in debt but has **0 populated opening rows**.
- AP has **0 populated opening rows** and no source-proven historical zero balance.
- Stock has physical replay evidence but **0 populated actual-Kg cells**, no authoritative opening valuation and incomplete source scope.

Missing openings are never treated as zero.

### Remaining blockers before `PILOT-01-READY`

1. **AR opening:** source-authoritative full-customer opening snapshot at one named cutoff.
2. **AP opening:** source-authoritative full-supplier opening snapshot at the same cutoff.
3. **Stock opening:** canonical quantity + value at the same cutoff, including complete source scope and aluminum Kg/value evidence.
4. **Cash/bank:** matching balances at the same cutoff if in scope.
5. **Residual UOM:** source-owner evidence for `NVL-AL595-GS` and `NVL-BO1VIS AL71`; row-level quantity evidence for ray row 327 and VIS historical sales conversion.
6. **Stock anomalies:** process-vs-workbook scope drift and two `VIPST700` rows dated `23/12/2026`.
7. **VND rounding:** deterministic integer-VND conversion for 45 fractional `Tổng thanh toán` rows.
8. **Operating/access masters:** minimum BOM/work-center/employee/pilot-user inputs and exactly one active named `Giám đốc` account.

### Next execution order

- lock deterministic VND rounding from source behavior if evidence supports it;
- disposition stock date/scope anomalies where current files are sufficient;
- search existing uploads for any additional authoritative AR/AP/opening evidence;
- treat missing AR/AP/Stock opening authority and the two unresolved UOM conversions as external source dependencies rather than inventing values;
- once one common cutoff is source-proven, generate the private Mapping-V1 batch and run `validate-pilot-batch.mjs` to zero-variance `PREVIEW_PASS`.

**Production write/import remains unauthorized.** `PREVIEW_PASS` does not authorize production mutation.

## 3. Pilot-02 — Representative Transaction Dry Run

Only after Pilot-01 is accepted and named accounts are frozen. Exercise canonical Sales, Procurement, Stock, Manufacturing, Finance, correction/return, warranty/service, settlement and idempotency paths.

## 4. Pilot-03 — Parallel Run + Daily Reconciliation

Run Forge alongside the current source for a bounded period and reconcile Stock, AR/AP, scoped cash/bank, revenue, COGS, manufacturing/WIP, GL and document state. Default tolerance: zero unexplained variance.

## 5. Pilot-04 — Cutover Decision

Requires exact locked identity, accepted opening/parallel reconciliation, no unresolved P0/P1 blocker, accepted access readiness, fresh recovery evidence, deterministic delta/cutoff and explicit `Giám đốc` acceptance. Live production cutover remains an explicit authorization boundary.

## 6. Pilot-05 — Hypercare + Exit Gate

Monitor runtime/provider health, reconcile state daily, close incidents and verify recovery continuity. Only `PILOT-ACCEPTED` advances to Accepted Production Reference -> GA.

## 7. Standing boundaries

- No blanket capability wave reopening.
- No shadow Finance/Stock/HRM/CRM implementation inside Alumdoor.
- Raw customer/master/opening files remain outside Git.
- Missing opening values are never assumed zero.
- Rate-like `KG/M` or `KG/M2` labels are never silently treated as stock quantities.
- Real production data write/import, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
- Controlled pilot is not GA.

## 8. Authorities

- `docs/pilot/alumdoor/README.md`;
- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_IDENTITY_DISPOSITION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_UOM_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`;
- `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`;
- `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`.
