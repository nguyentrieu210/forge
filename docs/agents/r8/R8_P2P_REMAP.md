# R8-A — P2P + Subcontracting Exact-Current Remap

Status: P0 P2P audited to PARTIAL; subcontracting classified GAP  
Forge branch: `codex/r8-erpnext-business-depth`  
Pinned ERPNext: `v16.20.0` @ `ff46d20b259a2d65a7ded959df9f9a42991a3562`

## Forge P2P depth already present

Current Forge is not a shallow Purchase Order / Purchase Invoice shell. Existing authority and validated transaction-closure evidence cover:

- RFQ / Supplier Quotation integrity, comparison and supplier selection;
- Purchase Order commercial policy and frozen match policy;
- partial Purchase Receipt against canonical Stock Ledger;
- Purchase Invoice with receipt/quantity/price three-way match;
- match hold before authoritative commit, so failed match leaves no GL, Payment Ledger or procurement-progress side effect;
- multi-PO Purchase Invoice with per-line PO linkage;
- Supplier payment, advance and later allocation through the Finance-owned Payment Entry / Payment Allocation authority;
- physical supplier return through Stock Return;
- payable correction through Debit Note;
- AP reconciliation through canonical Payment Ledger and GL.

That is enough to reject a "Buying is only metadata" conclusion, but not enough for ERPNext business closure.

## Confirmed ERPNext depth gap — Landed Cost Voucher

Forge `procurement-landed-cost.ts` deliberately stops at deterministic allocation evidence. Its contract says the helper emits no Stock Ledger and no GL. The current UI/API path is consequently preview/orchestration, not authoritative landed-cost posting.

Pinned ERPNext v16.20.0 `Landed Cost Voucher` does materially more on submit/cancel:

1. applies landed-cost amounts to receipt rows;
2. recalculates receipt valuation;
3. replays the receipt's stock effect by cancelling/rebuilding Stock Ledger entries;
4. rebuilds GL where applicable;
5. invokes future SLE/GLE repost.

That is a business-semantic gap, not an implementation-detail difference.

**Disposition: R8-F02 remains PARTIAL.**

## Confirmed precision gap — ambiguous split-price PO lines

Forge transaction closure explicitly keeps one remaining allocation boundary: if the same PO contains the same item on multiple rows at materially different approved rates, Purchase Invoice progress/match does not yet have an authoritative `purchase_order_item_row_id` allocation identity symmetric with receipt allocation.

This does not invalidate normal P2P but blocks a deep-parity claim.

## Confirmed ERPNext depth gap — Subcontracting

Pinned ERPNext v16 exposes first-class Subcontracting Order and Subcontracting Receipt controllers.

### ERPNext Subcontracting Order

On submit/cancel it:

- validates the referenced Purchase Order is a submitted subcontract PO;
- validates service/finished-good/supplied-material relationships;
- updates subcontracted quantity/status on the Purchase Order;
- reserves raw material;
- tracks supplied-material state.

### ERPNext Subcontracting Receipt

On submit it:

- validates available raw material and BOM-required consumption;
- updates Subcontracting Order received/consumed state;
- creates/uses serial and batch bundles;
- updates stock reservations;
- posts Stock Ledger;
- posts GL;
- reposts future SLE/GLE;
- updates status and linked job-card/purchase-receipt seams.

On cancel it reverses the corresponding stock, reservation, GL, repost and status effects.

### Forge exact-current result

Current Forge code search finds `Subcontracting Order` / `Subcontracting Receipt` in source-exact declarations, registries and documentation, but not a production transaction controller with the above lifecycle. The Manufacturing transaction-closure record explicitly defers subcontracting until supplier/procurement/material-send-return/valuation contracts are authoritative.

**Disposition: R8-F12 = GAP.**

## Remaining P2P audit work

Before P2P can move above PARTIAL, R8 still needs:

- a pinned ERPNext P2P runtime oracle for partial receipt/invoice/payment, tolerance, return/debit, supplier advance and cancellation/race cases;
- authoritative landed-cost application/reversal and Stock↔GL reconciliation;
- row-level ambiguous same-item split-price PO allocation;
- artifact-level resolution of Supplier Scorecard, blanket-order/drop-ship and the remaining Buying denominator.

No Buying module-level classification is promoted by this pass.
