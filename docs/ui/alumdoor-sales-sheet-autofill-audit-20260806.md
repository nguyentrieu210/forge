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

## Findings

### A1 — Area display is unnecessarily gated by server preview

`areaPerSet()` returns only `formula.area_per_set_sqm`. The preview itself is not called until Customer Group is canonicalized to `Đại lý` or `Lẻ`. Therefore a valid AREA row can have Height and Width entered while the Area cell remains blank.

Fix direction: show `height * width` immediately as a presentation preview, then replace it with authoritative `formula.area_per_set_sqm` once returned. Persisted/billable quantity remains server-authoritative.

### A2 — Selling price-list resolution is fragile and repeats generic CRUD reads

Customer hydration builds guessed candidates, lists active Price Lists, then calls `getDoc(Price List, candidate)` again to validate each candidate. A list result already proved the candidate active, while a generic single-record route can be unavailable or differently materialized. This can leave `priceList` empty even though an applicable active list is visible.

Fix direction: cache active Price Lists once, resolve preferred -> customer-group match -> standard -> sole active list directly from the active list projection, and refresh item pricing when the selected list changes.

### A3 — Item-context requests can race and stale responses can overwrite a newer rate

`refreshContext()` has no per-line generation token. Item selection, currency resolution, customer price-list resolution and warehouse changes can launch overlapping requests. An older response (including a `rate=null` response before price-list resolution) may arrive after a newer priced response and overwrite it.

Fix direction: key request generations by stable line id and ignore stale responses.

### A4 — Pricing errors and production-formula errors share one `line.error`

The pricing request can set `line.error` to `price_error`; the AREA preview immediately clears `error` and later replaces it with leaf/stock-profile errors. Result: rate may remain blank while the visible pricing explanation disappears.

Fix direction: separate pricing and formula error channels and aggregate only for display/blocking.

### A5 — Stock read diagnostics are returned but not projected

`sales.item_context` returns `stock_read_error`, but Sales Sheet does not surface it. The operator can therefore see no stock answer without knowing whether that means zero stock, unmanaged stock or a read failure.

Fix direction: keep the existing authoritative stock fields and surface the read diagnostic without inventing stock.

### A6 — Required visual state is tied mostly to missing values

Required cells lose the strong visual cue after they are filled, although the operator still needs to distinguish operator-entered fields from computed/read-only cells during fast keyboard entry.

Fix direction: persistent required-input treatment + stronger missing state.

### A7 — Main and expanded grid already share the same renderer, but column widths are static

Both modes call `renderGrid()`, so one width model can cover both. Current widths are constants only.

Fix direction: compact two-line headers, shorter labels, persisted per-column widths and pointer resize handles in the shared renderer.

## Authority boundary

- Geometric `height * width` is display-only fallback.
- `billable_area_sqm`, cutting/leaf calculation, price authority, stock and persisted Sales Order values remain server-owned.
- No manual fallback price is synthesized.
- Missing authoritative price must remain fail-closed and visibly explain why.
