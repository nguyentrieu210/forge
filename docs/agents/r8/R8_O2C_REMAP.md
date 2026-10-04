# R8-A — O2C Exact-Current Remap

Status: P0 lane audited to PARTIAL; deeper differential replay still required  
Forge branch: `codex/r8-erpnext-business-depth`  
Forge seed/main baseline: `b702376ff8b2d4dfe0a53dc2759b71e9df3c99ab`  
Pinned ERPNext: `v16.20.0` @ `ff46d20b259a2d65a7ded959df9f9a42991a3562`

## Purpose

This pass re-reads the committed ERPNext O2C oracle against exact current Forge source instead of inheriting old gap labels.

The ERPNext runtime capture remains valid, but several old Forge-side conclusions are stale because later Forge work implemented those authorities. R8 separates stale evidence from live divergences.

## Oracle evidence that remains valid

`ORACLE_REPORT.json` records 115/115 ERPNext captures, 48 differential passes and 67 captured fixtures with classified divergence on the pinned Frappe 16.19.0 / ERPNext 16.20.0 bench.

`EVIDENCE_BUNDLE.md` records core O2C, advanced tax, multi-currency, valuation, repost and batch/serial runner families.

The small aggregate `oracle/differential/differential-report.json` is a stale intermediate artifact: it still reports `erpnext_captured = 0` and highest claim `CLOUDFORGE_MAPPED`, while the later canonical report/bundle records the complete 115 capture. R8 does not use that stale aggregate as current truth.

## Stale gap conclusions

### Valuation

Old prose says Forge has no valuation engine. Exact current source has FIFO and Moving Average server-ledger valuation, replay, outgoing derivation, batch-aware valuation and bounded repost/value-adjustment support.

That old conclusion is stale.

The pinned ERPNext oracle also covers LIFO. Current Forge's `ValuationMethod` is only `FIFO | Moving Average`. Transaction convergence additionally leaves broader historical COGS/expense restatement deferred.

Disposition: **R8-F07 = PARTIAL**.

### Serial and Batch Bundle

Old prose says Forge has no Serial-and-Batch-Bundle model. Exact current source now validates submitted bundles, enforces single use, serial quantity/uniqueness, tracked availability and per-batch outgoing valuation.

That old conclusion is stale.

A live semantic divergence remains:

- ERPNext v16.20 oracle: expired-batch delivery is not blocked; expiry is advisory in the captured fixture.
- Forge current `tracking.ts`: outgoing delivery throws when posting date is after batch expiry.

This needs an explicit product-policy disposition before any parity claim.

Disposition: **R8-F08 = PARTIAL**.

### Advanced tax

Old prose says inclusive tax, tax-on-tax, actual charge, per-quantity charge and document discount were missing.

Exact current `totals.ts` now implements additive included `On Net Total`, `Actual`, `On Item Quantity`, `On Previous Row Total`, fixed/percentage document discount and explicit rounding adjustment.

The blanket old missing list is stale.

Current source still explicitly rejects:

- included tax with document discount;
- included tax with policy-derived line discount/adjustment;
- included tax rows outside additive `On Net Total`.

Disposition: **R8-F06 = PARTIAL** until the pinned advanced-tax fixtures are replayed against current code.

### FX gain/loss

Old prose says payment-side FX gain/loss is missing.

Exact current `finance-controllers.ts` calculates historical-rate base allocation and emits an `EXCHANGE-DIFFERENCE` GL line against `exchange_gain_loss_account`.

That old conclusion is stale.

Disposition: **R8-F03 and R8-F06 remain PARTIAL** until the exact ERPNext settlement/currency fixtures are remapped.

## Live O2C boundaries

The later transaction-closure evidence still leaves explicit depth boundaries:

1. customer credit-limit / hold authority;
2. fully-paid return/refund/customer-credit policy;
3. historical downstream COGS/expense restatement after wider backdated valuation effects;
4. authoritative landed-cost application/reversal across Procurement/Inventory;
5. strict Forge expired-batch policy vs advisory ERPNext behavior;
6. full replay/remap of all 115 fixtures against exact current Forge.

## Disposition after this pass

- R8-F01 O2C: **PARTIAL**
- R8-F03 AR/AP settlement: **PARTIAL**
- R8-F06 Pricing/Tax/Currency: **PARTIAL**
- R8-F07 Stock/Valuation/Repost: **PARTIAL**
- R8-F08 Serial/Batch/Traceability: **PARTIAL**

No module-level row is promoted. Module closure still requires the full 109-artifact denominator.

## Next P0 lane

P2P:

`Material Request -> RFQ -> Supplier Quotation -> Purchase Order -> Purchase Receipt -> Purchase Invoice -> Payment/Reconciliation`

Focus first on landed cost, supplier advance, returns/debit, subcontracting and ambiguous same-item multi-PO allocation identity.

## Current executable frozen status projection — 2026-10-04

`server/tests/o2c.test.mjs` now consumes the committed ABCM-115 snapshot for the five
status/progress cases already referenced by its workflow test: STATUS-RECALC-049,
OUTSTANDING-031, RECEIVE-PARTIAL-035, SUBMIT-018 and SO-DN-SI-PE-HAPPY-043 (all `O2C-*`).
Expected labels and comparable progress percentages come directly from captured summaries.
The test checks both pinned source SHAs, capture versions and the committed snapshot hash.
The old export manifest hash does not match the current snapshot bytes and is not reused
as a hash certificate. Monetary inputs differ, so only these status/progress projections
are compared; no 115-case, tax, monetary ledger or current ERPNext runtime parity is claimed.
