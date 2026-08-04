# NEXT TASKS

Ngày cập nhật: **2026-08-05**.

Đây là **active queue** của Forge. Lịch sử đã hoàn thành nằm trong Git/PR/convergence evidence, không lặp lại ở đây.

## 0. Current state

- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6 Production Certification: **DONE / PILOT-GO**.
- Exact certified/deployed R6 SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Final R6 evidence: `deploy-evidence/r6-final-production-certification-49315112a211.json` — **23/23 PASS**.
- Pilot-00 Freeze Production Profile + Pilot Contract: **DONE / PILOT-00-LOCKED**.
- Pilot-01 control plane: **READY / PREVIEW-ONLY**.
- Pilot-01 real uploaded source set: **OBSERVED / HASHED / INGESTED**.
- Pilot-01 duplicate identity policy: **LOCKED**.
- Pilot-01 preview verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED**.
- Active phase: **Pilot-01 — reconcile + normalize Master/Opening Data**.
- Next milestone: **private normalized real batch `PREVIEW_PASS` -> Pilot-01 READY -> Pilot-02 Representative Transaction Dry Run**.

Do not reopen R6 merely because controlled-pilot business/data/cutover work remains. Those are downstream pilot gates.

## 1. Pilot-00 — DONE / PILOT-00-LOCKED

Frozen:

- exact certified software baseline `49315112a21182d2ce077b08a1fb9e26db07fd36`;
- release bundle `838218167db020d8`;
- Alumdoor `2.2.3`, HRM `1.8.0`, VN Accounting `1.6.1`;
- capability profile `alumdoor-pilot@1` with frozen content hash;
- single pilot target `alu` / `https://alu.kairo.vn`;
- pilot personas and named-account allowlist policy;
- `Giám đốc` as the single business cutover approval role;
- permitted transaction families;
- source cutoff/extract manifest rules;
- data mapping contract V1;
- zero-unexplained-variance reconciliation contract;
- stop, correction, rollback/forward-fix and cutover rules.

Pilot-00 performed **no real customer/master/opening-data production write**.

## 2. Pilot-01 — Master + Opening Data Readiness

Status: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED**.

### Control plane already prepared

- frozen schema: `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
- identity disposition: `docs/pilot/alumdoor/PILOT_01_IDENTITY_DISPOSITION_V1.json`;
- immutable manifest template: `docs/pilot/alumdoor/PILOT_01_BATCH_MANIFEST_TEMPLATE.json`;
- identity normalizer: `docs/pilot/alumdoor/tools/normalize-pilot-identities.mjs`;
- preview validator: `docs/pilot/alumdoor/tools/validate-pilot-batch.mjs`;
- fail-closed tests for validator + identity normalization;
- Pilot-00/Pilot-01 identity verifier: `docs/pilot/alumdoor/tools/verify-pilot-01-contract.mjs`;
- machine status: `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- source ingest machine evidence: `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`;
- source ingest disposition: `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.md`.

### Real source set now observed

Operator-provided uploads contain real Alumdoor master/operational evidence:

- 277-row / 277-code item master export;
- 258 customer source rows / 256 exact customer names;
- 8 supplier-master rows;
- 730 typed operating-journal rows;
- one current TIẾN ĐẠT purchase-order summary;
- 11-sheet customer order/history workbook;
- aluminum physical-lot workbook with 21 total sheets / 18 inventory sheets and 1,506 source lot rows;
- business process/formula specification.

No raw customer workbook is committed to Git. Only immutable source digests, counts and blocker summaries are materialized.

### Duplicate identity policy — DONE

- **Customer duplicate:** keep one canonical Customer — the first row in immutable source order. Later duplicate names are dropped from Customer output; `contacts`/`opening_ar` references are remapped to the retained `source_key`.
- **Exact item-code duplicate:** first row keeps the original code; later exact collisions receive `01`, `02`, `03`... using the lowest free suffix and preserving `source_code_original`.
- Existing source codes are reserved so suffixing never overwrites a real pre-existing code.
- The uploaded item master is already **277/277 unique**, so this rule is currently a guard rather than a transformation of those 277 rows.
- The **60 journal item strings that do not match master codes are still an alias/reference issue**, not a duplicate-code issue; do not create fake `01` codes for those automatically.

### Remaining reconciliation blockers before `PILOT-01-READY`

