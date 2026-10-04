# R8-A — ERPNext v16 Business-Depth Benchmark

Status: CLOSED — BENCHMARK + BOUNDED HARDENING ROUND  
Base Forge commit: `b702376ff8b2d4dfe0a53dc2759b71e9df3c99ab`  
Pinned upstream: ERPNext `v16.20.0` @ `ff46d20b259a2d65a7ded959df9f9a42991a3562`

## Mission

R8-A measures how deep Forge business behavior is relative to the pinned ERPNext v16 baseline. It runs in parallel with R7 and does not wait for R7 platform certification.

R7 asks whether Forge's platform/runtime semantics are sufficient and truthfully mapped to Frappe 16. R8 asks whether the business system built on top of that platform has the same depth of transactional invariants, lifecycle behavior, accounting/stock consequences, correction semantics and end-to-end closure as ERPNext.

R8 is not a source-code clone program and it is not a .NET migration program.

## Non-negotiable boundaries

1. Reuse `server/source-lock.json` and the canonical 109-entry ERPNext artifact ledger. Do not create a competing artifact inventory.
2. Pin all upstream claims to ERPNext `v16.20.0` / `ff46d20b259a2d65a7ded959df9f9a42991a3562`.
3. Exact current code, migrations and tests override stale prose or old PR labels.
4. R8-A is audit/benchmark first. Record gaps instead of broadening immediately into production implementation.
5. Do not edit R7-owned files or reinterpret Frappe platform semantics. Raise a dependency when business evidence depends on an unresolved R7 behavior.
6. Preserve Forge authorities: Document Kernel, tenant isolation, OCC/idempotency, immutable audit/outbox, canonical GL, Payment Ledger and Stock Ledger. Never create a shadow ledger just to imitate ERPNext internals.
7. No production deploy, data migration, provider mutation or customer-data access.
8. No blanket "ERPNext parity" claim from feature presence. Behavioral evidence is mandatory.

## Denominators

R8 has two simultaneous denominators:

- **Breadth denominator:** every one of the 109 declared ERPNext artifacts must appear exactly once through the module coverage in `R8_BUSINESS_DEPTH_MATRIX.json`.
- **Depth denominator:** 18 end-to-end business flows must be resolved with evidence.

The artifact denominator prevents missing breadth. The flow denominator prevents a shallow "we have the DocType" audit.

## Classification

Allowed dispositions:

- `DEEP_PARITY` — pinned ERPNext behavior is reproduced across lifecycle, side effects, corrections and reports for the declared scope.
- `SEMANTIC_PARITY` — implementation differs but the declared observable business contract matches.
- `FORGE_SUPERSET` — Forge intentionally provides a stronger behavior while preserving required ERPNext outcomes.
- `INTENTIONAL_DIFFERENCE` — documented architecture/business-policy difference with an explicit compatibility boundary.
- `PARTIAL` — meaningful behavior exists but important ERPNext depth is missing or unproven.
- `GAP` — required business behavior is absent.
- `UNRESOLVED` — not yet audited deeply enough to classify.
- `OUT_OF_SCOPE` — allowed only with a reviewed rationale.

## Depth dimensions

A flow is not closed by a happy path. Where applicable, compare:

- create/update/submit/cancel/amend;
- partial and multiple downstream documents;
- over/under fulfillment, receipt, billing and allocation;
- returns, credit/debit corrections and exact reversal;
- backdated/effective-date behavior and repost;
- fixed-point precision, UOM, currency, rounding and FX;
- taxes, discounts and pricing-rule precedence;
- GL, Payment Ledger and Stock Ledger consequences;
- serial/batch/expiry/valuation/genealogy;
- permissions, tenant/company/warehouse/branch boundaries;
- duplicate retry, idempotency, OCC and race behavior;
- failure atomicity and recovery;
- report/reconciliation equivalence;
- import/background side effects where business-significant.

## Oracle rule

Static source can establish code paths, but business equivalence requires runtime evidence when behavior depends on controller composition, hooks, defaults, generated accounting/stock entries, rounding, reports or database state.

Each oracle case must record the ERPNext SHA, fixture identity, initial state, actor, operation, expected success/error, resulting document state and all business-significant side effects.

Existing committed O2C oracle evidence may be reused only after checking whether its Forge-side mapping is stale relative to exact current main.

## Lanes

- R8-00 CONTROL — source lock, denominator, verifier, evidence discipline
- R8-01 O2C / customer settlement
- R8-02 P2P / supplier settlement
- R8-03 Finance / GL / close / bank
- R8-04 Pricing / tax / currency
- R8-05 Stock / valuation / serial-batch / WMS
- R8-06 Manufacturing / MRP / shop floor / costing
- R8-07 Subcontracting
- R8-08 Assets / Projects
- R8-09 Quality / Support
- R8-10 POS / commerce
- R8-11 Regional / statutory
- R8-12 Convergence / certification

## Exit gates

`R8_BENCHMARK_COMPLETE` may be claimed only when:

- source lock matches the matrix baseline;
- all 109 canonical ERPNext artifacts are covered exactly once in module coverage;
- every one of the 18 flow rows is present exactly once;
- `UNRESOLVED = 0`;
- each non-unresolved classification has concrete Forge + upstream/oracle evidence;
- every `OUT_OF_SCOPE` has explicit rationale.

`R8_BUSINESS_CLOSED` is a stronger future gate and additionally requires `PARTIAL = 0` and `GAP = 0`.

R8-A should aim first for a truthful benchmark, not fabricate closure.

## Final closure — 2026-10-04

The R8 round is closed as a **benchmark plus bounded hardening program**.

- `R8_BENCHMARK_COMPLETE = true`: 109/109 pinned ERPNext artifacts are covered, all 11 module rows and 18 flow rows are resolved, and `UNRESOLVED = 0`.
- R8-B implemented and regression-tested high-value Finance, O2C/P2P, stock, manufacturing and subcontracting hardening recorded in the R8-B evidence files.
- The final R8-B head preserves the already certified R7 platform behavior; the cross-program Frappe facade regression is green again after correcting migration 0168 to emit a JSON boolean for `read_only`.
- `R8_BUSINESS_CLOSED = false` remains a truthful compatibility indicator because 29 module/flow rows are still `PARTIAL`. R8 closure does **not** mean full ERPNext parity.
- Remaining PARTIAL work has moved to GitHub issue #997 and may only leave PARTIAL through implementation/evidence or an explicit reviewed product-scope decision.
- No production deploy, production migration, provider mutation or customer-data mutation is included in this closure.

Closing the round means the benchmark and selected hardening are no longer kept as an open branch program. It does not erase or relabel the measured gaps.
