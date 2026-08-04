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

Frozen:

- exact certified software baseline `49315112a21182d2ce077b08a1fb9e26db07fd36`;
- release bundle `838218167db020d8`;
- Alumdoor `2.2.3`, HRM `1.8.0`, VN Accounting `1.6.1`;
- capability profile `alumdoor-pilot@1`;
- tenant `alu` / `https://alu.kairo.vn`;
- pilot personas and named-account allowlist policy;
- `Giám đốc` as single business cutover approval role;
- source cutoff/extract, mapping V1 and zero-unexplained-variance contracts.

Pilot-00 performed **no real customer/master/opening-data production write**.

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

### Real source set observed

- item master: **277 rows / 277 unique codes**;
- customer source: **258 rows / 256 exact names**;
- supplier master: **8 typed NCC rows**;
- operating journal: **730 typed rows**;
- current TIẾN ĐẠT purchase-order reference;
- 11-sheet customer order/history workbook;
- aluminum stock workbook: **21 total / 18 inventory sheets / 1,506 lot rows**;
- source status formula: **1,152 available rows / 41,137 pieces-leaves**;
- business-process/formula source.

Raw customer workbooks remain outside Git; Git stores only digests, structural evidence and non-sensitive reconciliation decisions.

### Identity reconciliation — DONE

#### Duplicate identities

- duplicate Customer names: retain the first canonical row and remap references to it;
- exact duplicate item codes: retain first; later exact collisions get lowest free `01`, `02`, `03`... suffix with source lineage preserved;
- the uploaded item master is already 277/277 unique, so suffixing is currently a guard.

#### 60 historical journal item identities

All 60 unmatched journal item strings now have deterministic identity disposition:

- **41** map to existing canonical Item codes using exact/source-backed aliases;
- **18** remain explicit supplemental source identities because they represent source-only stock/component/service identities not present in the 277-code master;
- **1** historical composite `NVL-LD-3LD` is exploded to canonical atomic leaf-bottom items `TP-TD325`, `TP-TD326`, `TP-TD327`, `TP-A282`.

No fuzzy matching is used. The duplicate suffix rule is **not** used to fabricate identities for these 60 strings.

Three existing-master identity aliases still require quantity-axis reconciliation before transaction/opening materialization:

- `NVL-TOLE1.2x190-CORON`;
- `NVL-TON-DL7.2Dx124-XNXLC`;
- `NVL-TRUC114_2.4LY`.

The 18 supplemental identities also require canonical UOM/quantity semantics before they may be materialized. Their identity is resolved; their accounting/stock axis is not automatically inferred from rate-like source units such as `KG/M` or `KG/M2`.

#### Supplier roles

The observed purchase journal contains 8 distinct purchase parties. Four were already typed NCC in the source; four role gaps are now deterministically dispositioned:

- `TIẾN ĐẠT` -> bind existing canonical Supplier;
- `ANH HIẾU CẦN THƠ` -> ensure Supplier with same exact name while preserving its Customer role;
- `PHÁT AN KHANG` -> ensure Supplier from exact purchase-party identity;
- `VIỆT ĐÔNG HƯNG` -> ensure Supplier from exact purchase-party identity.

Supplier role gaps are therefore **4 -> 0**. No fuzzy party merge is allowed.

### Remaining blockers before `PILOT-01-READY`

1. **Common cutoff:** Stock, AR/AP and cash/bank do not yet prove one coherent business cutoff. `30/06/2026` is a candidate because a cash/bank snapshot is labelled at that date, but it must be proven against Stock/AR/AP before freezing.
2. **Quantity/UOM semantics:** materialize the 18 supplemental identities and three identity-only aliases only after canonical quantity/UOM axes are accepted.
3. **Opening Stock:** aluminum lots contain physical length/piece evidence but zero populated actual-Kg cells; theoretical kg/m cannot silently become measured opening Stock quantity.
4. **Stock scope/date anomalies:** process source describes 23 aluminum + 2 mesh sheets while observed stock workbook has 21 total / 18 inventory sheets; two `VIPST700` rows carry `23/12/2026`.
5. **Opening AR/AP:** observed activity does not yet prove complete balances at one common cutoff.
6. **VND rounding:** 45 journal rows have fractional `Tổng thanh toán`; deterministic integer-VND conversion must be frozen.
7. **Operating/access masters:** work-center/BOM/employee/pilot-user inputs are incomplete; exactly one active named `Giám đốc` account remains required.

### Next execution order

1. test and freeze one coherent cutoff, starting with `30/06/2026` as a candidate — do not freeze it if Stock/AR/AP cannot be evidenced there;
2. reconcile quantity/UOM axes for the supplemental identities and the three identity-only aliases;
3. derive/obtain source-authoritative Stock/AR/AP/cash-bank opening evidence at the frozen cutoff;
4. disposition stock sheet-scope drift and future dates;
5. freeze VND rounding;
6. complete minimum BOM/work-center/employee/pilot-user scope;
7. generate private normalized JSON batch and run `validate-pilot-batch.mjs` until `PREVIEW_PASS` with zero unexplained variance.

**Production write/import remains unauthorized.** `PREVIEW_PASS` still does not authorize a production write.

## 3. Pilot-02 — Representative Transaction Dry Run

Only after Pilot-01 is accepted and the named account allowlist is frozen. Exercise representative Sales, Procurement, Stock, Manufacturing, Finance, correction/return, warranty/service, settlement and idempotency paths using canonical shared authorities only.

## 4. Pilot-03 — Parallel Run + Daily Reconciliation

Run Forge alongside the current operational source for an agreed bounded period. Reconcile Stock, AR/AP, payment/cash/bank where scoped, revenue, COGS, manufacturing/WIP, GL and document counts/statuses. Default tolerance is zero unexplained variance.

## 5. Pilot-04 — Cutover Decision

Cutover requires exact locked identity, accepted opening/parallel reconciliation, no unresolved P0/P1 blocker, accepted access readiness, fresh recovery evidence, deterministic delta/cutoff procedure and explicit acceptance by the named `Giám đốc` account.

Production cutover and live customer-data mutation remain explicit authorization boundaries.

## 6. Pilot-05 — Hypercare + Exit Gate

After cutover, monitor runtime/provider health, reconcile financial/stock state daily, track incidents/corrections, and verify recovery continuity. Final verdict is `PILOT-ACCEPTED` or `PILOT-REJECTED`; only `PILOT-ACCEPTED` advances to Accepted Production Reference -> GA.

## 7. Standing boundaries

- Global capability score is not a reason to reopen a blanket feature wave.
- Vertical apps consume shared authorities; no copied Finance/Stock/HRM/CRM state inside Alumdoor.
- Production/provider evidence must be observed directly.
- R6 certification remains exact-SHA bound.
- Real customer/master/opening files should not be committed to Git.
- Real production data import/write, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
- Controlled pilot is not GA.

## 8. Authorities

Pilot:

- `docs/pilot/alumdoor/README.md`;
- `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`;
- `docs/pilot/alumdoor/PILOT_00_LOCK.json`;
- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_IDENTITY_DISPOSITION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_READINESS.md`;
- `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.md`.

R6 closure:

- `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`;
- `deploy-evidence/r6-final-production-certification-49315112a211.json`;
- `deploy-evidence/r6-authorized-orchestrator-49315112a211.json`.
