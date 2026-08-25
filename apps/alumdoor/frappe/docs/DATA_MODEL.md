# Alumdoor foundational data model

The canonical field-level design and implementation status for the workshop masters is maintained in [FIELD_LEDGER.md](FIELD_LEDGER.md). The 14 masters listed there were implemented and migrated on 2026-08-25.

This app runs on Frappe v16 without ERPNext. It provides the product configuration and pricing foundation for aluminium-door sales. A namespaced quotation transaction is now included; accounting, inventory ledgers, purchasing, production, sales orders, and full BOM processing remain deferred.

## Reused from Frappe

- Address
- Currency
- Users, roles, permissions, audit fields, REST/RPC API, and document lifecycle

ERPNext masters such as Item, Item Group, UOM, Warehouse, Customer, Quotation, and BOM are not present on this site. Minimal namespaced masters are therefore supplied by Alumdoor to avoid collisions if ERPNext is installed later.

## DocTypes

### Minimal masters

- Alumdoor Item Group (tree)
- Alumdoor Item
- Alumdoor UOM
- Alumdoor UOM Conversion (child)
- Alumdoor Warehouse (tree; master only, no stock ledger)
- Surface Finish (powder coating, plated color, wood grain, raw)
- Alumdoor Color (single colors and two-color pairs, linked to a surface finish)

### Product configuration

- Door Type
- Door System
- Configuration Attribute
- Configuration Attribute Value (child)
- Door Formula
- Door Formula Variable (child)
- Sales Package
- Sales Package Attribute (child)
- Sales Package Component (child)
- Component Rule
- Component Rule Condition (child)

### Pricing and resolved snapshots

- Alumdoor Pricing Rule
- Configured Product
- Configured Product Attribute (child)
- Configured Product Component (child)

### Sales quotation

- Alumdoor Quotation
- Alumdoor Quotation Item (child)

The quotation is an operational item-line transaction, matching the legacy sales-order workbench: customer header, many actual sale-item rows, governed color, dynamic door measurements, workshop set count, pricing measure, discount/surcharge and totals. Customer group and price list come from the selected partner master; they are not freely reselected on the document. Saving recalculates every row on the server and the client never supplies authoritative totals.

The `color` field remains visible on each applicable row. `catalog_service.allowed_colors` resolves the selected item to its item-group scope and the finish/color already encoded by its sale code. For example, an STĐ item receives only powder-coat colors, `XN-VK` receives only the Xanh ngọc–Vàng kem pair, and an inox item receives no color choices. Validation is repeated on save.

### Commercial and workshop masters

- Alumdoor Partner Group
- Alumdoor Partner
- Alumdoor Department
- Alumdoor Employee
- Alumdoor Price List
- Alumdoor Item Price
- Alumdoor Material Specification
- Alumdoor Operation Standard
- Alumdoor Work Shift
- Alumdoor Fault Reason
- Alumdoor Warranty Policy
- Alumdoor Coating Rate
- Alumdoor Money Account
- Alumdoor Cashflow Category

## Main relationships

```text
Door Type
  +-- Door System
       +-- Sales Package
            +-- package attributes -> Configuration Attribute
            +-- base components -> Alumdoor Item
            +-- Door Formula
            +-- Component Rule -> conditions + selected Alumdoor Item

Sales Package + dimensions + chosen attributes
  -> safe formula evaluation
  -> resolved components
  -> Alumdoor Pricing Rule
  -> Configured Product snapshot
```

`Alumdoor Item` links to an item group, stock UOM, optional conversion rows, and optional default warehouse. A configured snapshot preserves dimensions, area, selected attributes, resolved quantities, rates, amounts, and the pricing total used at the time of configuration.

Resolved component quantities deliberately use two columns, following `MS LIÊN BS.xlsx` sheet `ĐM` columns I/J. `qty`/`uom` is the production count (for example one door, two rail pieces, one intermediate bottom slat). `measure_qty`/`measure_uom` is the separate metre or square-metre measure used for cutting and pricing. `Per Qty` pricing uses production count; `Per Meter` and `Item Price` use the measure quantity. This prevents six metres of rail from being misread as six rail pieces.

## Seeded sales packages

