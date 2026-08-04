# R5-A3 — Commercial + Supply Chain

Status: **EXACT-HEAD SUBSTANTIVE PASS / FINAL HYGIENE RERUN PENDING / NON-UI MERGE GATE**

Initial branch baseline: `main@30346e08eabb7074f8623eeedae09efec25da072`

Latest audited `main`: `8316d2a5f24863d3347cf9f92ec5987145b8dc9e`

R5-00 control consumed: PR `#629`, `agent/r5-00-integration-control@ef2a4d80b70164048aa6c3f516580350009234b2`

Branch: `agent/r5-03-commercial-supply-chain`

Risk: **CRITICAL stock/procurement quantity semantics; non-UI**

## Mission

Converge the already-integrated CRM/Sales, Procurement/P2P and Inventory/WMS authorities for the Alumdoor pilot without reopening RC4 or creating a second Stock/AR/AP/GL authority.

R5-00 established that all substantive RC4 A10/A11/A12/A17/A18 source is already on `main`. R5-03 therefore treats Transaction Closure + RC4 as the baseline and only fixes reproducible residual contract gaps or adds integrated release-confidence evidence.

## Exact-state / drift audit

The branch was created from `main@30346e08...`. While R5-03 was running, `main` advanced to `8316d2a5...` through a documentation cleanup/rebaseline commit. That drift removes stale coordination artifacts and refreshes project docs; it does not modify the Commercial, Procurement, Stock, Document Kernel or ledger source changed by this lane. No stale RC4 worker branch was replayed.

Canonical authority retained:

- Sales/O2C: existing `clouderp-selling` controllers and Finance-owned AR/Payment Ledger integration.
- Procurement/P2P: existing RFQ/quotation/selection/PO/Receipt/Invoice/three-way-match/allocation controllers.
- Inventory: existing Stock Ledger, valuation, reservation, Stock Reconciliation, Batch/Serial and WMS planning authority.
- Finance: existing GL/Payment Ledger and read-only cross-ledger reconciliation; R5-03 does not post finance corrections.

## Reproducible residual fixed — independent purchase quantity axes

### Problem on exact main

Shared `clouderp-core` mixed quantities that are not always identical:

1. commercial/priced quantity;
2. canonical stock quantity;
3. exact observed purchase stock quantity for dual-measure materials;
4. supplier-delivery obligation/allocation quantity.

Two shared selectors special-cased the Alumdoor literal `inventory_mode === "Nhôm cây/lá"` and field `qty_bar`. This made a vertical field name part of generic Procurement/Stock authority. The fallback conversion path also exposed a fixed-point drift: a counted quantity such as exactly 230 pieces could become `230.000100` after multiplying a rounded six-decimal conversion factor.

That conflicts with the reference-vertical contract: physical quantity roles must be declarative, server-authoritative and exact where the source observation is exact.

### Generic contract implemented

`server/packages/clouderp-core/src/uom.ts` now separates the axes:

- `stockQtyMicros()` is stock-only and reads the canonical server-snapshotted stock quantity. It no longer selects `qty_bar` from a vertical inventory-mode literal.
- Item master may declare `purchase_stock_qty_field` when a purchase line contains an exact observed stock quantity that must not be reconstructed from a rounded conversion factor.
- `purchaseAllocationQtyMicros()` is a separate Procurement allocation selector.
- Item master may declare `purchase_allocation_qty_field` plus `purchase_allocation_uom` when supplier-delivery obligation quantity differs from stock quantity.
- if no separate Purchase Allocation axis is declared, Procurement falls back to canonical stock quantity.
- descriptor field names are constrained to safe field identifiers; values are fixed-point and must be positive.
- allocation field/UOM descriptors must be declared together.
- when `purchase_stock_qty_field` is declared, the exact observed stock quantity is authoritative while the declared conversion factor remains a consistency check. It is not multiplied again to manufacture an approximate count.

`applyUomConversion()` snapshots or clears all quantity descriptors from authoritative Item master data. Client-provided descriptor claims are therefore overwritten and cannot switch a Purchase Order/Receipt to another stock or allocation axis.

`server/packages/clouderp-core/src/purchase-allocation-controllers.ts` now consumes the generic selector. The controller no longer contains `Nhôm cây/lá` or `qty_bar` quantity-selection logic.

This keeps one Purchase Allocation ledger and one Stock Ledger while allowing commercial price, stock and supplier-delivery obligation to use different declared physical measures without vertical branching in the shared controller.

## Regression evidence added

### `server/tests/r5-03-purchase-allocation-measure.test.mjs`

Covers:

- a non-Alumdoor example whose Stock quantity is 120 units while Purchase Allocation is 3 pallets;
- fallback to Stock quantity when no separate allocation axis exists;
- exact observed purchase stock quantity replacing rounded conversion output;
- server master overriding/clearing client-supplied stock/allocation descriptors;
- field/UOM pair validation;
- invalid, incomplete, inconsistent and non-positive quantity metadata fail-closed behavior.

### Existing allocation regressions strengthened

`server/tests/purchase-receipt-submit-preview.test.mjs` proves a representative shape can keep commercial + stock quantity at `644.184 Kg` while supplier FIFO allocation is exactly `230` counted pieces, with client attempts to change the allocation descriptor overwritten by Item master.

`server/tests/purchase-receipt-allocation-controller.test.mjs` and `server/tests/purchase-allocation-actions.test.mjs` now declare the generic stock/allocation axes in Item master fixtures. Small-quantity fixtures derive conversion factors from the exact rounded transaction quantity, so consistency validation remains strict instead of hiding fixture drift behind tolerance.

### Exact-head workflow

Added `.github/workflows/r5-03-commercial-supply-chain.yml` with:

