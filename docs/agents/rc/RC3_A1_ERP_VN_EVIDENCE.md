# RC3-A1 — ERP Authority & Vietnam Compliance Evidence

Date: **2026-08-04**  
Agent: **RC3-A1**  
Branch: `agent/rc3-01-erp-vn-evidence`  
Exact seed / audited main: `98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`  
Program control: `program/rc3-exact-main-release-confidence-20260804`  
Risk: **CRITICAL audit boundary**  
Runtime/schema mutation by A1: **NONE**  
Production deploy/migration by A1: **NONE**

## 1. Mission and decision rule

This lane re-audits the ERP transaction authority on exact current `main` after Finance/Vietnam convergence, Transaction Closure, HCM/payroll convergence and WS09 Batch Productization.

Owned capability families:

- Finance: `F01..F07`;
- Vietnam: `V01..V04`;
- Procurement: `P01..P02`;
- Inventory/WMS: `W01..W02`;
- Manufacturing/QMS: `M01..M04`, `Q01`;
- HCM/payroll: `H01..H06` and directly coupled payroll statutory evidence.

Maturity is evidence-driven:

1. exact current source/migration beats stale handoff prose;
2. authored test source is not executable PASS;
3. an exact integrated CI run can justify `RC` for the capabilities directly exercised by that run;
4. `Hardened` requires production/release/failure/reconciliation evidence and is not granted here;
5. statutory capabilities additionally require official-source, effective-date and legal-rule evidence; code alone is insufficient.

## 2. Exact-main evidence chronology

### 2.1 Finance + Vietnam convergence

Canonical current-main Finance/VN recut came through PR `#367`, merge commit `d59108d4818109c9233be545cded1be3376f8fae`.

Important truth:

- stale WS01 migration reservation `0048..0057` was superseded;
- canonical recut uses `0089..0098`;
- old `#312` is superseded and must not be merged/replayed;
- the convergence head itself had **no PR workflow run**, so its VN statutory/budget source cannot be promoted to RC merely because it merged.

Current-main source includes the canonical `0042_vn_accounting_period_hardening.sql` lineage plus later Finance/VN recut migrations.

### 2.2 HCM/payroll convergence

Canonical current-main HCM/payroll convergence came through PR `#414`, merge commit `6d288971d1e9454df2eb9098929ce2c82b0d7828`.

Important truth:

- old WS06 migration numbers `0043..0048` are stale handoff history;
- canonical current-main recut uses `0099..0104`;
- `#322` and `#372` were superseded by `#414`;
- no pull-request workflow run is observable for the exact convergence commit;
- statutory payroll evaluator source is deterministic/versioned, but numeric Vietnam rules/caps intentionally remain fail-closed until clause-level official-source verification.

Therefore HCM/payroll implementation depth is real, but no broad RC promotion is justified by convergence prose alone.

### 2.3 Transaction Closure

Canonical merged Transaction Closure commit: `2b1d088c353bd2c15cd6bc2a74b342c98df1dcf7`.

Validated candidate evidence:

- run `30847056639`;
- job `91797832548`;
- exact integrated candidate validation;
- Sales/O2C: **45/45 PASS**;
- Manufacturing: **56/56 PASS**;
- Inventory/WMS/valuation: **38/38 PASS**;
- Finance Daily Ledger/cross-ledger/AP/aging: **33/33 PASS**;
- Procurement/P2P: **30/30 PASS**;
- Warranty/service: **19/19 PASS**;
- total focused Node regressions: **221/221 PASS**;
- repository SQL/platform schema validation: PASS;
- RC-020 Finance posting/period controls: PASS;
- AP reconciliation / Payment Allocation migrations: PASS;
- RC-023 Cash/Bank reconciliation: PASS;
- Manufacturing-QMS package gate: PASS;
- Procurement package gate: PASS;
- exact authority-diff classification: PASS.

Transaction Closure preserves one authority per ledger:

- `gl_entries` = financial book authority;
- `payment_ledger_entries` = AR/AP settlement/allocation authority;
- `stock_ledger_entries` = stock quantity/value authority;
- no shadow GL, payable, receivable, stock or valuation ledger was introduced.

### 2.4 WS09 Batch Productization

Current main ends at WS09 merge commit `98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`.

Final exact convergence candidate: `ec0ae2f2269fd560b3636aa5671b39b2de7a8fcb`.

Exact workflow:

- run `30860236052` — **SUCCESS**;
- job `91840404067` — **SUCCESS**.

Executed evidence includes:

- Shared BatchAction/executor: **23/23 PASS**;
- Inventory critical regressions: **16/16 PASS**;
- Manufacturing BOM regressions: **18/18 PASS**;
- batch replay migration: PASS;
- SQL repository validation: PASS;
- first-class client input-table regression: **4/4 PASS**;
- production runtime build: PASS.

Inventory-specific executed evidence includes frozen snapshot identity/order, bounded batch rows, side-effect-free preview, canonical save, trusted tenant/actor rejection, positive/negative/zero variance, exact cancel/reversal and period/separation-of-duties guards.

BOM-specific executed evidence includes one canonical Draft, exact replay without duplicate create, tenant rejection, same-revision conflict failure, Active revision overwrite rejection, stable revision/fingerprint, parent/child rows and bounded 500-row input.

The WS09 job also reports pre-existing full-server TypeScript debt outside the changed WS09 authority, including `manufacturing-mrp.ts`, QMS optional-property typing, App Registry and Frappe-model paths. These are baseline debt, not a green global typecheck.

## 3. Capability promotion candidates for A0

These are **recommendations for the RC3 convergence owner**. A1 does not rewrite the global capability registry directly.

### 3.1 Finance — recommend RC

#### F01 posting / period / audit slice

Recommend `RC`:

- `F01-003` Journal Entry;
- `F01-007` Accounting Period;
- `F01-008` Soft Close;
- `F01-009` Hard Lock;
- `F01-010` Adjustment Entries;
- `F01-014` Trial Balance;
- `F01-015` General Ledger report;
- `F01-022` Branch accounting scope;
- `F01-024` Immutable Posting Trace;
- `F01-025` Reversal / Correction Semantics.

Evidence: RC-020 authority is present on current main and the integrated Transaction Closure validation executes the period/posting/reversal controls. GL remains append-only and source/tenant/company/branch scoped.

Do **not** promote year-end close/retained earnings `F01-011..013`. The canonical company/branch/account/date aggregate needed for safe automated close is still incomplete. Do not promote all accounting dimensions from branch-only evidence.

#### F02 AR settlement / reconciliation slice

Recommend `RC`:

- `F02-001` Customer Account;
- `F02-002` Sales Invoice posting;
- `F02-003` Customer Advance;
- `F02-005` Payment Allocation;
- `F02-006` Partial Payment;
- `F02-007` Overpayment/explicit residual advance behavior;
- `F02-008` Credit Note / return correction;
- `F02-012` AR Aging;
- `F02-013` Customer Statement;
- `F02-017` Customer Reconciliation;
- `F02-018` Multi-currency receivable settlement evidence.

Keep installment schedule, first-class debit-note/write-off/bad-debt and unrelated credit-control breadth at their existing maturity.

#### F03 AP settlement / reconciliation slice

Recommend `RC`:

- `F03-003` Supplier Advance;
- `F03-006` Partial Supplier Payment;
- `F03-007` Supplier Credit/Debit Adjustment;
- `F03-008` AP Aging;
- `F03-009` Supplier Statement;
- `F03-010` Supplier Reconciliation.

Keep `F03-001/002` at current status under conservative evidence policy even though they are strong canonical foundations. Keep payment request/schedule, withholding and payable forecast unchanged.

#### F04 cash / bank control slice

Recommend `RC`:

- `F04-001` Cash Account;
- `F04-002` Bank Account;
- `F04-003` Payment Entry;
- `F04-004` Cash Receipt/Payment;
- `F04-005` Warehouse/Petty Cash;
- `F04-006` Cash Transfer;
- `F04-008` Statement Import — generic provider-neutral boundary only;
- `F04-009` Bank Transaction;
- `F04-010` Manual Reconciliation;
- `F04-011` Auto Matching — deterministic read-only proposal path;
- `F04-012` Partial Reconciliation;
- `F04-013` Reversible Reconciliation.

Keep `F04-014` Bank Feed Connector at Foundation until a concrete provider adapter exists. Keep payment batch, treasury dashboard/cash forecast and other breadth unchanged. `F04-019` has strong GL-derived backend evidence but should not be promoted until the canonical query/product surface is proven end-to-end.

### 3.2 Procurement — recommend RC for executed P2P closure

Recommend `RC`:

- `P01-011` Purchase Invoice;
- `P01-013` Partial Receipt;
- `P01-014` Partial Invoice;
- `P01-017` Three-Way Match;
- `P01-018` Quantity Variance;
- `P01-019` Price Variance.

This includes a `Missing -> RC` candidate for `P01-019` because the current-main implementation is not merely source-present: the exact Transaction Closure candidate executed the P2P closure matrix and variance hold-before-commit semantics.

Keep `P01-016` Landed Cost at Foundation: allocation math/orchestration exists, but authoritative Inventory-owned stock-value application, reversal and reconciliation are still missing. Keep ambiguous duplicate same-item/split-price PO allocation below Hardened until row-level allocation identity is authoritative.