Eight source-backed packages are active: `GERMAN-AL548N-FULL`, `AUSTRALIA-FULL`, `TAIWAN-FULL`, `TAIWAN-SEPARATE`, `TAIWAN-INOX-SEPARATE`, `MESH-SEPARATE`, `MESH-FULL`, and `SUPERWIDE-SEPARATE`. The seven non-German packages are resolved by four system formulas, 100 component-selection rules, and seven component pricing rules. Taiwan full-package items are selected by variant and one of eight area bands. Mesh full-package pricing applies only above 10 m² and charges the documented combined area of two Taiwan leaves plus one mesh panel.

The source geometry in `QUY CÁCH (3).xlsx` is preserved: Australia deducts 30 mm for leaf cutting; Taiwan, mesh, and superwide deduct 30 mm or 35 mm when a butterfly bracket is selected; packaged rails use two pieces, each at overall height minus 100 mm; V4 and shaft lengths use overall width minus 30 mm and 50 mm respectively. Dealer separate-item pricing uses cut area, while retail and full-package pricing use overall rail area.

Australia doors below 4 m² use `pricing_basis = SET` and production quantity as the pricing quantity. Source-backed fixed rates are 1,800,000 VND/set for 4D, 2,000,000 VND/set for 4.6D, 2,200,000 VND/set for the source 5.2D tier mapped by the item catalog to the current 5.5D codes, and 2,800,000 VND/set for the powder-coated 6D codes. At 4 m² and above the component returns to item-price-per-area calculation. The 300,000 VND/set Australia surcharge remains restricted to `unit_area > 4 and unit_area < 7`.

Pricing rules have two scopes. `Component` selects the price for a resolved component in one sales package. `Adjustment` is a stackable surcharge or discount; it may be global (blank sales package), has a safe condition expression, a quantity formula, and a service item so the calculated snapshot explains every added or deducted amount. Door type, door system, package, normalized color, dimensions, area, quantity, and resolved formula variables are available to adjustment conditions.

`COLOR` is a Link attribute to `Alumdoor Color`, so order configuration stores a governed color code instead of free text. Canonical pricing codes are `VAN_GO`, `VK` (vàng kem), and `GS` (ghi sần). Vietnamese labels such as “Vân gỗ”, “Vàng kem”, and “Ghi sần” are still normalized for backward-compatible API requests.

## Service API

Whitelisted method:

```text
alumdoor.sales_configuration.services.configured_product_service.resolve_configuration
```

Operational quotation methods:

```text
alumdoor.sales_configuration.services.catalog_service.allowed_colors
alumdoor.sales_configuration.services.quotation_service.get_customer_context
alumdoor.sales_configuration.services.quotation_service.preview_quotation_line
alumdoor.sales_configuration.services.quotation_service.save_quotation
```

Example request:

```json
{
  "sales_package": "ROLLING-TAIWAN-FULL",
  "width": 4200,
  "height": 3000,
  "quantity": 1,
  "attributes": { "MOTOR_TYPE": "YH" },
  "save": true
}
```

Width and height are millimetres; calculated area is square metres. The formula evaluator accepts only a small arithmetic/boolean AST allowlist and never uses Python `eval`.

## Forge frontend integration

Forge Runtime is served separately and talks to this site through its same-origin `/api` and `/files` proxy. Frappe remains responsible for sessions, CSRF, permissions, validation, DocType metadata, CRUD, services, and MariaDB access.

The Alumdoor app supplies permission-filtered compatibility methods for the shared frontend through Frappe's `override_whitelisted_methods` hook, including boot, manifest, business context, application catalog, overview, list snapshots, capabilities, translations, and display values. The frontend therefore does not require the legacy Forge backend.

Local development URL:

```text
http://alumdoor.localhost:5173/?app=alumdoor
```

The Forge proxy must set `VITE_FORGE_BACKEND=http://127.0.0.1:8000` and `VITE_FRAPPE_SITE=alumdoor.localhost`.

## Demo and real-data boundary

`alumdoor.sales_configuration.demo.run_demo` creates a Taiwan rolling-door package inside a database savepoint, resolves it, and rolls the transaction back. It verifies the engine without leaving fake business masters on the site.

The workshop's real item and configuration foundation is loaded. Master data imported on 2026-08-25 includes partners, departments, employees, material specifications, coating rates, warranty/fault catalogs, money accounts, and cashflow categories. Item-price rows, operation minutes, and work-shift times remain intentionally empty until their exact source mapping is confirmed. Sales orders and any stock, purchasing, production, or BOM workflow remain outside this phase.
