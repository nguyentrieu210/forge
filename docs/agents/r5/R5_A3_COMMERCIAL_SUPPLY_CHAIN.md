# R5-A3 — Commercial + Supply Chain

Status: **SOURCE/EVIDENCE PASS / NON-UI MERGE GATE**

Initial branch baseline: `main@30346e08eabb7074f8623eeedae09efec25da072`

Latest audited `main`: `8316d2a5f24863d3347cf9f92ec5987145b8dc9e`

R5-00 control consumed: PR `#629`, `agent/r5-00-integration-control@ef2a4d80b70164048aa6c3f516580350009234b2`

Branch: `agent/r5-03-commercial-supply-chain`

PR: `#636`

Risk: **CRITICAL stock/procurement quantity semantics; non-UI**

## Mission and authority boundary

R5-00 established that substantive RC4 A10/A11/A12/A17/A18 source is already on `main`. R5-03 therefore does not replay RC4 branches or create a second domain authority.

Canonical authority retained:

- Sales/O2C remains in existing `clouderp-selling` controllers and Finance-owned AR/Payment Ledger paths.
- Procurement/P2P remains in existing RFQ/quotation/selection/PO/Receipt/Invoice/three-way-match/allocation controllers.
- Inventory remains one Stock Ledger/valuation/reservation/Reconciliation/Batch/Serial/WMS authority.
- Finance remains the only GL/Payment Ledger authority. R5-03 does not post compensating finance entries.
- A22 cross-ledger reconciliation is reused read-only; it is not forked into another ledger.

The branch started at `main@30346e08...`. During execution, `main` advanced to `8316d2a5...` through a documentation cleanup/rebaseline commit. That one-commit drift does not modify Commercial, Procurement, Stock, Document Kernel or ledger source touched here; GitHub reports PR #636 mergeable.

## Residual fixed — independent purchase quantity axes

### Exact-main defect

Shared `clouderp-core` mixed four quantities that are not always identical:

1. commercial/priced quantity;
2. canonical stock quantity;
3. exact observed purchase stock quantity for dual-measure materials;
4. supplier-delivery obligation/allocation quantity.

Shared selectors special-cased `inventory_mode === "Nhôm cây/lá"` and `qty_bar`. This embedded a vertical field name in generic Procurement/Stock authority. A second defect appeared when exact counted stock was reconstructed by multiplying transaction quantity by a rounded six-decimal conversion factor: an exact `230` count could become `230.000100`.

### Generic contract

`server/packages/clouderp-core/src/uom.ts` now separates the roles:

- `stockQtyMicros()` reads only the canonical server-snapshotted stock-UOM quantity; the `Nhôm cây/lá` selector is removed.
- Item master may declare `purchase_stock_qty_field` when a purchase line carries an exact observed stock quantity. That exact value is authoritative; `conversion_factor` remains a consistency check rather than a second source of quantity truth.
- `purchaseAllocationQtyMicros()` is a separate Procurement selector.
- Item master may declare `purchase_allocation_qty_field` plus `purchase_allocation_uom` when supplier-delivery obligation differs from stock quantity.
- no allocation descriptor means fallback to canonical stock quantity.
- descriptor field names are constrained to safe identifiers; quantities are positive fixed-point values; allocation field/UOM must be declared together.
- `applyUomConversion()` snapshots or clears descriptors from authoritative Item master data, so client input cannot switch stock/allocation axes.

`server/packages/clouderp-core/src/purchase-allocation-controllers.ts` consumes the generic selector and no longer contains `Nhôm cây/lá` or `qty_bar` quantity-selection logic.

This preserves one Purchase Allocation ledger and one Stock Ledger while allowing commercial, stock and supplier-obligation measures to differ declaratively.

## Regression evidence

### New generic regression

`server/tests/r5-03-purchase-allocation-measure.test.mjs` covers:

- non-Alumdoor stock `120` vs allocation `3 pallets`;
- fallback allocation == stock when no separate axis is declared;
- exact observed purchase stock quantity replacing rounded conversion output;
- server master overriding/clearing client quantity descriptors;
- invalid/incomplete/inconsistent/non-positive metadata failing closed.

### Existing regressions strengthened

`server/tests/purchase-receipt-submit-preview.test.mjs` proves a representative purchase can keep commercial + stock quantity at `644.184 Kg` while supplier FIFO allocation is exactly `230` counted pieces, and a client cannot replace the Item-master allocation descriptor.

`server/tests/purchase-receipt-allocation-controller.test.mjs` and `server/tests/purchase-allocation-actions.test.mjs` now declare generic stock/allocation axes in Item master fixtures. Small-quantity fixtures derive conversion factors from the exact rounded transaction quantity so consistency validation remains strict instead of widening tolerance.