No broad `P02` promotion is supported by the closure evidence.

### 3.3 Inventory/WMS — recommend RC for stock authority slices

Recommend `RC`:

- `W01-011` Stock Reconciliation;
- `W01-013` FIFO valuation;
- `W01-014` Moving Average valuation;
- `W01-022` Valuation Adjustment.

`W01-011` has two independent exact integrated evidence layers: Transaction Closure plus WS09 final convergence. The WS09 exact run proves side-effect-free preview, one canonical save, replay protection, frozen snapshot, variance behavior, tenant/actor rejection, exact cancellation/reversal and accounting-period/separation-of-duties controls.

Keep `W01-023` Backdated Stock and `W01-024` Repost/Replay at their current maturity for the **full capability** because historical downstream COGS/expense restatement is not yet universally mapped, even though the stock-side replay/repost path is strong.

Keep WMS planning primitives at Foundation/Wired according to current registry. In particular:

- `W02-004` persisted Putaway Task remains a gap;
- `W02-013` Warehouse Task assignment remains a gap;
- `W02-009` Cycle Count and `W02-014` Count Freeze/Snapshot reuse Stock Reconciliation and have stronger evidence, but dedicated WMS workflow completion is not sufficient for a blanket RC claim;
- full mobile scanner product evidence remains shared frontend/server-action work.

### 3.4 Manufacturing/QMS — recommend RC for exact BOM and production/correction core

Recommend `RC` for BOM lifecycle:

- `M01-001` BOM;
- `M01-002` BOM Components;
- `M01-003` Multi-Level BOM behavior;
- `M01-004` BOM Version;
- `M01-005` Effective-Date BOM selection.

Evidence: Transaction Closure Manufacturing 56/56 plus WS09 BOM 18/18 exact execution, including version selection, canonical Draft creation, conflict/Active-revision protection, replay/idempotency, tenant protection and deterministic parent/child input.

Recommend `RC` for guarded shop-floor transaction core:

- `M03-001` Work Order;
- `M03-003` Material Issue/Transfer for Manufacture;
- `M03-004` Finished Goods Receipt;
- `M03-005` Partial Production;
- `M03-006` Excess/Short Material Guard;
- `M03-007` Scrap/Recovery value conservation;
- `M03-008` Manufacturing Cancel/Reversal/Correction.

Do **not** promote:

- `M03-009` Rework — business operating model unresolved;
- `M03-010` Subcontract Manufacturing — procurement/material-send/return/valuation contract incomplete;
- broad `M04` actual cost/variance posting — current operation/labor/machine/overhead evidence is read-only / `NOT_POSTED` where Finance authority is not defined;
- full historical valuation restatement across Stock -> Finance.

`Q01` has package/regression evidence but A1 found no need to over-promote the family from package success alone. Preserve current QMS statuses; baseline TypeScript debt also remains in QMS controllers.

## 4. Vietnam statutory evidence — no RC promotion from source-only convergence

### V01 accounting regime / TT99

Current main contains versioned legal-rule source evidence, TT99 account mapping, voucher/book/financial-statement registries, effective-date controls, four-eyes approval and immutable submitted records.

However, Finance/VN convergence commit `d59108d...` has no exact PR workflow run. Preserve current registry maturity (`Wired`/`Foundation` by ID). Do not convert WS01 prose such as “RC foundation” into canonical RC without executable legal-pack validation on the exact current candidate.

### V02 VAT/CIT/PIT tax rules

Deterministic fixed-point ruleset evaluator, source hash, effective date, legal-rule binding and test vectors exist. Filing datasets and broader tax lifecycle remain incomplete; exact convergence CI is absent.

Preserve current `Foundation/Missing` distribution. No RC promotion.

### V03 payroll statutory

The WS06 evaluator is deterministic and effective-date/source aware, but official 2026 numeric PIT/BHXH/BHYT/BHTN rates/caps were intentionally not promoted without clause-level source verification. The exact current-main HCM convergence commit has no observable PR workflow run.

Preserve current `Wired` status for `V03-001..010`. Do **not** promote to RC yet.

### V04 e-invoice / tax authority / signature

Canonical `E-Invoice Submission` owns the evidence boundary; legal/ruleset/lineage/hash/provider fields exist. Provider transport, signing, retry/idempotent submission and status synchronization remain Integration-owned dependencies.

Preserve current Foundation/Missing statuses. No RC promotion.

## 5. HCM/payroll evidence — deep source, exact execution still missing