1. **Common cutoff:** Stock, AR/AP and cash/bank do not yet prove one common business cutoff.
2. **Supplier identity:** uploaded purchase activity references parties not typed NCC; canonical `TIẾN ĐẠT` already exists, remaining role mappings need disposition.
3. **Item aliases:** 60 distinct journal item-code strings do not exact-match the uploaded 277-code item export; use canonical alias/standardization evidence, never fuzzy guessing.
4. **Opening Stock:** uploaded aluminum lots preserve length/piece/color/condition but contain zero populated actual-Kg cells; theoretical kg/m must not masquerade as measured Stock quantity.
5. **Stock scope drift:** process source describes 23 aluminum sheets + 2 mesh sheets; uploaded aluminum workbook has 21 total / 18 inventory sheets and no separate mesh opening source in the observed set.
6. **Future stock dates:** two `VIPST700` rows carry `23/12/2026` and require disposition.
7. **Opening AR/AP:** observed activity does not prove complete opening balances at one common cutoff.
8. **VND rounding:** 45 typed journal rows expose fractional `Tổng thanh toán`; deterministic integer-VND conversion policy must be frozen.
9. **Operating/access masters:** complete work-center/BOM/employee/pilot-user sources are not migration-ready; exactly one active named `Giám đốc` account remains required.

### Next execution order

- apply locked customer/item duplicate normalization to the private batch;
- normalize item aliases against canonical Alumdoor standardization;
- reconcile remaining supplier party identities;
- freeze one coherent business cutoff;
- obtain matching AR/AP/cash-bank opening snapshots;
- disposition stock sheet-scope drift/future dates;
- obtain actual measured Kg/value evidence for opening aluminum stock or an explicitly approved source-bound conversion that does not relabel theoretical evidence;
- freeze employee/work-center/BOM scope and named pilot accounts;
- generate private normalized JSON batch;
- run `validate-pilot-batch.mjs` until `PREVIEW_PASS` with zero unexplained variance.

**Production write/import remains unauthorized.** `PREVIEW_PASS` still does not authorize a production write.

## 3. Pilot-02 — Representative Transaction Dry Run

Only after Pilot-01 is accepted and the named account allowlist is frozen.

Using approved pilot data/users, exercise representative business paths:

- quotation -> sales order;
- procurement/material demand -> purchase -> receipt;
- manufacturing/work order and stock movements;
- delivery -> sales invoice -> payment;
- return/correction/cancel paths;
- warranty/service lineage;
- partial/final settlement;
- duplicate/idempotent retry and fail-closed invalid actions.

Use canonical shared authorities only. Do not create vertical shadow stock/finance/HRM/CRM state to make the pilot pass.

## 4. Pilot-03 — Parallel Run + Daily Reconciliation

Run Forge alongside the current operational source for an agreed bounded period.

Daily reconcile at minimum:

- Stock quantity/value;
- AR/AP;
- payment/cash/bank where in scope;
- revenue;
- COGS;
- manufacturing/WIP where applicable;
- GL debit/credit/balance;
- document counts/statuses and unresolved exceptions.

Default tolerance is zero unexplained variance. Every discrepancy must have owner, root cause, disposition and recheck evidence.

## 5. Pilot-04 — Cutover Decision

Cutover is allowed only when:

- exact locked release/package/profile identity still matches production;
- opening and parallel-run reconciliations are accepted;
- no unresolved P0/P1 pilot blocker remains;
- named user/access readiness is accepted;
- backup/recovery state is fresh and verified;
- delta/cutoff procedure is deterministic;
- the named account holding `Giám đốc` authority explicitly accepts cutover.

Production cutover, live customer-data mutation, DNS/route changes and destructive recovery actions remain explicit authorization boundaries.

## 6. Pilot-05 — Hypercare + Exit Gate

After cutover:

- monitor health/errors/queues/provider pressure;
- reconcile Stock/AR/AP/payment/revenue/COGS/manufacturing/GL daily;
- track support incidents and correction paths;
- verify backup/recovery continuity;
- close pilot residuals or explicitly defer them with owner/risk.

Pilot Exit Gate requires a durable final record with exact deployed identity, package/profile identity, accepted reconciliation period, incident/blocker disposition, recovery evidence currency and business acceptance.

Final verdict is `PILOT-ACCEPTED` or `PILOT-REJECTED`. Only `PILOT-ACCEPTED` may advance to **Accepted Production Reference -> GA**.

## 7. Standing boundaries

- Global capability score is not a reason to reopen a blanket feature wave.
- Vertical apps consume shared authorities; no copied HRM/CRM/Finance/Stock implementation inside Alumdoor.
- Capability disable != package uninstall/data purge.
- Production/provider evidence must be observed directly; source presence is insufficient.
- Worker rollback != data rollback.
- R6 certification is exact-SHA bound; future product-source changes require affected evidence rerun.
- Pilot package/profile changes require identity re-lock and affected runtime/Golden Flow evidence rerun.
- Real customer/master/opening files should not be committed to Git.
- Controlled pilot is not GA.

## 8. Authorities

Pilot:

- `docs/pilot/alumdoor/README.md`;
- `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`;
- `docs/pilot/alumdoor/PILOT_00_LOCK.json`;
- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_IDENTITY_DISPOSITION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_READINESS.md`;
- `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.json`;
- `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.md`.

R6 closure:

- `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`;
- `deploy-evidence/r6-final-production-certification-49315112a211.json`;
- `deploy-evidence/r6-authorized-orchestrator-49315112a211.json`.