## Exact-head CI evidence

Workflow: `.github/workflows/r5-03-commercial-supply-chain.yml`

Run `30881261434` on exact head `40853ce0f3be59bc7db70c7c6247e7f5e843102e` completed **SUCCESS**. Job `91902963483` passed every step:

- exact PR-head checkout/assertion;
- locked dependency install;
- server dist emission while recording the repository-wide pre-existing TypeScript baseline;
- generic allocation/catch-weight boundary;
- Procurement P2P + correction regressions;
- Sales O2C regressions;
- Inventory/WMS/valuation/repost regressions;
- A22 cross-ledger auditor self-test;
- Procurement package gate;
- `git diff --check` hygiene.

No deploy step exists in the workflow.

This progress-record annotation is docs-only. The PR's current-head Actions result remains the canonical final integration evidence after this commit.

## Integrated scenario disposition

| Chain / invariant | R5-03 disposition |
| --- | --- |
| Customer -> Quotation -> Sales Order -> Delivery -> Sales Invoice | reuse Transaction Closure authority; exact-head O2C regression |
| Supplier -> PO -> Receipt -> Purchase Invoice | reuse canonical P2P + Purchase Allocation authority |
| partial/multiple receipt + invoice | existing cumulative authoritative progress/match path reused |
| cancellation/return/correction | existing exact reversal / Stock Return / Debit Note boundaries reused |
| retry/idempotency | canonical Document Kernel mutation receipt and append-only ledger identities reused |
| reservation/WMS/scan | current Inventory/WMS authority reused; no WMS ledger introduced |
| Stock valuation | single Stock Ledger/valuation authority retained |
| AR/AP/Payment/GL | Finance authority only; no Commercial/Supply-Chain shadow ledger |
| Stock <-> Finance reconciliation | A22 read-only auditor reused |
| exact purchase stock quantity | generic Item-master `purchase_stock_qty_field` |
| supplier-delivery quantity axis | generic Item-master allocation field + UOM |

## Dependency Requests

### DR-R5-03-01 -> R5-02 Finance + Stock/Kernel — landed-cost historical propagation

Need to close or explicitly defer R5-00 `HOTSPOT-LANDED-COST-STOCK-GL`:

1. Inventory-owned receipt/receipt-line-targeted valuation identity for approved landed-cost allocation;
2. exact reversal/repost of that targeted valuation effect;
3. Finance-owned propagation/reconciliation when historical outgoing stock already produced COGS/expense/GL effects.

Current main can deterministically allocate landed cost and has stock valuation/repost primitives, but canonical Stock Ledger does not expose sufficient receipt-target identity to safely adjust only the intended receipt layer. Existing zero-quantity valuation adjustments may distribute across open FIFO layers. R5-03 therefore does not create a shadow valuation table, mutate historical stock ad hoc or post compensating GL.

Blocking only the end-to-end `P01-016 Landed Cost` / historical Stock->GL correctness claim.

### DR-R5-03-02 -> Alumdoor package/profile owner + R5-06 — quantity-axis consumer metadata

Generic core no longer knows `qty_bar`. Before an installed package activates a shape whose purchase transaction, stock and supplier-delivery measures differ, Item/profile metadata must materialize the relevant descriptors:

- `purchase_stock_qty_field` for exact observed stock quantity;
- `purchase_allocation_qty_field` + `purchase_allocation_uom` for a distinct supplier-delivery obligation axis.

Representative counted-stock metadata is `qty_bar`, and representative allocation metadata is `qty_bar` + `Cây`.

R5-03 proves the generic contract but does not silently mutate tenant master data or rewrite historical import SQL. R5-06 package/migration rehearsal must prove the composed package materializes these descriptors before pilot certification.

### DR-R5-03-03 -> Measurement Profile / Inventory metadata owner — remaining physical-measure extraction

`uom.ts` still contains the older dynamic `Thành phẩm theo m2` area-to-set conversion branch. R5-03 deliberately does not widen the Procurement fix into a second measurement redesign. A future generic Measurement Profile contract should express that transformation declaratively.

This does not block the `Nhôm cây/lá` / `qty_bar` Purchase Allocation residual fixed here.

## Maturity and production boundary

No maturity inflation is claimed:

- landed-cost basis/allocation planning remains implemented evidence;
- source-targeted landed-cost Stock/GL propagation remains dependency-bound;
- `P01-016` is not promoted merely because the allocator exists;
- no R5-03 change claims Hardened.

R5-03 performs no production deployment, tenant-data mutation, migration execution, provider mutation, DNS/secret change or restore/PITR operation.

Because PR `#636` changes shared non-UI Stock/Procurement semantics, it must **stop before merge/deploy pending explicit user authorization**.
