# Alumdoor Sales Sheet autofill / autocalc audit — 2026-08-06

Scope: `client/apps/runtime/src/experiences/AlumdoorSalesSheetV2.tsx` and the read-only Alumdoor sales context contracts it consumes.

## Expected automatic chain

1. Business Context -> Company + currency.
2. Customer -> customer group + phone + address + applicable selling price list.
3. Item -> calculation mode + default UOM + color/thickness requirements + stock context.
4. Height/Width -> immediate geometric area display for AREA items.
5. Customer group + dimensions + quantity -> authoritative production/formula preview (`billable_area_sqm`, cutting/leaf context).
6. Price list + item + UOM + currency -> authoritative item rate.
7. Authoritative billable quantity x rate -> line amount; discounts -> net order total.
8. Warehouse + item/formula -> stock availability/shortage.

## Field-by-field truth

| Field/result | Expected source | Audit state |
| --- | --- | --- |
| Company | Business Context | Existing server-resolved context bridge; no client default synthesis. |
| Currency | Company/Business Context | Existing context fallback prevents false Company 404 from blanking currency. |
| Customer Group / phone / address | Customer | Automatic after Customer selection. |
| Selling Price List | Customer preference -> active Price List fallback | **Fixed on this branch**: active-list projection can satisfy a candidate even when repeated generic single-record CRUD is unavailable. |
| Item calculation mode | Item | Automatic from authoritative Item attributes/group. |
| UOM | Item `default_sales_uom` / conversion contract | Automatic through `alumdoor.sales.item_context`. |
| Default/fixed thickness | Material Specification | Automatic when Item references a specification. |
| Required/default color | Measurement Profile + Item | Automatic when the Item/profile requires color. |
| Quantity | Sales Sheet entry | Defaults to 1 when an Item is selected if the row has no quantity. |
| Area display | Height x Width, then server formula | **Fixed on this branch**: immediate geometric display; authoritative formula replaces it when available. |
| Billable area | `alumdoor.sales.production_line_context` | Remains server-authoritative; local geometric display is never used as persisted billable quantity. |
| Unit rate | Item Price / canonical pricing | **Fixed request chain on this branch**: active price-list resolution + ordered item-context requests prevent stale `rate=null` from overwriting a later priced result. No numeric fallback is invented. |
| Gross amount | authoritative billable qty x authoritative rate | Automatic once both authoritative inputs exist. |
| Discount | Pricing Rule / approved sales policy | **Business dependency**: repo has no generalized rule proving the existing client-side 15% assumption. Do not invent a new rule. |
| Net total | gross amount - explicit/authoritative discount | Automatic. |
| Stock availability | Stock Balance / cutting proposal | Automatic read-only preview; authoritative posting guards remain server-side. |

## Findings

### A1 — Area display was unnecessarily gated by server preview — FIXED

Previously `areaPerSet()` returned only `formula.area_per_set_sqm`. The preview itself does not run until Customer Group is canonicalized to `Đại lý` or `Lẻ`, so a valid AREA row could have Height and Width while Area stayed blank.

Branch behavior: show `height * width` immediately as a presentation preview, then prefer authoritative `formula.area_per_set_sqm` when returned. Persisted/billable quantity remains server-authoritative `billable_area_sqm`.

### A2 — Selling price-list resolution repeated fragile generic CRUD reads — FIXED

Customer hydration builds candidates and already lists active Price Lists, but then re-read each candidate through generic `getDoc(Price List, candidate)`. An active list visible in the list projection could therefore be missed if the generic single-record route was unavailable or differently materialized.

Branch behavior: reuse the caller-visible active Price List projection as a scoped compatibility read. Resolution remains preferred list -> matching active named list -> standard `Giá niêm yết` -> sole active list. No price amount is synthesized.

### A3 — Item-context requests could race and stale responses could overwrite a newer rate — FIXED

Item selection, currency hydration, customer price-list hydration and warehouse changes can launch overlapping `alumdoor.sales.item_context` reads. An older response issued before Price List resolution could contain `rate=null` and arrive after a newer priced response.

Branch behavior: item-context reads are ordered per item/warehouse so the newest request finishes after prior requests and wins the legacy row state. Canonical rate calculation itself remains server-owned.

### A4 — Pricing and production-formula diagnostics share one legacy `line.error` — OPEN HARDENING

The pricing request can set a price error while the AREA formula preview also writes the same display error slot. This is not a second pricing authority, but it can hide the reason a rate is blank.

Target hardening: split diagnostics by concern (`price`, `formula`, `stock`) or project them through one typed diagnostic model. This is presentation/error-model work and must not change rate/formula authority.

### A5 — Stock read diagnostics are returned but not projected distinctly — OPEN HARDENING

`sales.item_context` returns `stock_read_error`, while the legacy sheet mainly projects quantities/shortage. Operator feedback should distinguish zero stock, unmanaged stock and a failed stock read.

Target hardening: surface the existing server diagnostic; never infer stock from absence of a response.

### A6 — Required visual state was tied mostly to missing values — FIXED

Required operator-input cells now stay visually identifiable after entry; missing required input remains stronger/red. Calculated/read-only cells remain neutral.

### A7 — Width authority was duplicated between component and stylesheet — FIXED

The CSS added by the prior compact-layout PR repeated column widths through `nth-child` selectors with `!important`, overriding component widths and becoming incorrect when columns were hidden.

Branch behavior: `COLUMNS` is the sole default-width authority. The old nth-child width overrides are removed. The shared renderer is used by both normal and expanded grids, and business headers expose horizontal resize behavior.

### A8 — Automatic 15% German-door discount lacks generalized policy evidence — BUSINESS DEPENDENCY

Repository source proves imported Item Price lists (`Giá niêm yết`, `Giá có ray`) and historical quotation evidence, but Pricing Rule is intentionally not populated from insufficient source evidence. One quotation with 15% discount does not establish a universal German-door rule.

Dependency Request: `docs/dependencies/alumdoor-sales-pricing-policy-request-20260806.md`.

Until source-owner evidence defines scope/effective dates/stacking, do not create a new automatic discount rule or guess when `Giá có ray` applies.

## Imported price evidence

The canonical import creates:

- `Giá niêm yết:<item_code>` Item Price with the Item's `default_sales_uom`, rate and VND;
- `Giá có ray:<item_code>` only when the source rail price is positive, also with `default_sales_uom`, rate and VND.

Therefore a blank Unit Rate for a priced Item is a context/lookup/diagnostic problem to expose and fix; it is not a reason to calculate a price in the client.

## Authority boundary

- Geometric `height * width` is display-only fallback.
- `billable_area_sqm`, cutting/leaf calculation, price authority, stock and persisted Sales Order values remain server-owned.
- No manual numeric price fallback is synthesized.
- Missing authoritative price remains fail-closed and must visibly explain why.
- Automatic discount/Price List switching beyond existing authoritative data requires source-owner policy evidence.

## Validation status

PR build/convergence evidence reached and passed CloudForge build, Alumdoor sales/procurement contract verification, MetaForge build, migration/recovery safety and R6 Golden Flow assertions before stopping at the repository-wide `Verify release safety authority` gate. The branch does not modify the canonical release workflow or release-safety verifier; that gate is tracked as an external convergence blocker rather than being bypassed in this Sales Sheet change.
