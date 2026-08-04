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
- Pilot-01 control plane: **READY / PREVIEW-ONLY**.
- Pilot-01 real uploaded source set: **OBSERVED / HASHED / INGESTED**.
- Pilot-01 duplicate Customer/item-code policy: **LOCKED**.
- Pilot-01 journal item identity reconciliation: **60/60 DISPOSITIONED** — 41 canonical aliases, 18 supplemental source identities, 1 composite explosion.
- Pilot-01 supplier-role reconciliation: **DONE** — purchase-party role gaps `4 -> 0`; 12 Supplier identities if materialized.
- Pilot-01 preview verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED**.
- Active phase: **Pilot-01 — cutoff + quantity/UOM + opening-data reconciliation**.
- Next milestone: **private normalized real batch `PREVIEW_PASS` -> Pilot-01 READY -> Pilot-02 Representative Transaction Dry Run**.

Do not reopen R6 merely because controlled-pilot business/data/cutover work remains. Those are downstream pilot gates.

## 1. Pilot-00 — DONE / PILOT-00-LOCKED

Frozen exact product/package/profile/tenant/pilot personas, source cutoff/extract contract, Mapping V1, zero-unexplained-variance reconciliation, stop/correction/cutover rules and explicit production boundaries. Pilot-00 performed **no real customer/master/opening-data production write**.

## 2. Pilot-01 — Master + Opening Data Readiness

Status: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED**.

### Authorities and tooling

- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_IDENTITY_DISPOSITION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`;
- `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- `docs/pilot/alumdoor/tools/normalize-pilot-identities.mjs`;
- `docs/pilot/alumdoor/tools/normalize-pilot-aliases-suppliers.mjs`;
- `docs/pilot/alumdoor/tools/validate-pilot-batch.mjs`;
- `.github/workflows/pilot-01-data-readiness.yml`.

### Source truth

- 277 item-master rows / 277 unique codes;
- 258 customer rows / 256 exact names;
- 8 typed NCC rows;
- 730 typed journal rows;
- current TIẾN ĐẠT purchase reference;
- 11-sheet customer order/history workbook;
- aluminum stock: 21 total / 18 inventory sheets / 1,506 lot rows;
- source status replay: 1,152 available rows / 41,137 pieces-leaves.

Raw workbooks stay outside Git; Git stores source digests, structural evidence and reconciliation decisions only.

### Identity reconciliation — DONE

Duplicate rule:

- duplicate Customer -> retain first canonical row, remap references;
- exact duplicate Item code -> retain first, later exact collision gets lowest free `01`, `02`, `03`... suffix with lineage preserved;
- uploaded item master is already 277/277 unique, so suffixing is currently only a guard.

The original **60** journal strings absent from master are now fully dispositioned:

- **41** explicit aliases to existing canonical Items;
- **18** explicit supplemental source identities;
- **1** historical composite `NVL-LD-3LD` -> `TP-TD325`, `TP-TD326`, `TP-TD327`, `TP-A282`.

No fuzzy matching and no fake `01` codes are used for these 60 identities.

Identity resolution does not imply quantity-axis acceptance. The 18 supplemental identities and three identity-only aliases (`NVL-TOLE1.2x190-CORON`, `NVL-TON-DL7.2Dx124-XNXLC`, `NVL-TRUC114_2.4LY`) still need canonical quantity/UOM reconciliation.

Supplier purchase-party role gaps are **4 -> 0**:

- `TIẾN ĐẠT` -> existing canonical Supplier;
- `ANH HIẾU CẦN THƠ` -> ensure Supplier while preserving Customer dual role;
- `PHÁT AN KHANG` -> exact Supplier identity;
- `VIỆT ĐÔNG HƯNG` -> exact Supplier identity.

### Remaining blockers before `PILOT-01-READY`

1. **Common cutoff:** Stock, AR/AP and cash/bank do not yet prove one coherent business cutoff. `30/06/2026` is a candidate only.
2. **Quantity/UOM semantics:** 18 supplemental identities plus three identity-only aliases require accepted canonical quantity/UOM axes.
3. **Opening Stock:** aluminum lots contain physical evidence but zero populated actual-Kg cells; theoretical kg/m must not silently become measured Stock Kg.
4. **Stock scope/date anomalies:** process source expects 23 aluminum + 2 mesh sheets; observed workbook has 21 total / 18 inventory sheets; two `VIPST700` rows carry `23/12/2026`.
5. **Opening AR/AP:** complete balances at the same cutoff are not yet proven.
6. **VND rounding:** 45 journal rows contain fractional `Tổng thanh toán`; deterministic integer-VND conversion must be frozen.
7. **Operating/access masters:** work-center/BOM/employee/pilot-user inputs remain incomplete; exactly one active named `Giám đốc` account is required.

### Next execution order

1. test and freeze one coherent cutoff, beginning with `30/06/2026` as candidate but rejecting it if Stock/AR/AP cannot be evidenced there;
2. reconcile quantity/UOM axes;
3. obtain/derive source-authoritative Stock/AR/AP/cash-bank opening evidence at the frozen cutoff;
4. disposition stock source anomalies;
5. freeze VND rounding;
6. complete minimum BOM/work-center/employee/pilot-user scope;
7. generate private normalized batch and run validator to real zero-variance `PREVIEW_PASS`.

**Production write/import remains unauthorized.** `PREVIEW_PASS` still does not authorize production mutation.

## 3. Pilot-02 — Representative Transaction Dry Run

Only after Pilot-01 is accepted and the named account allowlist is frozen. Exercise canonical Sales, Procurement, Stock, Manufacturing, Finance, correction/return, warranty/service, settlement and idempotency paths.

## 4. Pilot-03 — Parallel Run + Daily Reconciliation

Run Forge alongside the current source for an agreed bounded period and reconcile Stock, AR/AP, scoped cash/bank, revenue, COGS, manufacturing/WIP, GL and document state. Default tolerance is zero unexplained variance.

## 5. Pilot-04 — Cutover Decision

Requires exact locked identity, accepted opening/parallel reconciliation, no unresolved P0/P1 blocker, accepted access readiness, fresh recovery evidence, deterministic delta/cutoff procedure and explicit `Giám đốc` acceptance. Live production cutover remains an explicit authorization boundary.

## 6. Pilot-05 — Hypercare + Exit Gate

Monitor runtime/provider health, reconcile state daily, close incidents and verify recovery continuity. Only `PILOT-ACCEPTED` advances to Accepted Production Reference -> GA.

## 7. Standing boundaries

- Global capability score does not reopen a blanket feature wave.
- No vertical shadow Finance/Stock/HRM/CRM state.
- Real customer/master/opening files stay outside Git.
- Real production import/write, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
- Controlled pilot is not GA.

## 8. Authorities

- `docs/pilot/alumdoor/README.md`;
- `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`;
- `docs/pilot/alumdoor/PILOT_00_LOCK.json`;
- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_IDENTITY_DISPOSITION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_READINESS.md`;
- `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`;
- `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`.
