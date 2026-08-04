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
- Pilot-00 authority: `docs/pilot/alumdoor/PILOT_00_CONTRACT.md` + `PILOT_00_LOCK.json`.
- Active phase: **Pilot-01 — Master + Opening Data Readiness**.
- Next milestone: **Pilot-01 READY -> Pilot-02 Representative Transaction Dry Run**.

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

Use `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json` as the frozen schema.

Prepare one immutable batch manifest and validate, before any production write:

- customers/contacts;
- suppliers;
- items/BOM/routing/work centers where applicable;
- warehouses and opening stock;
- AR/AP opening balances;
- cash/bank opening balances only if explicitly included in pilot scope;
- employees and named pilot user/role allowlist;
- Alumdoor-specific reference masters that do not duplicate shared authorities.

Required controls:

- explicit `pilot_batch_id`, source system, cutoff and extract timestamps;
- SHA-256 per source extract;
- deterministic mapping and source provenance;
- duplicate/conflict detection;
- unknown-reference fail-closed behavior;
- tenant scope validation;
- preview row counts/totals;
- exact Stock/AR/AP/cash-bank/GL opening reconciliation;
- every non-zero discrepancy gets owner/root-cause/disposition/recheck evidence.

**Production write/import is not authorized by Pilot-00 closure.** Pilot-01 should exhaust source inspection, mapping, dry-run and preview work first.

## 3. Pilot-02 — Representative Transaction Dry Run

Only after Pilot-01 is accepted and named account allowlist is frozen.

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
- Controlled pilot is not GA.

## 8. Authorities

Pilot:

- `docs/pilot/alumdoor/README.md`;
- `docs/pilot/alumdoor/PILOT_00_CONTRACT.md`;
- `docs/pilot/alumdoor/PILOT_00_LOCK.json`;
- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`.

R6 closure:

- `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`;
- `deploy-evidence/r6-final-production-certification-49315112a211.json`;
- `deploy-evidence/r6-authorized-orchestrator-49315112a211.json`.
