# TRANSACTION CLOSURE PROGRAM

Date: 2026-08-04
Classification: PROGRAM
Program branch: `rc/transaction-closure-00-control`
Exact base: `main@a99af64b6509477238bc9dc848e226828531b599`
Risk: CRITICAL-dominant
Merge/deploy: approval required for all non-UI worker outputs

## Mission

Close Forge's authoritative enterprise transaction chain end-to-end instead of adding more disconnected feature breadth:

`Sales -> Production -> Inventory -> Delivery -> Finance -> Daily Detailed Ledger -> Warranty/Service`

Also close the matching source-to-pay chain:

`Purchase Request/PO -> Purchase Receipt -> Purchase Invoice -> Supplier Payment -> Return/Adjustment -> AP`

The program must reuse current canonical authorities. It must not introduce shadow stock, shadow AR/AP, shadow cash/bank, shadow GL, client-owned accounting state, or duplicate App Factory/runtime primitives.

## Required sources

Every worker reads, in order:

1. exact branch head and exact current `main`;
2. `skills/forge-enterprise-completion/SKILL.md`;
3. `CURRENT_STATUS.md`;
4. `NEXT_TASKS.md`;
5. `PROJECT_CONTEXT.md`;
6. `AI_HANDOFF.md` where relevant;
7. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
8. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
9. branch-local handoff;
10. exact code, migrations, tests and substantive historical PRs in owned scope.

Code + migrations + tests + exact GitHub state beat stale prose.

## Program invariants

1. `gl_entries` remains financial posting authority where current repository evidence establishes it.
2. Payment Entry/allocation remains settlement authority unless exact current code proves a different canonical path.
3. Canonical stock ledger/valuation path remains inventory authority; WMS is operational orchestration, not a second stock ledger.
4. Manufacturing consumes canonical stock and finance contracts; no competing costing ledger.
5. Returns, cancellation, amendment, reversal, correction and backdate semantics must remain explicit and auditable.
6. Tenant/company/branch/warehouse permissions are server-enforced.
7. Money and valuation semantics remain fixed-point/decimal-safe according to existing contracts.
8. Historical transactions are never silently rewritten where canonical correction/reversal exists.
9. Cross-domain reports are projections/reconciliation views, never a new source of truth.
10. Worker dependencies are expressed as Dependency Requests; workers do not copy another owner's authority to avoid waiting.

## Worker topology

### 01 Sales / Order-to-Cash
Capability focus: `C03-001..C03-024`, `F02-001..F02-018`, relevant `L01` delivery evidence.
Outcome: prove quotation/order -> partial/full delivery -> invoice -> payment/allocation -> return/credit -> cancellation/correction -> customer reconciliation.
Primary owner: CRM/Sales/O2C domain controllers, tests and domain metadata.
Forbidden: canonical GL, generic stock authority, shared runtime/view renderers.

### 02 Manufacturing Closure
Capability focus: `M01-001..M04-010` plus canonical stock/finance integration boundaries.
Outcome: BOM/version -> planning -> Work Order -> material issue/transfer -> FG receipt -> scrap/rework -> actual cost/variance -> genealogy/correction.
Primary owner: manufacturing/QMS domain implementation and tests.
Forbidden: duplicate stock/GL/costing authority.

### 03 Inventory / WMS Closure
Capability focus: `W01-001..W01-032`, `W02-001..W02-014`.
Outcome: reservation -> putaway/picking/packing/transfer -> delivery consumption -> batch/serial -> count freeze -> reconciliation -> backdate/repost -> correction.
Primary owner: inventory/WMS orchestration and stock regressions.
Forbidden: shadow stock balance/valuation ledger, finance ownership.

### 04 Finance Reconciliation + Daily Detailed Ledger
Capability focus: `F01`, `F02`, `F03`, `F04`, `F07`, `V01` evidence required for accounting books.
Outcome: cross-ledger reconciliation across AR/AP/Cash/Bank/Stock valuation/GL and authoritative Daily Detailed Ledger projection with opening + movements + closing + reversal/backdate evidence.
Primary owner: finance/query/report/reconciliation implementation and tests.
Forbidden: altering Sales/Procurement/Stock business authorities except through explicit Dependency Request.

### 05 Procurement / Source-to-Pay
Capability focus: `P01-001..P01-020`, `P02` where required, `F03` integration.
Outcome: request/RFQ/selection/PO -> partial/full receipt -> invoice -> three-way match/variance -> supplier payment/advance -> return/adjustment -> AP reconciliation.
Primary owner: procurement domain controllers, matching/variance and tests.
Forbidden: shadow AP ledger, duplicate stock receipt authority, shared App Factory primitives without WS09 dependency.

### 06 Warranty / After-sales
Capability focus: `C03-021`, `S01-001..S01-015`, `S02-001..S02-013`, traceability from `M04-010` and stock/finance dependencies.
Outcome: delivered customer/item/serial -> warranty eligibility -> claim/ticket -> service order -> parts/replacement/return -> billing/stock/finance effects -> closure and audit.
Primary owner: service/warranty domain implementation and tests.
Forbidden: independent stock/AR/payment sources of truth.

## Dependency graph

```text
CONTROL
  |-- 01 SALES/O2C ----------------------|
  |-- 02 MANUFACTURING ----|             |
  |-- 03 INVENTORY/WMS ----|-------------|--> 04 FINANCE + DAILY LEDGER
  |-- 05 PROCUREMENT ------|-------------|
  |-- 06 WARRANTY/SERVICE <- 01 + 03 ----|
  |
  `--> CONVERGENCE after worker evidence and dependency resolution
```

Workers 01/02/03/05 may run in parallel against existing canonical contracts. Worker 04 audits in parallel but must consume converged evidence rather than inventing missing domain semantics. Worker 06 may implement independent service lifecycle while leaving replacement/return financial integration behind explicit dependencies if required.

## Acceptance gates

All workers are CRITICAL where they mutate or reconcile money/stock/manufacturing authority.

Minimum evidence by applicable scope:

- exact-main drift audit and historical PR classification;
- authoritative happy path;
- partial processing;
- duplicate/retry/idempotency;
- cancellation/amendment/reversal/correction;
- backdate/repost where applicable;
- tenant/company/branch/warehouse permission isolation;
- currency/UOM/rounding/valuation consistency;
- migration replay if schema changes;
- cross-ledger reconciliation before/after correction;
- report/query evidence cannot disagree with authoritative ledger;
- focused regression executable from repository tooling;
- no maturity promotion based only on existence of code.

## Convergence rule

The control branch does not casually absorb workers. Coordinator first audits exact worker heads/diffs, dependency requests, shared hotspots and current-main drift. Final non-UI convergence/merge into `main` requires explicit user approval. No production migration, secret/DNS mutation or customer-data mutation is authorized by this program bootstrap.
