# R8-A Initial Findings

This file records only findings supported by current-main evidence at branch creation. It is deliberately conservative.

## Baseline integrity

- Forge `server/source-lock.json` pins ERPNext `v16.20.0` to full SHA `ff46d20b259a2d65a7ded959df9f9a42991a3562`.
- The official ERPNext tag ref resolves to the same commit.
- The canonical source-exact ERPNext artifact ledger declares 109 entries across 11 modules.
- R8 reuses that ledger rather than inventing another source denominator.

## Existing Forge evidence worth reusing

- O2C has committed source-exact/runtime/differential oracle evidence plus a later transaction-closure pass.
- Transaction-closure records exist for Sales/O2C, Manufacturing, Inventory/WMS, Finance, Procurement and Warranty/Service.
- The v0.9 feature matrix explicitly avoids full ERPNext parity claims and distinguishes Hardened/Beta/Foundation/Missing areas.
- Current evidence therefore supports starting with one conservative flow classification: O2C = PARTIAL. All other whole-module/whole-flow parity claims remain UNRESOLVED until R8 reads exact current code and pinned upstream behavior.

## Why O2C is only PARTIAL at R8 start

The existing ERPNext oracle/differential record contains real behavior comparison, but it also records non-zero divergences/missing behavior and predates later Forge stock/finance/manufacturing closure work. The Sales transaction-closure record additionally keeps credit-limit/hold, fully-paid refund policy and stock-valuation reconciliation as explicit dependencies.

R8 must re-run or re-map this evidence against exact current main before promoting the classification.

## First audit order

1. Reconcile O2C oracle captures against current main.
2. Build P2P runtime oracle with the same evidence quality.
3. Close finance + stock shared invariants because they determine both O2C/P2P and manufacturing truth.
4. Compare manufacturing planning/execution/costing.
5. Resolve remaining P1 modules and regional/statutory boundary.

No production code should be broadly changed in R8-A merely to improve a score.
