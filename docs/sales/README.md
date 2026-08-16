# Forge Sales Commercial Architecture — Documentation Index

**Status:** Architecture locked for implementation planning; Alumdoor Master/Sales/BOM boundary refined by 2026-08-16 source audit  
**Date:** 2026-08-16  
**Scope:** Forge shared Selling/Pricing core + AlumDoor reference vertical

## Purpose

This folder freezes the shared commercial authority model and records Alumdoor-specific audits. The goal is to stop solving Alumdoor cases as isolated UI fields or controller branches and instead converge on one reusable Sales model that preserves Forge's metadata-first, authoritative-backend and vertical-without-runtime-fork principles.

The documents here are implementation contracts. If code, migration or tests later prove a contract wrong, exact code + migration + tests win and these documents must be updated in the same PR.

## Canonical documents

| Document | Purpose |
| --- | --- |
| [`SALES_COMMERCIAL_ARCHITECTURE.md`](./SALES_COMMERCIAL_ARCHITECTURE.md) | Shared authority map: pricing, fulfillment, manufacturing, snapshots and anti-patterns. |
| [`ALUMDOOR_MASTER_SALES_BOM_AUDIT_20260816.md`](./ALUMDOOR_MASTER_SALES_BOM_AUDIT_20260816.md) | **Current Alumdoor boundary audit** grounded in the newly extracted workshop sources: Master → configurator → geometry → billing measure → fulfillment → BOM → stock allocation. |
| [`ALUMDOOR_SALES_BUSINESS_CASE_MATRIX.md`](./ALUMDOOR_SALES_BUSINESS_CASE_MATRIX.md) | Maps known Alumdoor sales cases to the shared commercial primitives; historical/materialized mappings remain compatibility evidence. |
| [`SALES_PRICING_AUTHORITY_IMPLEMENTATION_PLAN.md`](./SALES_PRICING_AUTHORITY_IMPLEMENTATION_PLAN.md) | Ordered implementation plan for shared pricing authority. |
| [`SALES_GOLDEN_FLOW_AND_TEST_PLAN.md`](./SALES_GOLDEN_FLOW_AND_TEST_PLAN.md) | Golden flows, invariants, failure/correction paths and acceptance evidence. |

### Alumdoor precedence note

For **Alumdoor Master / Sales configurator / geometry / BOM / cutting** work, read in this order:

```text
apps/alumdoor/docs/nguon/SALES-BOM-SOURCE-MAP.md
→ raw extract referenced there
→ ALUMDOOR_MASTER_SALES_BOM_AUDIT_20260816.md
→ server/briefs/alumdoor-v2.json for explicit project resolutions
→ exact current code/migrations/tests
```

The 2026-08-16 audit **refines**, rather than collapses, the shared six-authority model. In particular:

- physical geometry must not be inferred from customer-group pricing semantics;
- `Trọn bộ / Tách món / Chỉ lá / Chỉ phụ kiện` must be represented as explicit configuration/fulfillment scope where that is their source meaning, not treated as a universal “cách bán” ontology;
- existing Sales Option/Sales Package records remain compatibility and fulfillment infrastructure and must not be destructively rewritten merely to match new naming;
- BOM remains manufacturing consumption and is never a Sales Package;
- stock-piece/batch selection remains downstream of BOM/material requirement.

## Architecture decision summary

The shared Sales model remains intentionally split into six authorities:

1. **Measurement / geometry authority** — physical and derived product quantity facts; Alumdoor must separate physical geometry from billing-measure/customer context as defined in the 2026-08-16 audit.
2. **Item Price** — base commercial price for `Price List + Item + UOM + Price Variant`.
3. **Pricing Rule** — single authority for commercial adjustments: rate override, discount and surcharge/adjustment.
4. **Sales Option / configuration shortcut** — operator-facing mapping where useful; not a universal ontology for every Alumdoor product choice.
5. **Sales Package** — physical components that must be fulfilled for a commercial line.
6. **BOM** — manufacturing consumption required to produce a manufacturable item.

These authorities must not be collapsed into one another.

## Explicit non-decisions / rejected directions

- Do **not** hard-code `Cửa Đức`, `Cửa Úc`, `vân gỗ`, discount percentages, rail prices or surcharge amounts in shared Selling/Pricing runtime.
- Do **not** create multiple Price Lists merely to encode rail/full-set combinations.
- Do **not** use manufacturing BOM as the sales fulfillment bundle.
- Do **not** let Pricing Rule silently decide physical delivery composition.
- Do **not** keep competing commercial-policy authorities for the same effect.
- Do **not** trust client-calculated discount amount, surcharge amount or final amount as authoritative money.
- Do **not** automatically re-price an accepted quotation when converting it to a Sales Order.
- Do **not** let customer group silently change physical cut geometry when the source difference is a billing/measurement-basis concern.
- Do **not** auto-submit the 2026-08-15 Alumdoor BOM import while `suy_luan/chua_ro` component bases remain unresolved.

## Relationship to earlier Sales Option / Package work

Migrations and audits from 2026-08-11 through 2026-08-14 are retained as compatibility/current-state evidence. The 2026-08-16 workshop-source audit does not authorize deleting historical `Sales Option`, `Sales Package`, `price_variant`, or SKU mappings. It changes the **forward modeling rule**: new configurator work starts from explicit product/configuration facts and then maps to commercial/fulfillment authorities, rather than making a label called “cách bán” the source of all product semantics.

## Execution order for the Alumdoor continuation

1. **Configuration facts first** — explicit Product Model/configurator metadata, `measurement_basis`, component scope and snapshot lineage.
2. **Geometry boundary split** — physical geometry resolver independent from customer-group pricing; billing-measure resolver separate.
3. **BOM normalization** — resolve draft/inferred component bases by product family and create versioned BOM resolution snapshots.
4. **Configurator UI** — Quotation/Sales Order render the same metadata-driven product configuration and server previews.
5. **Production/stock bridge** — BOM/material requirement → reservation/allocation → Cut Order → canonical Stock Ledger.

No later step may compensate for an unresolved earlier invariant.

## Production boundary

All implementation slices that change backend/schema/business rules require branch + PR + exact verification and must stop before merge/deploy until explicitly approved.
