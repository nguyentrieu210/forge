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
- Cutoff candidate `30/06/2026`: **EVALUATED / NOT PROVEN / NOT FROZEN**.
- Pilot-01 verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED**.
- Active phase: **source-authoritative opening evidence + quantity/UOM reconciliation**.
- Next milestone: **one proven common cutoff -> private normalized batch `PREVIEW_PASS` -> Pilot-01 READY -> Pilot-02**.

Do not reopen R6 merely because controlled-pilot data/cutover work remains.

## 1. Pilot-00 — DONE

Exact product/package/profile/tenant/personas, Mapping V1, reconciliation and production boundaries are locked. Pilot-00 performed no real customer/master/opening production mutation.

## 2. Pilot-01 — current work

### Completed

- real uploaded source set ingested by hash/evidence;
- 277/277 item master codes observed unique;
- duplicate Customer rule locked: keep first canonical row and remap references;
- exact item-code collision rule locked: later exact collisions get lowest free `01`, `02`, `03`... suffix;
- 60 historical journal item identities dispositioned: 41 canonical aliases + 18 supplemental identities + 1 composite explosion;
- supplier role gaps closed: `4 -> 0` without fuzzy party merge;
- preview-only validators/normalizers and CI gates are green.

### Cutoff feasibility — 30/06/2026 is NOT frozen

Machine evidence: `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`.

30/06 is not source-proven as a common Stock/AR/AP/cash-bank opening point:

- **Cash/bank:** `THU-CHI` has 194 dated rows from 08/04 through 30/06 and explicitly selects day 30/month 6, so the date has partial cash support.
- **AR:** 514 credit-sale rows run 01/06–13/06 for 1,377,136,021.969 VND before rounding; 177 customer-receipt rows run 08/04–25/06 for 2,553,550,874 VND. Receipts precede observed sales and exceed them, proving carry-in AR. `CHI TIẾT CNO KH` has 152 customer summary rows but **0 populated `ĐẦU KỲ` rows**.
- **AP:** 14 unpaid-purchase rows exist; 8 are on/before 30/06 and 6 are after. `CNO NCC` has 8 supplier summary rows but **0 populated `ĐẦU KỲ` rows**. No supplier-payment row is observed. Missing opening cannot be treated as zero.
- **Stock:** physical replay evidence exists, but canonical opening is not proven. The aluminum workbook has 1,506 physical rows, 1,152 source-status available rows / 41,137 pieces-leaves, but **0 populated actual-Kg cells** and no source-authoritative opening valuation. Source scope also differs from the process specification.

Therefore `30/06/2026` remains only an evaluated candidate. Do not manufacture AR/AP or Stock openings to make it pass.

### Remaining blockers before `PILOT-01-READY`

1. **AR opening:** obtain or identify a full-customer source-authoritative opening snapshot at one named cutoff.
2. **AP opening:** obtain or identify a full-supplier source-authoritative opening snapshot at the same cutoff.
3. **Stock opening:** obtain canonical quantity + value evidence at the same cutoff, including complete source scope; aluminum actual Kg/value remains unresolved.
4. **Cash/bank:** bind balances to the same cutoff if cash/bank stays in pilot scope.
5. **Quantity/UOM:** accept canonical axes for 18 supplemental identities and 3 axis-sensitive aliases.
6. **Stock anomalies:** disposition process-vs-workbook scope drift and two `VIPST700` rows dated `23/12/2026`.
7. **VND rounding:** freeze deterministic integer-VND conversion for 45 fractional `Tổng thanh toán` rows.
8. **Operating/access masters:** complete minimum BOM/work-center/employee/pilot-user inputs and exactly one active named `Giám đốc` account.

### Next execution order

- continue resolving quantity/UOM and stock evidence using existing uploads/repo authority;
- in parallel, search the existing uploaded set for any additional source-authoritative AR/AP opening evidence;
- if none exists, the remaining AR/AP opening snapshot is an external source dependency and must not be synthesized;
- once a common cutoff is source-proven, generate the private Mapping-V1 batch and run `validate-pilot-batch.mjs` until zero-variance `PREVIEW_PASS`.

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
- Real production data write/import, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
- Controlled pilot is not GA.

## 8. Authorities

- `docs/pilot/alumdoor/README.md`;
- `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`;
- `docs/pilot/alumdoor/PILOT_00_LOCK.json`;
- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_IDENTITY_DISPOSITION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`;
- `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.md`;
- `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`;
- `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`.
