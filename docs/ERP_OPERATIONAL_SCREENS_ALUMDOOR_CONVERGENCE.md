# AlumDoor operational-screen convergence — Production Request vs Production Plan

Status: ACTIVE DESIGN/IMPLEMENTATION
Date: 2026-08-13

## Finding from the second deep audit

AlumDoor already has a real vertical production bridge. The canonical vertical flow is:

```text
Sales Order
 -> exact Sales Order Item (`sales_order_row_id`)
 -> Production Request
 -> exact Production Request Item (`request_line_key`)
 -> Work Order (`production_request_line_key`)
 -> Cut / Paint / Stock manufacturing execution
```

`buildSalesProductionLines` already splits one commercial line with `set_count > 1` into independent production lines and carries width, height, colour, door type, sales mode, leaf calculation, production standard, BOM, warehouses and formula snapshot. The existing regression explicitly checks this flow.

Therefore a generic `Production Plan` implementation must not replace or bypass `Production Request` for AlumDoor.

## Authority decision

There are two valid release authorities:

### 1. AlumDoor vertical authority

Use `Production Request` when production semantics require door-specific decomposition and formula snapshots.

Required lineage:

- `against_sales_order`
- `sales_order_row_id`
- `production_request`
- `production_request_line_key`

This path owns:

- one-sale-line-to-many-set decomposition;
- width/height/mesh height;
- colour;
- motor/leaf variant;
- leaf count and single/double layer split;
- cutting/formula policy snapshot;
- door-family production standard;
- paint/cut lineage.

### 2. Generic ERP authority

Use `Production Plan` for generic planned outputs/MRP/capacity where no vertical decomposition contract is required.

Required lineage when sourced from Sales:

- `sales_order`
- `sales_order_row_id`
- `production_plan`
- `production_plan_row_id`
- server-built production source snapshot/checksum.

This path owns generic demand aggregation, MRP and capacity planning. It must not claim the door-formula semantics owned by AlumDoor Production Request.

## Work Order authority selector

The effective Work Order controller must select exactly one path:

```text
has production_request / production_request_line_key
  -> validate pair
  -> reject mixed Production Plan authority
  -> preserve existing immutable BOM/Work Order controller path

else has production_plan / production_plan_row_id
  -> generic exact-row Production Plan lineage controller

else historical against_sales_order
  -> preserve legacy path

else
  -> normal standalone Work Order
```

This is implemented by `ManufacturingReleaseAuthorityWorkOrderController`, registered last because `ControllerRegistry` is last-registration-wins.

## UI consequence

The Production UI should not force every operator through one universal planning screen.

For AlumDoor:

```text
Sales Order
  [Tạo yêu cầu sản xuất]
        -> Production Request operator screen
             -> one row per physical set
             -> Create/inspect Work Orders
```

For generic manufacturing:

```text
Open production demand / Material Request / manual plan
        -> Production Plan
             -> MRP/capacity
             -> Work Order release
```

The Work Order/Phiếu sản xuất screen can be shared at the execution level because both paths converge on the same canonical Work Order, Stock Entry, Stock Ledger, Job Card and genealogy authorities.

## Revised implementation sequence

1. Preserve and harden existing Sales Order -> Production Request vertical flow.
2. Build a dedicated Production Request operator screen for AlumDoor using the same hardcoded transaction-screen pattern as Sales Order.
3. Build shared Work Order/Phiếu sản xuất screen, displaying whichever release lineage is present.
4. Use `buildWorkOrderMaterialStatus` for Cấp vật tư / NVL status; wire it through a bounded server API later.
5. Keep generic Production Plan screen for non-vertical planning/MRP/capacity and optional generic Sales demand.
6. Do not duplicate door formulas, leaf logic, package decomposition or paint/cut rules in Production Plan React code.

## Remaining backend gaps after convergence

- bounded API for Work Order material status + lot candidates;
- bounded API/read model for generic open Sales production demand if generic Production Plan consumes Sales demand;
- projected ATP beyond current on-hand-only MRP netting;
- permission-safe indexed projections to replace large document scans at scale;
- persisted qualitative Quality Inspection readings;
- purchase/stock/delivery preview seams for the remaining dedicated transaction screens.

## Non-goals

- no second Production Request equivalent;
- no second manufacturing ledger;
- no client-side leaf/BOM authority;
- no forced migration of historical AlumDoor Work Orders into Production Plan;
- no claim that generic Production Plan replaces the vertical production operating model.
