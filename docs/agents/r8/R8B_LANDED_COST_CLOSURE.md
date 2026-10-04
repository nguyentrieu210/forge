# R8-B Landed Cost authority closure

## Disposition

**ERPNext Landed Cost Voucher: PARTIAL, with authoritative FIFO repost closure for the declared boundary.**

Forge has a first-class `Landed Cost Voucher` transaction over the canonical Stock Ledger
and General Ledger. It now covers both untouched receipt inventory and late-arriving landed
cost where part or all of the targeted FIFO receipt layer was already consumed by terminal
`Stock Entry / Material Issue` or submitted `Delivery Note` transactions.

This is still **PARTIAL**, not ERPNext parity. Backdated terminal FIFO Material Issues and
Delivery Notes now receive chronological immutable Stock/COGS corrections. Transfers,
manufacturing/WIP, batch/serial and non-FIFO propagation remain fail-closed. Exact current
contract: `server/docs/spec/r8-landed-cost-chronological-closure.md`.

## Closed in this lane

- Deterministic allocation continues to use the canonical
  `planProcurementLandedCost` / stock allocator; no second allocator was introduced.
- Purchase Receipt Stock Ledger rows carry immutable child-row identity (`source_row_id`).
- A zero-quantity valuation SLE targets the exact Purchase Receipt revision + child row,
  preventing unrelated FIFO layers from absorbing the adjustment.
- Server normalization derives Company/Currency from submitted source receipts and freezes
  the receipt-row allocation plus the stock-history fingerprint used for repost planning.
- For an unconsumed or partly consumed FIFO receipt row, the allocated landed cost is split
  deterministically:
  - the still-open FIFO share remains inventory and posts a targeted zero-quantity SLE plus
    Stock Account GL;
  - the already-consumed share posts to the explicit `repost_difference_account` as a
    historical COGS/expense correction;
  - the complete allocation is balanced against the landed-cost clearing account.
- A fully consumed FIFO source is supported without inventing inventory: it posts no Stock
  Ledger adjustment and sends the full amount to the repost difference account.
- Historical terminal repost accepts submitted `Stock Entry / Material Issue` and submitted
  `Delivery Note` consumers. Transfers, manufacturing/WIP and other value-propagating chains
  still fail closed because their changed value must continue into another inventory layer.
- A voucher before later terminal FIFO Material Issues or Delivery Notes replays each issue prefix and posts
  only the incremental valuation difference. Reserved corrections identify the original
  issue revision/row; replay avoids double application and valuation audit reconciles them.
- D1 validates the frozen item/warehouse history row-count, quantity and value inside the
  Draft -> Submitted transaction. If stock changes after planning, submit aborts and must
  be retried. The in-memory store mirrors this check under its database mutex.
- Source Purchase Receipts cannot be cancelled while a submitted Landed Cost Voucher depends
  on them.
- Cancel reverses the exact committed Stock/GL revision; it does not recalculate allocation
  from current state. GL-only cancellation is supported for a fully consumed source.
- If new downstream stock consumption occurs after an inventory-bearing LCV, cancellation
  remains blocked until full chronological repost exists.
- Negative landed-cost adjustment remains guarded so the target receipt value cannot become
  invalid.

## Canonical authority

No shadow inventory-value or shadow COGS ledger was added.

The authority remains:

`Purchase Receipt -> canonical Stock Ledger -> Landed Cost split -> Stock/expense GL`

For late terminal Material Issue or Delivery Note consumption, the expense correction is append-only GL evidence
owned by the LCV. Existing immutable downstream vouchers are not mutated.

## Race-safety evidence

The submitted allocation freezes:

- `history_row_count`;
- `history_qty_micros`;
- `history_value_minor`;
- source quantity, remaining FIFO quantity, inventory share and consumed share.

Migration `0142_landed_cost_valuation_identity.sql` installs
`landed_cost_history_fingerprint_guard`. It rejects a submit if the canonical stock slice
changed after controller planning.

The in-memory store performs the same check before commit, preserving adapter parity.

## Evidence

- `server/packages/clouderp-erpnext/src/landed-cost-voucher.ts`
- `server/packages/clouderp-stock/src/valuation.ts`
- `server/packages/clouderp-core/src/controllers.ts`
- `server/packages/document-kernel/src/d1-store.ts`
- `server/packages/document-kernel/src/in-memory-store.ts`
- `server/migrations/tenant/0142_landed_cost_valuation_identity.sql`
- `server/tests/landed-cost-authority.test.mjs`
- `server/scripts/test-landed-cost-repost-migration.py`
- R8-B workflow run **37178274784** on exact delivery-repost implementation commit
  `ed9a3b48863f841e9a51c5b57c7bba681e632c2c`:
  server build, Landed Cost controller regressions, SQLite repost race regression,
  all existing R8-B regressions, benchmark invariant and matrix regression passed.

## Executable proofs

The focused evidence proves:

1. Two receipt FIFO layers remain distinct when Landed Cost targets only one row.
2. Untouched inventory receives the exact targeted valuation delta and balanced GL.
3. A 50%-consumed FIFO row splits landed cost 50/50 between inventory and repost expense.
4. Missing `repost_difference_account` fails before commit when a consumed share exists.
5. A fully consumed FIFO row posts the complete landed cost to repost expense with no fake
   Stock Ledger value and cancels exactly.
6. Backdating before direct FIFO Material Issue or Delivery Note consumption produces balanced,
   reconciled chronological corrections. Unsupported value-propagating chains still fail closed.
7. A stock mutation between planning and commit is rejected by the D1 fingerprint guard.
8. Purchase Receipt cancellation remains blocked behind an active LCV dependency.
9. Exact LCV cancellation restores the committed stock/GL effect without recomputation.

## Remaining boundary

The next Landed Cost depth step is **full chronological valuation repost** across future
stock-value propagation. Remaining cases include:

- broader issue/cancellation chains and rollback after subsequent stock mutations;
- warehouse transfers where changed value must propagate to the destination layer;
- manufacturing/WIP and finished-goods valuation propagation;
- Moving Average historical replay;
- wider ERPNext-exact runtime differential fixtures.

Forge supports past and future terminal FIFO Material Issue and Delivery Note cost corrections without
rewriting other documents. Chronological cancellation requires unchanged external history,
including immutable rows from a later voucher subsequently cancelled. Migration 0161
checks the complete history horizon on submit and chronological cancel.

That boundary is narrower than ERPNext v16.20.0, so the R8 classifications remain
`PARTIAL`.
