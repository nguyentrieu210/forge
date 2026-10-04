# R8-B — Subcontracting Business Closure

Status: **GAP -> PARTIAL**  
R8-A baseline: `4cb7c5157b7e5be738f882e099cb0e06bb7bfb34`  
Pinned ERPNext: `v16.20.0` @ `ff46d20b259a2d65a7ded959df9f9a42991a3562`

## Closure delivered

R8-A found a real gap: Forge declared Subcontracting Order / Receipt but had no production transaction authority comparable to ERPNext.

R8-B closes the missing core transaction chain:

`subcontract PO service line -> Subcontracting Order -> raw-material transfer to supplier -> Subcontracting Receipt -> finished stock + service-cost GL -> AP match -> exact correction`

### Subcontracting Order

The Order now:

- requires a submitted Purchase Order explicitly marked for subcontracting;
- binds one exact service line and rejects cumulative over-ordering;
- requires the service Item to be non-stock;
- snapshots a submitted/effective BOM into exact BOM-row material requirements;
- binds source, supplier and finished-goods warehouses;
- derives service rate/cost from the approved PO rather than trusting client input;
- prevents cancel while active material transfers or receipts depend on it.

### Material supply

Canonical `Stock Entry / Material Transfer` remains the only stock-movement authority.

When `subcontracting_order` is present it now:

- derives source/target warehouse from the frozen Order;
- binds every material movement to exact `bom_row_id`;
- rejects repeated-item ambiguity without row identity;
- rejects cumulative transfer above the frozen BOM requirement;
- keeps existing valuation, physical-stock, batch/serial and warehouse guards;
- blocks cancel when active receipts already consumed the material being reversed.

No second subcontracting stock ledger was created.

### Subcontracting Receipt

Receipt now:

- derives company/supplier/currency/PO/warehouses from the submitted Order;
- supports partial receipt using cumulative rounding so partials reconcile exactly to full BOM requirement and service cost;
- verifies cumulative raw-material consumption never exceeds material actually transferred to the supplier;
- values supplier-held raw-material consumption through the canonical outgoing valuation engine;
- enters finished goods at **actual raw-material value + allocated subcontract service cost**;
- posts only the incremental service-cost accounting effect: Dr Stock / Cr Stock Received But Not Billed;
- emits canonical Procurement Receipt progress against the original PO service item, so existing Purchase Invoice three-way match sees the subcontract receipt;
- exact-cancels original Stock/GL/procurement rows;
- blocks receipt cancellation when an already matched Purchase Invoice depends on that receipt quantity.

## Executable evidence

R8-B GitHub Actions run **36964364802** passed the first exact closure candidate gates:

- exact TypeScript server build;
- `server/tests/subcontracting-closure.test.mjs`;
- R8 `--audit-complete` invariant.

The focused lifecycle regression proves no receipt before material transfer, BOM-row transfer ceiling, partial consumption, finished-good quantity/value, balanced service-cost GL, canonical PO receipt progress, over-receipt rejection, exact receipt reversal, transfer dependency protection, full reversal, and AP dependency protection.

## Why this is PARTIAL, not parity

Pinned ERPNext v16.20 remains broader:

- raw-material reservation/unreservation and richer supplied-material status;
- secondary items and process loss;
- accepted/rejected receipt quantities;
- Quality / Job Card subcontract seams;
- landed-cost integration;
- future SLE/GLE repost;
- finished-goods return/rejection and broader return lifecycle;
- full runtime differential coverage.

R8-B therefore removes the **absence-of-authority GAP**, but does not convert the lane into a parity claim.

## Next closure lane

**Landed Cost Voucher**: turn the existing deterministic allocation preview into an authoritative, reversible stock-value application tied to submitted Purchase Receipt rows, with Stock/GL reconciliation and an explicit boundary for downstream historical COGS propagation.

## R8 final material-return closure (2026-10-04)

Supplier leftovers now return through canonical `Stock Entry / Material Transfer` with
`subcontracting_order` and `subcontracting_material_return=true`. The controller binds
supplier warehouse as source and the frozen BOM-row source warehouse as target; client
warehouse fields cannot redirect the return. The same stock valuation/tracking authority
posts both legs, with no additional stock ledger or service/AP effect.

Each BOM row now tracks net sent quantity (active supply minus active returns). Returns
cannot exceed that row's unconsumed material, even when the supplier warehouse contains
stock belonging to other work. Returning leftovers permits replacement supply within the
frozen BOM ceiling. Supply cancellation cannot strand active returns or consumption;
return cancellation is blocked when replacement supply would exceed the requirement.

Receipt submit and cancel invoke the shared batch/length reservation guard. Receipt
cancellation also checks the posting-period lock, preserving the existing System Manager
exception. Canonical stock commit guards prevent reversing finished stock already issued.
This does not add ERPNext-style automatic order material reservations or process-loss rules.

Local validation on the final material-return candidate:

- full server TypeScript compilation passed;
- four subcontracting lifecycle tests passed (including pooled supplier stock, returned
  material replenishment, dependent cancellation, downstream finished-stock consumption,
  and locked-period cancellation);
- four existing outbound reservation guard tests passed;
- migration `0163_subcontracting_material_return.sql` applied twice in SQLite without a
  duplicate metadata field or revision drift;
- `git diff --check` passed.

Status remains **PARTIAL**. Process loss, secondary outputs, accepted/rejected finished
quantities, automatic material reservation lifecycle, quality seams, landed-cost attachment,
and broad historical repost remain outside this closure. These checks prove the bounded
transaction lifecycle above, not ERPNext runtime parity or a production deployment.

## Commit-time entitlement revalidation

Migration `0165_subcontracting_commit_entitlement.sql` adds read-only projections and
D1 document-write triggers. At commit they check net sent-minus-returned material and
consumption for each order/BOM row, finished receipt and service ceilings, PO service-line
capacity, and frozen supplier/company/item/warehouse source bindings. Cancelling a source
order or PO cannot orphan active subcontract execution. Insert, update and delete paths
are scoped to affected orders and tenants.

The in-memory transactional adapter checks the corresponding projected document state
inside its database mutex. Prepared plans that lose a cross-aggregate race roll back before
publishing document, stock or procurement changes. Tests use pooled warehouse stock so
physical availability cannot accidentally hide a per-order entitlement defect.

Validation: full TypeScript build; five subcontract lifecycle tests plus four reservation
guard tests; `test-subcontracting-commit-entitlement.py` exercises two SQLite connections
with separately prepared competing supply, return and receipt writes, stale cancelled
sources, snapshot tampering, replacement-supply cancellation and valid reversals. The
migration also applies twice. `verify-sql.py` and `git diff --check` pass.

This establishes commit-time entitlement safety for the frozen R8 subcontracting model.
It does not establish proportional rounding parity, automatic reservations, process loss,
quality/rejection or historical valuation repost parity with ERPNext.