- exact PR-head checkout/assertion;
- emitted server dist while recording the repository-wide TypeScript baseline instead of hiding unrelated debt;
- generic allocation-axis source guard;
- Purchase Allocation + catch-weight regressions;
- Procurement P2P/three-way-match/correction/landed-cost planner regressions;
- Sales O2C regressions;
- Inventory/WMS/valuation/repost regressions;
- A22 cross-ledger auditor self-test;
- Procurement package gate;
- diff hygiene;
- **no deploy step**.

Run `30880985337` on exact head `d7e55c8bc05d8bfd31fbfbfd01ef82bf8e6ee77d` passed every substantive domain gate above. Its only failure was final `git diff --check`; this documentation update removes the trailing-whitespace source and triggers the final exact-head rerun. No authored test is promoted beyond the final exact-head result.

## Integrated scenario disposition

| Chain / invariant | R5-03 disposition |
| --- | --- |
| Customer -> Quotation -> Sales Order -> Delivery -> Sales Invoice | reuse Transaction Closure current-main authority; exact-head O2C regression in R5-03 workflow |
| Supplier -> PO -> Receipt -> Purchase Invoice | reuse canonical Procurement/P2P + allocation authority; exact-head P2P/allocation regression |
| partial/multiple receipt + invoice | existing cumulative authoritative progress/match path reused |
| cancellation/return/correction | existing exact reversal / Stock Return / Debit Note boundaries reused |
| retry/idempotency | canonical Document Kernel mutation receipt and append-only ledger identities reused |
| reservation/WMS/scan | current Inventory/WMS authority reused; no WMS ledger introduced |
| Stock valuation | single Stock Ledger/valuation authority retained |
| AR/AP/Payment/GL | Finance authority only; no Commercial/Supply-Chain shadow ledger |
| Stock <-> Finance reconciliation | A22 read-only auditor reused in exact-head workflow |
| exact purchase stock quantity | generic master-declared `purchase_stock_qty_field` added in this lane |
| separate supplier-delivery quantity axis | generic master-declared allocation field/UOM added in this lane |

## Dependency Requests

### DR-R5-03-01 -> R5-02 Finance + Stock/Kernel valuation boundary — landed-cost historical propagation

**Need:** close or explicitly defer the R5-00 `HOTSPOT-LANDED-COST-STOCK-GL` contract:

1. Inventory-owned, receipt/receipt-line-targeted valuation identity for approved landed-cost allocations;
2. exact reversal/repost of that source-targeted valuation effect;
3. Finance-owned propagation/reconciliation when historical outgoing stock has already created COGS/expense/GL effects.

Current main can deterministically allocate landed-cost amount and can perform stock valuation/repost primitives, but the canonical Stock Ledger entry does not expose sufficient receipt-target identity to safely apply a landed-cost adjustment only to the intended receipt layer. Existing zero-quantity valuation adjustment semantics may distribute across open FIFO layers. R5-03 therefore does **not** create a shadow valuation table, mutate historical stock value ad hoc, or post compensating GL.

Blocking: end-to-end `P01-016 Landed Cost` / historical Stock->GL correctness claim only. All independent Commercial/P2P/Stock continuity work proceeds.

### DR-R5-03-02 -> Alumdoor package/profile owner / R5 package composition — quantity-axis consumer metadata

The generic core no longer knows the Alumdoor field name `qty_bar`. Before an installed package activates a shape whose purchase transaction, stock and supplier-delivery measures differ, installed Item/profile metadata must materialize the appropriate generic descriptors:

- `purchase_stock_qty_field` when exact observed stock quantity is carried by a dedicated line field;
- `purchase_allocation_qty_field` plus `purchase_allocation_uom` when supplier-delivery obligation quantity differs from stock quantity.

Representative counted-stock values are `qty_bar` for `purchase_stock_qty_field`, and `qty_bar` + `Cây` for the allocation descriptor. R5-03 tests prove the generic contract but do not silently mutate tenant master data or rewrite historical import SQL merely to make the contract appear deployed.

Blocking: installed-package/pilot activation of the separate quantity axes. Not blocking generic domain source validation. R5-06 package/migration rehearsal must verify the composed package materializes the descriptors before pilot certification.

### DR-R5-03-03 -> Measurement Profile / Inventory metadata owner — remaining generic physical-measure extraction

`uom.ts` still contains the older shared dynamic `Thành phẩm theo m2` area-to-set conversion branch. R5-03 deliberately did not widen the current Procurement quantity fix into a second physical-measure redesign. A future generic measurement-profile contract should express area/set transformation declaratively rather than moving another vertical literal between shared files.

Blocking: full removal of all vertical measurement literals from shared UOM code. Not blocking the `Nhôm cây/lá`/`qty_bar` Purchase Allocation residual fixed here.

## Landed-cost maturity boundary

No maturity inflation is claimed:

- landed-cost basis/allocation planning remains implemented evidence;
- source-targeted stock-value application and historical COGS/GL propagation remain dependency-bound;
- `P01-016` must not be promoted merely because the Procurement allocator exists;
- no R5-03 change claims Hardened.

## Production / migration boundary

R5-03 performs no production deployment, tenant-data mutation, migration execution, provider mutation, DNS/secret change or restore/PITR operation.

The branch is non-UI and changes shared Stock/Procurement quantity semantics. Per Forge Enterprise Completion policy:

1. keep PR `#636` on the exact R5-03 branch;
2. collect final exact-head CI evidence;
3. reconcile any concrete main overlap before integration;
4. keep DR-R5-03-01/02/03 explicit in composed R5 evidence;
5. **stop before merge/deploy pending explicit user authorization**.
