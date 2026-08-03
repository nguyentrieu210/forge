# Transaction Closure 07 — Coordinator Convergence

Status: ACTIVE
Owner: coordinator
Risk: CRITICAL
Base: `main@fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`
Branch: `rc/transaction-closure-07-convergence`

## Mission

Converge Closure-01..06 onto one exact-current-main candidate, resolve cross-worker dependencies without creating competing authorities, execute one integrated CRITICAL validation matrix, and classify every worker `READY / BLOCKED / DEFERRED` before any main merge decision.

## Intake order

1. Closure-02 Manufacturing — proven focused 56/56 validation.
2. Closure-03 Inventory/WMS — stock authority dependency for downstream flows.
3. Closure-04 Finance/Daily Ledger — reconciliation/read-model authority after stock.
4. Closure-01 Sales/O2C — consume Stock/Finance boundaries.
5. Closure-05 Procurement/P2P — consume Inventory/Finance boundaries.
6. Closure-06 Warranty/Service — consume Sales/Stock/Finance evidence.

Order is convergence/validation order, not a claim that disjoint workers could not execute independently.

## Shared authority invariants

- `gl_entries` remains financial book authority.
- `payment_ledger_entries` remains AR/AP settlement-allocation authority.
- `stock_ledger_entries` remains stock quantity/value authority.
- Sales and Procurement do not create shadow Stock/GL/AR/AP ledgers.
- Manufacturing consumes canonical Stock execution and does not own a competing costing ledger.
- Warranty/Service stores provenance only; authoritative Stock/Sales/Finance effects stay in their canonical domains.
- Existing tenant, permission, accounting-period, idempotency, reversal/correction and immutable-history guards must remain fail-closed.

## Integrated CRITICAL gate

Before main merge decision:

- exact integrated diff audit against current main;
- locked dependency install;
- changed-source TypeScript/build gate with exact-main baseline debt classification;
- focused Sales/O2C regressions;
- focused Manufacturing regressions;
- focused Inventory/WMS/valuation regressions;
- focused Finance/Daily Ledger/reconciliation regressions;
- focused Procurement/P2P regressions;
- focused Warranty/Service regressions;
- tenant/permission isolation where affected;
- failure/retry/idempotency;
- correction/reversal/backdate paths;
- cross-ledger reconciliation assertions;
- no production operation.

## Decision states

- `READY`: integrated source + required focused evidence pass and no unresolved blocking dependency.
- `BLOCKED`: required correctness/validation dependency remains unresolved.
- `DEFERRED`: valid long-tail or business decision explicitly outside this closure scope; does not invalidate the declared narrower closure.

## Merge boundary

Internal worker-to-convergence merges are coordination-only and do not change `main` or production. Final non-UI merge to `main` and any deployment remain approval-required.

## Completion record

Pending integrated intake and validation.
