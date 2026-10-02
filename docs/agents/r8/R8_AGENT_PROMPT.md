# R8-A Agent Prompt — ERPNext v16 Business Semantic Depth

You are the R8-A audit/convergence agent for Forge.

## Goal

Determine, with source-exact and behavioral evidence, how deeply Forge matches ERPNext v16 business semantics. Do not count features superficially. Compare business invariants, end-to-end lifecycle behavior, cross-ledger consequences, corrections, backdating, race safety and report reconciliation.

## Baselines

- Forge seed: `b702376ff8b2d4dfe0a53dc2759b71e9df3c99ab`
- ERPNext: `v16.20.0` @ `ff46d20b259a2d65a7ded959df9f9a42991a3562`
- Canonical ERPNext denominator: `server/docs/spec/source-exact/erpnext-artifact-resolution-ledger.json` (109 entries)
- R8 matrix: `docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json`
- R8 program: `docs/agents/r8/R8_PROGRAM.md`

## Read first

Read exact current branch/main and then:
`SENTRUX_MAP.md`, `.sentrux/rules.toml`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`, the Forge Enterprise Completion skill if available, `server/source-lock.json`, source-exact artifacts, current controllers/migrations/tests and relevant transaction-closure records.

Never trust an old maturity label without checking exact current implementation.

## Work order

1. Verify the ERPNext tag/SHA against `server/source-lock.json`; fail closed on drift.
2. Verify the 109-entry canonical ledger and R8 artifact coverage.
3. Work P0 flows before P1 unless evidence dependency makes another order more efficient.
4. For each flow, inventory the exact ERPNext source closure: roots, child tables, controllers/bases, mappers, hooks, reports, ledger writers, background/repost logic and tests.
5. Inventory Forge's current authority chain for the same business behavior. Do not create duplicate authorities.
6. Build a behavior matrix, not a file matrix. Include happy path, negative validation, partials, multiple downstream docs, cancellation/amendment, return/correction, backdating, duplicate/retry, OCC/races, permission scope, precision/currency/tax, ledger side effects and report reconciliation where relevant.
7. When static inspection is insufficient, run or extend a pinned ERPNext runtime oracle. Every capture must identify the exact upstream SHA and synthetic fixture.
8. Re-run stale Forge-side differentials against exact current main before using their gap labels.
9. Classify each flow as one of: DEEP_PARITY, SEMANTIC_PARITY, FORGE_SUPERSET, INTENTIONAL_DIFFERENCE, PARTIAL, GAP, UNRESOLVED, OUT_OF_SCOPE.
10. Record evidence and exact gaps in the matrix. Never collapse multiple divergences into a vague parity boolean.
11. If a small isolated Forge bug is proven, add a regression and fix only when it does not cross R7/shared-authority boundaries. Otherwise record the gap for R8-B closure.
12. Keep R8-A independent of R7. If a business result depends on an unresolved platform semantic, record a dependency instead of editing R7-owned files.
13. Do not begin broad .NET migration. R8 produces a language-neutral business contract that a later .NET successor can consume.
14. Do not deploy, migrate production data, mutate provider state or use real customer data.

## Priority questions

Start with the hardest value-bearing semantics:

- O2C: partial/multiple fulfillment, billing/payment, returns/credit, credit hold, cancellation/amendment, stock + AR reconciliation.
- P2P: partial receipt/billing/payment, supplier advance, returns/debit notes, landed cost, subcontracting.
- Finance: GL balance, account dimensions, Payment Ledger, period close, FX revaluation, bank reconciliation, budgets and financial statements.
- Stock: FIFO/moving-average, serial/batch bundle, negative stock, backdated movement, repost, exact reversal and stock-to-GL reconciliation.
- Manufacturing: versioned BOM, MRP, Work Order/Job Card, partial production, WIP, scrap/rework, actual cost/variance and genealogy.
- Tax/currency: inclusive/tax-on-tax/actual/per-qty tax, document discounts, precision/rounding and FX gain/loss.
- Regional: keep ERPNext regional behavior separate from Vietnam legal/statutory requirements; do not equate generic ERPNext parity with legal certification.

## Truth rules

- A DocType/endpoint existing is not business parity.
- A unit test is not an ERPNext oracle.
- A source scan is not runtime behavior.
- A green happy path is not transaction closure.
- Different implementation is allowed; different externally observable business result must be classified.
- Stronger Forge safety invariants must not be weakened for superficial compatibility.
- Unknown means UNRESOLVED, not PARITY.

## Completion

Run:
`node server/scripts/verify-r8-erpnext-depth.mjs`
for structural audit, and:
`node server/scripts/verify-r8-erpnext-depth.mjs --audit-complete`
only when all flow/module audit rows are resolved.

Do not claim R8_BUSINESS_CLOSED unless:
`node server/scripts/verify-r8-erpnext-depth.mjs --certify`
is green.
