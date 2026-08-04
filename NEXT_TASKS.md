# NEXT TASKS

Ngày cập nhật: **2026-08-05**.

Đây là **active queue** của Forge. Lịch sử đã hoàn thành nằm trong Git/PR/convergence evidence, không lặp lại ở đây.

## 0. Current state

- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6 Production Certification: **DONE / PILOT-GO**.
- Exact certified/deployed R6 SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Final evidence: `deploy-evidence/r6-final-production-certification-49315112a211.json` — **23/23 PASS**.
- Active program: **Alumdoor Controlled Pilot**.
- Next milestone: **Pilot Exit Gate -> Accepted Production Reference -> GA**.

Do not reopen R6 merely because controlled-pilot business/data/cutover work remains. Those are downstream pilot gates.

## 1. Pilot-00 — Freeze Production Profile + Pilot Contract

Before importing real operational data:

- freeze exact certified software baseline and `alumdoor-pilot@1` capability profile;
- define pilot users/roles/site scope and permitted transaction families;
- freeze master/opening-data mapping templates;
- define source-system extraction timestamp/cutoff rules;
- define daily reconciliation dimensions and tolerances;
- define stop/rollback/forward-fix criteria;
- define explicit business owner for cutover acceptance.

Any source-changing product fix creates a new release candidate and must rerun affected release evidence before use in the pilot.

## 2. Pilot-01 — Master + Opening Data Readiness

Prepare and validate before production write:

- customers/contacts;
- suppliers;
- items/BOM/routing/work centers where applicable;
- warehouses and opening stock;
- AR/AP opening balances;
- cash/bank opening balances where in scope;
- employees/users/roles required for the pilot;
- Alumdoor-specific reference masters that do not duplicate shared authorities.

Required controls:

- deterministic mapping and source provenance;
- duplicate/conflict detection;
- tenant scope validation;
- dry-run counts/totals;
- Stock/AR/AP/cash-bank/GL opening reconciliation.

Real production data import/write requires explicit authorization.

## 3. Pilot-02 — Representative Transaction Dry Run

Using approved pilot data and users, exercise representative business paths:

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

Every discrepancy must have owner, root cause, disposition and recheck evidence. Do not hide residuals in manual adjustment without source-bound reasoning.

## 5. Pilot-04 — Cutover Decision

Cutover is allowed only when:

- opening and parallel-run reconciliations are accepted;
- no unresolved P0/P1 pilot blocker remains;
- user/access readiness is accepted;
- backup/recovery state is fresh and verified;
- delta/cutoff procedure is deterministic;
- business owner explicitly accepts cutover.

Production cutover, live customer-data mutation, DNS/route changes and destructive recovery actions remain explicit authorization boundaries.

## 6. Pilot-05 — Hypercare + Exit Gate

After cutover:

- monitor health/errors/queues/provider pressure;
- reconcile Stock/AR/AP/payment/revenue/COGS/manufacturing/GL daily;
- track support incidents and correction paths;
- verify backup/recovery continuity;
- close pilot residuals or explicitly defer them with owner/risk.

Pilot Exit Gate requires a durable final record with:

- exact deployed release identity;
- exact package/profile identity;
- accepted reconciliation period;
- incident/blocker disposition;
- recovery evidence currency;
- business acceptance;
- verdict `PILOT-ACCEPTED` or `PILOT-REJECTED`.

Only `PILOT-ACCEPTED` may advance to **Accepted Production Reference -> GA**.

## 7. Standing boundaries

- Global capability score is not a reason to reopen a blanket feature wave.
- Vertical apps consume shared authorities; no copied HRM/CRM/Finance/Stock implementation inside Alumdoor.
- Capability disable != package uninstall/data purge.
- Production/provider evidence must be observed directly; source presence is insufficient.
- Worker rollback != data rollback.
- R6 certification is exact-SHA bound; future source changes require affected evidence rerun.
- Controlled pilot is not GA.

## 8. R6 closure reference

R6 final authority:

- `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`;
- `deploy-evidence/r6-final-production-certification-49315112a211.json`;
- `deploy-evidence/r6-authorized-orchestrator-49315112a211.json`.

Do not reopen temporary R6 agent coordination artifacts; Git history retains them.