Current-main HCM source covers organization/workforce, recruitment, lifecycle, attendance/geofence, payroll inputs, benefits, loans, bank batch, statutory evaluator, performance/talent/training.

Do not promote HCM broadly to RC because:

- exact convergence commit `6d288971...` has no PR workflow run;
- sensitive employee/ESS privacy still depends on shared IAM/frontend contracts;
- payslip/ESS/LMS product surfaces remain partial;
- employee-loan termination treatment is a genuine business-policy edge case;
- payroll legal numeric fixture promotion remains source-verification gated.

Preserve the current canonical registry distribution:

- most implemented H01-H06 capabilities: `Wired`;
- public career/CV attachment extraction/ESS/payslip portal gaps: current Foundation where applicable;
- LMS end-to-end remains Missing where currently recorded.

A future HCM exact-head CRITICAL validation lane may promote scoped IDs; A1 does not infer that PASS from authored test files.

## 6. Stale/superseded claim cleanup

A0 should treat the following as historical evidence, not current release truth:

1. WS01 `#312` and its `0048..0057` migration numbering — superseded by `#367` / canonical `0089..0098`.
2. WS06 `#322/#372` and old `0043..0048` numbering — superseded by `#414` / canonical `0099..0104`.
3. historical `fix/vn-accounting-period-integrity-20260803-r8` active-language — period hardening is already canonical current-main evidence and later RC-020/Transaction Closure evidence supersedes branch-status prose.
4. early WS09 A5 checkpoints saying final convergence was absent/failed — superseded by exact final run `30860236052` SUCCESS and current-main merge `98b5e1b...`.
5. worker statements that tests were `NOT RUN` before Transaction Closure convergence — superseded only for the exact tests actually executed by run `30847056639`; do not generalize that success to unrelated statutory/HCM tests.

Open-PR audit at A1 finalization found no substantive open WS01 Finance/VN, WS06 HCM/payroll, or Transaction Closure Finance/Procurement/Inventory/Manufacturing PR that should replace current-main authority.

## 7. Remaining release blockers / follow-up tasks

Priority ERP/VN gaps for RC3 backlog:

1. **Finance close aggregate:** canonical company/branch/account/date aggregate for automated close, retained earnings, budget-vs-actual, FX revaluation and consolidation.
2. **VN statutory exact validation:** run Finance/VN legal-rule, TT99, tax and e-invoice migration/evaluator fixtures on an exact current candidate; retain official-source/effective-date evidence.
3. **Payroll legal freeze:** clause-verify official Vietnam PIT/BHXH/BHYT/BHTN numeric fixtures and execute exact-head statutory payroll regression before V03 RC.
4. **E-invoice provider:** provider adapter + signing + retry/idempotency + authority-status synchronization; no fake provider evidence.
5. **Landed cost:** Inventory-owned authoritative application to stock valuation, exact reversal and Stock/GL reconciliation for `P01-016` / `W01-021`.
6. **Historical COGS restatement:** map downstream outgoing-stock valuation changes to exact Finance correction/repost semantics before full `W01-023/024` closure.
7. **WMS task orchestration:** persisted Warehouse Task, evidence-backed reservation consumption, putaway/pick completion and mobile scanner server-action integration.
8. **Manufacturing remaining depth:** rework business model, subcontract lifecycle, posted labor/machine/overhead and manufacturing variance accounting.
9. **HCM exact validation:** exact-head build/typecheck/regression/migration/permission/tenant validation plus privacy/ESS boundary before scoped RC promotion.
10. **Repository baseline type debt:** resolve pre-existing `manufacturing-mrp`, QMS, App Registry and Frappe-model strict TypeScript errors rather than treating changed-source classification as a full-server green build.
11. **AR/AP due-date hard cutover:** preserve explicit fallback evidence until Sales/Purchase Invoice due-date contracts are first-class for all new submissions.
12. **No Hardened without production evidence:** no A1-owned ERP/VN capability receives Hardened from these CI runs alone.

## 8. A1 completion record

Exact seed: `98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`  
Exact main rechecked before finalization: **unchanged at the seed**  
A1 runtime changes: **none**  
A1 schema/migrations: **none**  
A1 tests executed: **none locally; audit-only lane**  
Inherited exact executable evidence consumed: Transaction Closure run `30847056639` / job `91797832548`; WS09 run `30860236052` / job `91840404067`  
Finance/VN exact convergence workflow evidence: **none observed**  
HCM/payroll exact convergence workflow evidence: **none observed**  
Open substantive replacement PRs in owned domains: **none found at final audit checkpoint**  
Recommended Hardened promotions: **none**  
Production deployment/migration: **none**

Disposition: **A1 evidence complete; ready for A0 global capability-status convergence.**
