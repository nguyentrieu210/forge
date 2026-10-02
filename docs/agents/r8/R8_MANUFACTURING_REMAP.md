# R8-A — Manufacturing / MRP / Execution Exact-Current Remap

Status: Planning and execution lanes classified PARTIAL  
Forge branch: `codex/r8-erpnext-business-depth`  
Pinned ERPNext: `v16.20.0` @ `ff46d20b259a2d65a7ded959df9f9a42991a3562`

## Forge manufacturing is already materially deep

The current implementation has real production invariants, not only BOM/Work Order metadata:

- versioned and effective-dated submitted BOM;
- overlap/cycle protection and immutable BOM checksum;
- Work Order captures a BOM revision/checksum and exact material snapshot at release;
- partial manufacture and aggregate material guards;
- canonical Stock Entry / Stock Ledger execution and exact reversal;
- scrap/offcut/recovery value conservation;
- Job Card completion guards;
- multi-level MRP explosion with deterministic source trace;
- Material Request draft conversion with replay lineage;
- routing / workstation / calendar / downtime;
- finite day-bucket capacity planning;
- raw-material -> Work Order -> FG genealogy;
- stock-ledger-derived actual material/FG cost and variance evidence.

That means Manufacturing is one of Forge's stronger ERP domains.

## Planning gap 1 — phantom / substitute / alternate BOM

The current WS05 evidence is explicit:

- multi-level BOM: implemented;
- alternate BOM: foundation only;
- phantom BOM: missing;
- substitute material: missing.

This matters because pinned ERPNext BOM itself exposes `is_phantom_bom`, `allow_alternative_item`, routing/operations, secondary items and operation/raw-material costing semantics.

Forge's current lifecycle intentionally forbids multiple overlapping Active BOMs for the same item/effective window. Production Plan can honor an explicit `bom_no`, but that is not the same as a complete alternate-BOM selection policy.

**R8-F10 cannot exceed PARTIAL.**

## Planning gap 2 — MRP is not ATP/projected netting

Forge's MRP source is unusually honest:

`manufacturing-mrp.ts` returns `netting_mode = gross_only`.

The optional netting layer returns:

`ON_HAND_ONLY_NOT_ATP`

and explicitly excludes:

- reservations;
- open PO supply;
- open Work Order supply;
- lead times;
- safety stock.

Automatic Material Request conversion therefore remains gross-only rather than silently treating an incomplete projection as ATP.

Pinned ERPNext Production Plan ties demand to Sales Orders/material requests, updates/reserves stock and carries a broader planning lifecycle.

The Forge decision is safe, but it is less deep.

## Execution strength

Forge transaction closure already proves:

- immutable WO BOM snapshot;
- partial production;
- duplicate retry/idempotency;
- short/excess material guards;
- exact cancellation/correction;
- stock valuation and backdated audit;
- genealogy;
- scrap/offcut/recovery reconciliation.

Those are meaningful parity inputs.

## Execution/cost gap — operation cost remains evidence, not posting

`manufacturing-costing-read.ts` says exactly:

- `evidence_scope = READ_ONLY_CANONICAL_LEDGER`;
- `posting_status = NOT_POSTED`.

Actual material/FG value is authoritative because it comes from Stock Ledger. Labor/machine/overhead is inferred/reconciled evidence rather than a posted Finance transaction.

Pinned ERPNext Job Card carries workstation/hour-rate/time semantics, updates Work Order operating cost and can feed additional operation cost into manufacturing Stock Entry value. It also has corrective Job Card, semi-finished/WIP and quality/subcontract seams.

Forge's current Finance dependency is therefore real:

- posted labor;
- machine;
- overhead;
- manufacturing variance;
- accounting-period/reversal behavior.

## Rework

Forge deliberately does not invent a generic rework contract because the repository does not determine whether rework:

- consumes rejected FG;
- links the original Work Order;
- uses a dedicated rework BOM/routing;
- records incremental-only work.

That unresolved business model remains a real gap.

Subcontracting is separately classified `R8-F12 = GAP`.

## R8 disposition

- R8-F10 BOM/MRP: **PARTIAL**
- R8-F11 Shop-floor/Cost: **PARTIAL**
- R8-F12 Subcontracting: **GAP**

Before either manufacturing lane can move above PARTIAL, R8 needs a pinned ERPNext runtime differential around BOM alternatives/phantoms/substitutes, Production Plan netting/reservation, Job Card costing/WIP, corrections and period accounting.
