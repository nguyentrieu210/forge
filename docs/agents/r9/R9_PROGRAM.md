# R9 — Production ERP Core

Status: ACTIVE  
Base main: `4356315be90d51b79158e5bf6e011ba24cda1ba0`  
Source of residual depth: R8 matrix + issue #997

## Mission

R9 is not another blanket ERPNext-parity round.

It takes only the gaps that matter for a manufacturing ERP and turns them into executable,
production-oriented business contracts while preserving Forge's existing authorities:
Document Kernel, canonical Stock Ledger, canonical GL, Payment Ledger, tenant isolation,
OCC/idempotency and append-only correction evidence.

## Priority lanes

1. **R9-01 Projected inventory / ATP for MRP**
   - on-hand + dated open Purchase Order supply + dated open Work Order supply;
   - subtract active reservations;
   - keep safety stock explicit;
   - allocate projected availability once in need-date order;
   - only after that contract is proven may automatic Material Request conversion reduce demand.

2. **R9-02 Manufacturing WIP and variance**
   - WIP value while production is in progress;
   - actual operation accrual;
   - finish/cancel/reversal;
   - material/operation variance with accounting-period safety.

3. **R9-03 Recursive valuation correction**
   - landed-cost/value changes through transfer chains;
   - consumed destination layers;
   - manufacturing/WIP propagation;
   - deterministic Stock/GL reconciliation.

4. **R9-04 Bank/cash multi-currency**
   - independent foreign units for monetary accounts;
   - period-end bank/cash revaluation;
   - exact reversal and realized/unrealized separation.

5. **R9-05 Subcontracting depth**
   - reservation/unreservation;
   - finished-good return;
   - process loss / secondary output;
   - quality and repost seams.

## Non-goals

R9 does not prioritize website commerce, social/email ingestion, multi-country regional breadth,
or feature-count parity unless a real Forge product requires them.

## Exit discipline

Each lane must have:
- plain business behavior;
- authoritative source data;
- failure/race behavior;
- executable tests;
- no shadow ledger or silent state repair.

R8 PARTIAL rows remain unchanged until a specific R9 lane has evidence strong enough to update them.
No production deploy or customer-data mutation is implied.
