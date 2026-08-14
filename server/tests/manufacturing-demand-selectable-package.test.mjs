import assert from "node:assert/strict";
import test from "node:test";

import { buildOpenSalesProductionDemand } from "../dist/packages/clouderp-erpnext/src/index.js";

const NOW = "2026-08-13T12:00:00.000Z";

function document(doctype, name, data, docstatus = 1, version = 1) {
  return {
    tenant_id: "tenant-a",
    doctype,
    name,
    owner: "planner@example.com",
    docstatus,
    status: docstatus === 1 ? "Submitted" : "Draft",
    version,
    created_at: NOW,
    modified_at: NOW,
    children: [],
    data,
  };
}

function bom(item, name) {
  return document("Bill of Materials", name, {
    company: "ACME",
    item,
    quantity: "1.000000",
    quantity_micros: 1_000_000,
    revision: 1,
    bom_status: "Active",
    effective_from: "2026-01-01",
    output_uom: "Bộ",
    output_stock_uom: "Bộ",
    output_conversion_factor_micros: 1_000_000,
    output_stock_qty_micros: 1_000_000,
    bom_checksum: `${name}-checksum`,
    operating_cost_minor: 0,
    items: [],
  });
}

test("open production demand excludes selectable package commercial parent and child rows", () => {
  const sales = document("Sales Order", "SO-SELECTABLE", {
    company: "ACME",
    customer: "CUST-1",
    currency: "VND",
    transaction_date: "2026-08-13",
    items: [
      {
        row_id: "PARENT-1",
        item_code: "FG-FULL-SET",
        uom: "Bộ",
        qty: "1.000000",
        qty_micros: 1_000_000,
        rate: "1000000",
        warehouse: "FG",
        sales_package: "PKG-SPLIT:FG-FULL-SET",
        sales_package_group_key: "PACKAGE-GROUP-1",
      },
      {
        row_id: "CHILD-1",
        item_code: "FG-LEAF",
        uom: "Bộ",
        qty: "1.000000",
        qty_micros: 1_000_000,
        rate: "300000",
        warehouse: "FG",
        sales_package_parent_key: "PACKAGE-GROUP-1",
        sales_package_component_key: "SPLIT-MAIN",
      },
    ],
  });

  const result = buildOpenSalesProductionDemand({
    company: "ACME",
    planning_date: "2026-08-13",
    sales_orders: [sales],
    production_plans: [],
    boms: [bom("FG-FULL-SET", "BOM-FULL"), bom("FG-LEAF", "BOM-LEAF")],
  });

  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.warnings, [
    "PHYSICAL_OBLIGATION_UNRESOLVED_SELECTABLE_PACKAGE:SO-SELECTABLE:CHILD-1:PACKAGE-GROUP-1",
    "PHYSICAL_OBLIGATION_UNRESOLVED_SELECTABLE_PACKAGE:SO-SELECTABLE:PARENT-1:PACKAGE-GROUP-1",
  ]);
});

test("ordinary exact Sales Order rows still produce demand", () => {
  const sales = document("Sales Order", "SO-DIRECT", {
    company: "ACME",
    customer: "CUST-1",
    currency: "VND",
    transaction_date: "2026-08-13",
    items: [{
      row_id: "SO-ROW-1",
      item_code: "FG-DIRECT",
      uom: "Bộ",
      qty: "2.000000",
      qty_micros: 2_000_000,
      rate: "1000000",
      warehouse: "FG",
    }],
  });

  const result = buildOpenSalesProductionDemand({
    company: "ACME",
    planning_date: "2026-08-13",
    sales_orders: [sales],
    production_plans: [],
    boms: [bom("FG-DIRECT", "BOM-DIRECT")],
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sales_order_row_id, "SO-ROW-1");
  assert.equal(result.rows[0].remaining_to_plan, "2.000000");
  assert.equal(result.rows[0].bom_status, "READY");
});
