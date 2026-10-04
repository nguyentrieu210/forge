# R8-A — P1 Breadth Remap

Status: all remaining flow rows resolved conservatively  
Pinned ERPNext: `v16.20.0` @ `ff46d20b259a2d65a7ded959df9f9a42991a3562`

This pass closes the seven remaining `UNRESOLVED` flow rows without promoting parity.

## R8-F09 — WMS = PARTIAL

Forge already has reservation guards, deterministic putaway/picking/wave/packing planning, replenishment suggestions, scanner normalization, cycle-count freeze through Stock Reconciliation and mature stock tracking/valuation.

The open depth is execution orchestration rather than basic stock math:

- persisted Warehouse Task/action state is missing;
- several putaway/pick/pack/replenishment primitives remain non-posting planners;
- automatic reservation expiry and evidence-backed consumption remain open;
- generic projected ATP is incomplete;
- mobile scanner permission-aware server-action completion is incomplete.

## R8-F13 — Assets = PARTIAL

Forge has GL-backed Asset registration/depreciation, movement/custody, maintenance and disposal with reversal/gain-loss behavior.

Pinned ERPNext Asset is deeper around:

- Purchase Receipt/Purchase Invoice acquisition linkage;
- CWIP/capitalization;
- finance books;
- generated/recreated depreciation schedules;
- richer value adjustment/repair interactions.

The denominator includes Asset Capitalization, Asset Repair, Asset Depreciation Schedule and Asset Value Adjustment; whole-artifact equivalence is not yet proven.

## R8-F14 — Projects = PARTIAL

Forge now has stronger PSA behavior than older snapshots: Project/Task lifecycle validation, dependencies/WBS, Timesheet provenance/rates, Change Order/Acceptance evidence and profitability projections.

The remaining boundary is authoritative cross-domain finance:

- project expense/budget/cost;
- billing/revenue and invoice/GL linkage;
- profitability/cash-flow/EVM/retention;
- procurement and stock dimensions.

Pinned ERPNext Timesheet directly updates project/task costing/billing state; Forge still has explicit Finance/Procurement/Inventory dependencies.

## R8-F15 — Quality = PARTIAL

The old “metadata foundation” label is stale. Exact current Forge registers:

- Quality Inspection;
- Quality Plan;
- Non Conformance Report;
- Root Cause Analysis;
- CAPA.

Lifecycle tests enforce rejected-inspection -> NCR/RCA/CAPA sequencing.

The whole ERPNext Quality denominator still includes Procedure, Goal, Review, Feedback and Meeting, and supplier-quality + exact runtime behavior are not fully mapped.

## R8-F16 — Support = PARTIAL

Forge has Issue/Support lifecycle, SLA targets, team/assignment seams, CSAT, Warranty/Service/Maintenance and transaction-closure provenance.

Open boundaries are:

- durable business-calendar SLA clock, pause/resume, breach and automatic escalation;
- authenticated email/chat/social/portal intake with dedupe/thread provenance;
- complete customer portal;
- assignment-based READ scope;
- authoritative service billing and automatic spare-parts execution.

## R8-F17 — Commerce/POS = PARTIAL

POS is a genuine transaction engine: opening session, server pricing, stock/COGS, payment/session guards and hardened closing reconciliation.

Subscription derives the plan/rate/interval and next invoice date, but Forge explicitly does **not** auto-generate invoices. Pinned ERPNext Subscription can create Sales/Purchase Invoices for billing periods and carries trial/discount/due-date lifecycle.

Auto Repeat and complete Website Item/Product Bundle/website runtime parity are not established.

## R8-F18 — Regional = PARTIAL

Forge has Vietnam-specific legal foundations:

- effective-dated/source-hashed rules;
- deterministic fixed-point tax evaluation;
- TT99-oriented accounting registries/mappings;
- canonical E-Invoice Submission evidence boundary.

R8 keeps two concepts separate:

1. ERPNext regional behavior; and
2. legal certification for Vietnam.

Open: exact-current official-source validation, certified provider/signing/retry/status synchronization, complete filing datasets/reports and legal certification. Forge's Vietnam-specific scope also does not equal ERPNext's multi-country breadth.

## Flow benchmark result

All 18 flow rows now have a non-UNRESOLVED disposition.

No flow is classified `DEEP_PARITY`, `SEMANTIC_PARITY` or `FORGE_SUPERSET` yet.

That is intentional: R8-A benchmark completion means **we know where the depth stands**, not that the gaps are closed.
