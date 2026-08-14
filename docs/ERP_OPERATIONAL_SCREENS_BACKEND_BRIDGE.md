# ERP Operational Screens — Backend Bridge

Status: ACTIVE
Date: 2026-08-13
Branch: `feat/erp-operational-screens-backend-bridge-20260813`
Baseline: `main@c9d3a771c625e1d13d10206b996d365939e5e0bf`

## Decision

Complex operator transactions use dedicated TSX screens, following the current Sales Order interaction pattern. Simple masters/configuration stay metadata-driven. React owns layout and operator interaction only; canonical server controllers remain authority for price, quantity, stock, manufacturing, accounting, permission and lifecycle.

No second stock ledger, manufacturing progress ledger or pricing engine is introduced.

## Deep audit result

The backend is ahead of the current operator UI:

- Selling already has exact `sales_order_row_id` lineage, package snapshots and cumulative Delivery/Billing fulfillment.
- Procurement already has server-side buying Price List/Pricing Rule resolution, partial receipt/billing, stock posting and three-way-match policy.
- Stock already has Stock Ledger, warehouse scope, physical identity, batch/serial, reservation guards, scan resolution and physical-stock reporting.
- Manufacturing already has versioned/effective BOM, immutable Work Order snapshots, dimension-based quantities, MRP, finite capacity, Job Card, genealogy and costing evidence.
- Logistics already has Delivery Trip/POD.
- QMS already has plan/sampling/NCR/RCA/CAPA/calibration, with qualitative Quality Inspection persistence still incomplete.

The largest missing bridge was exact Sales Order demand -> Production Plan -> Work Order lineage.

## P0 implemented on this branch

### Production Plan row contract

A sales-linked row uses:

- `sales_order`
- `sales_order_row_id`
- `sales_order_document_version`
- `sales_order_revision_no`
- `production_source_snapshot`
- `production_source_checksum`

Rules:

1. Order and exact child-row identity are both required.
2. Source Sales Order must be submitted and same company.
3. Exact source row must exist; matching by `item_code` alone is forbidden.
4. Production item must match the source row item.
5. Planned quantity cannot exceed source quantity.
6. Cumulative submitted Production Plans cannot exceed the Sales Order row quantity.
7. Snapshot/checksum are server-built.
8. Non-sales Production Plans retain the old path.

### Work Order release contract

A Work Order released from a plan uses:

- `production_plan`
- `production_plan_row_id`
- `production_plan_document_version`
- Sales lineage copied from the submitted plan row
- the same frozen production-source snapshot/checksum

Rules:

1. Plan and exact plan row are mandatory when sales lineage is present.
2. Production Plan must be submitted and same company.
3. Work Order item and BOM are derived from the plan row.
4. Work Order quantity cannot exceed the plan row quantity.
5. Cumulative submitted Work Orders cannot exceed planned quantity.
6. Conflicting client-supplied Sales references are rejected.
7. Standalone legacy Work Orders remain compatible.

Canonical chain:

```text
Sales Order
 -> exact Sales Order row
 -> Production Plan row
 -> Work Order
 -> Stock Entry issue/consumption/finished good
 -> Stock Ledger / genealogy
```

## Screen completion matrix

| Screen | Canonical document | Backend | Dedicated UI | Remaining seam |
|---|---|---:|---|---|
| Sales Order | Sales Order | High | existing | hardening only |
| Purchase Order | Purchase Order | High | yes | buying commercial preview |
| Purchase Receipt | Purchase Receipt | High | yes | PO remaining/allocation preview |
| Stock transaction | Stock Entry | High | yes | stock-line context/availability preview |
| Stock Reconciliation | Stock Reconciliation | High | yes | scan/bulk UX |
| Production Plan | Production Plan | Medium/High | yes | open demand + release action + projected ATP |
| Phiếu sản xuất | Work Order | High | yes | material-status/read helper |
| Cấp vật tư | Stock Entry/Material Transfer | High | WO-specialized | remaining/lot candidates |
| Công đoạn | Job Card | Medium/High | yes/mobile | richer execution states if required |
| Nhập thành phẩm | Stock Entry/Manufacture | High | WO-specialized | prefill/bundle helper |
| QC | Quality Inspection/QMS | Medium/High | yes | Pass/Fail/Text persistence |
| Delivery Note | Delivery Note | High | yes | exact SO remaining + physical allocation |
| Delivery Trip/POD | Delivery Trip/POD | High | yes/mobile | routing/GPS is separate scope |

## Next backend seams

### P0

`get_open_sales_production_demand`

Returns exact Sales Order row demand, already-planned quantity and remaining-to-plan quantity. It must never merge repeated rows by item code.

`preview_production_plan_release` and `create_production_plan_work_order`

Release must be idempotent and still pass through the canonical Work Order controller.

`get_work_order_material_status`

Returns BOM-row required, issued, consumed, remaining and stock/lot availability from canonical manufacturing/stock evidence.

### P1 Procurement

`preview_purchase_commercial_line`

Uses the existing server buying pricing authority with Supplier, Supplier Group, buying Price List, item, UOM, quantity, currency and date. React must not reproduce pricing rules.

`get_purchase_receipt_source_status` / `preview_purchase_receipt_allocation`

Returns PO ordered/received/remaining, tolerance, physical UOM/catch-weight requirements and proposed allocation.

### P1 Stock

`preview_stock_entry_line`

Returns inventory mode, measurement profile, allowed UOM, warehouse-role checks, batch/serial requirement, availability and bounded physical-lot candidates.

### P1 Delivery

`get_sales_delivery_source_status`

Uses existing line-level fulfillment authority and returns ordered/delivered/remaining plus physical availability.

### P2 Planning/QMS

Current MRP on-hand netting is deliberately `ON_HAND_ONLY_NOT_ATP`. Full projected planning must add agreed open supply/reservation/lead-time/safety-stock inputs before automatic commitment uses it as ATP.

Persisted Quality Inspection must be widened for Numeric + Pass/Fail + Text before the QC screen is called complete.

## UI standard

Dedicated screens reuse shared adapter/session/permission/ControlRegistry semantics but own their operational grid and inline detail layout.

- Header: only high-frequency fields visible by default.
- Grid: keyboard-first, exact row validation, sticky important columns.
- Inline detail: dimensions/options for Sales; physical/UOM details for Purchase/Stock; BOM/material progress for Manufacturing; readings for QC.
- Summary: canonical values or clearly labelled preview values only.
- Save/submit must reconcile with the server result; client-only business totals are not authority.

## Implementation order

1. Sales -> Production lineage — implemented here.
2. Open production-demand read model + Work Order release action.
3. Production Plan TSX.
4. Work Order/Phiếu sản xuất TSX.
5. Material-status read model + Cấp vật tư/Nhập thành phẩm modes.
6. Purchase preview + Purchase Order TSX.
7. Purchase Receipt source/allocation preview + TSX.
8. Stock Entry preview + TSX.
9. Delivery source read model + Delivery Note TSX.
10. Job Card and QMS specialized screens.
11. Extract common grid components only after multiple real screens prove a stable common shape.

## Current branch delta

- `server/packages/clouderp-erpnext/src/manufacturing-sales-lineage.ts`
- `server/packages/clouderp-erpnext/src/registry.ts`
- `server/packages/clouderp-erpnext/src/index.ts`
- `server/tests/manufacturing-sales-lineage.test.mjs`

No SQL migration or parallel ledger is introduced by this slice.
