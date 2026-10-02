# R8-B Landed Cost authority closure

## Disposition

**ERPNext Landed Cost Voucher: PARTIAL, with authoritative safe-path closure.**

R8-B no longer stops at allocation/preview evidence. Forge now has a first-class
`Landed Cost Voucher` transaction that posts to the canonical Stock Ledger and
General Ledger, and cancels by exact reversal of the committed revision.

It remains **PARTIAL**, not parity, because historical downstream COGS/SLE-GLE
reposting after already-consumed or backdated inventory is intentionally fail-closed.

## Closed in this lane

- Deterministic allocation continues to use the existing canonical
  `planProcurementLandedCost` / stock allocator; no second allocator was introduced.
- Every Purchase Receipt stock posting now carries an immutable receipt child-row
  identity (`source_row_id`).
- A zero-quantity valuation SLE can name the exact source voucher revision + receipt
  row it adjusts. FIFO replay applies the adjustment only to those source layers,
  rather than smearing value across unrelated open FIFO layers.
- `Landed Cost Voucher` server normalization derives Company/Currency from submitted
  source receipts and stores server-owned allocation evidence.
- Submit posts:
  - targeted zero-quantity Stock Ledger value adjustments;
  - balanced debit to the source receipt Stock Account;
  - balanced credit/debit to the configured landed-cost clearing account.
- Source Purchase Receipts cannot be cancelled while an active submitted Landed Cost
  Voucher depends on them.
- Cancel reads the exact submitted voucher revision from Stock/GL and sign-reverses
  those committed rows; it does not recalculate the allocation from current state.
- Negative landed-cost adjustment is allowed only while the target receipt row remains
  non-negative in value.
- If stock consumption exists downstream of a target receipt row, submit fails closed
  with an explicit historical COGS repost requirement.
- If downstream stock consumption occurs after a Landed Cost Voucher, cancellation
  likewise fails closed rather than silently changing historical COGS.

## Canonical authority

No shadow inventory-value table was added.

The authority remains:

`Purchase Receipt -> canonical Stock Ledger -> targeted Landed Cost SLE -> GL`

The schema extension only carries immutable source/target identity on
`stock_ledger_entries`. It does not create a second balance or valuation store.

## Evidence

- `server/packages/clouderp-erpnext/src/landed-cost-voucher.ts`
- `server/packages/clouderp-stock/src/valuation.ts`
- `server/packages/clouderp-core/src/controllers.ts`
- `server/packages/document-kernel/src/d1-store.ts`
- `server/packages/document-kernel/src/in-memory-store.ts`
- `server/migrations/tenant/0142_landed_cost_valuation_identity.sql`
- `server/tests/landed-cost-authority.test.mjs`
- R8-B workflow run **36966776608**:
  TypeScript build, Subcontracting regression, all three Landed Cost regressions,
  R8 benchmark invariant and matrix regression passed.

## Executable proofs

The focused regression proves:

1. Two FIFO receipt layers remain distinct when Landed Cost targets only the second
   receipt row; issuing the first layer retains its original cost.
2. Stock-value delta and GL debit/credit reconcile exactly.
3. Purchase Receipt cancellation is blocked while the active LCV depends on it.
4. Exact LCV cancellation restores stock value without recomputation.
5. A receipt that already has downstream stock consumption cannot be capitalized by
   the current safe path; the draft remains editable and no ledger rows commit.
6. An LCV that later acquires downstream consumption cannot be cancelled without the
   historical repost capability.

## Remaining boundary

The next depth step is **historical downstream valuation repost**: when a landed-cost
change belongs before already-posted issues/transfers/manufacturing/deliveries, Forge
must deterministically recompute future SLE valuation and reconcile the corresponding
COGS/expense GL chain. R8-B does not fabricate that behavior.

Until that exists, the explicit business rule is:

> Landed Cost may apply/reverse authoritatively only when doing so cannot require a
> historical downstream COGS/SLE-GLE restatement.

That boundary is narrower than ERPNext v16.20.0, so the R8 classifications stay
`PARTIAL`.
