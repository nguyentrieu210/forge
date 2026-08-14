import assert from "node:assert/strict";
import test from "node:test";

import {
  SalesLinkedProductionPlanController,
  SalesLinkedWorkOrderController,
} from "../dist/packages/clouderp-erpnext/src/index.js";

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

function salesOrder(qty = "10") {
  return document("Sales Order", "SO-1", {
    company: "ACME",
    customer: "CUST-1",
    currency: "VND",
    transaction_date: "2026-08-13",
    revision_no: 2,
    items: [{
      row_id: "SO-ROW-1",
      item_code: "FG-DOOR",
      uom: "Bộ",
      qty,
      qty_micros: Number(qty) * 1_000_000,
      rate: "1000000",
      warehouse: "FG",
      sales_option_code: "DOOR-DE",
      sales_option_version: 3,
      sales_package: "PKG-DOOR-DE",
      sales_package_version: 4,
      sales_package_checksum: "pkg-checksum",
    }],
  }, 1, 7);
}

function bom() {
  return document("Bill of Materials", "BOM-FG-1", {
    company: "ACME",
    item: "FG-DOOR",
    quantity: "1.000000",
    quantity_micros: 1_000_000,
    revision: 1,
    bom_status: "Active",
    effective_from: "2026-01-01",
    output_uom: "Bộ",
    output_stock_uom: "Bộ",
    output_conversion_factor_micros: 1_000_000,
    output_stock_qty_micros: 1_000_000,
    bom_checksum: "bom-checksum",
    operating_cost_minor: 0,
    items: [{
      row_id: "BOM-ROW-1",
      item_code: "RM-1",
      qty: "2.000000",
      qty_micros: 2_000_000,
      uom: "Cây",
      stock_uom: "Cây",
      conversion_factor_micros: 1_000_000,
      stock_qty_micros: 2_000_000,
      qty_basis: "Cố định",
      source_warehouse: "RAW",
    }],
  });
}

function planRow(extra = {}) {
  return {
    row_id: "PLAN-ROW-1",
    item_code: "FG-DOOR",
    bom_no: "BOM-FG-1",
    planned_qty: "6.000000",
    planned_qty_micros: 6_000_000,
    warehouse: "FG",
    sales_order: "SO-1",
    sales_order_row_id: "SO-ROW-1",
    ...extra,
  };
}

function command(doctype, name, action, payload) {
  return {
    schema_version: 1,
    command_id: `cmd-${doctype}-${name}-${action}`,
    tenant_id: "tenant-a",
    aggregate: { doctype, name },
    action,
    expected_version: action === "create" ? null : 1,
    payload_hash: "test",
    document: payload,
    actor: { user_id: "planner@example.com", roles: ["Manufacturing Manager"] },
    submitted_at: NOW,
  };
}

function context(doctype, name, action, payload, reader) {
  return {
    command: command(doctype, name, action, payload),
    existing: null,
    now: NOW,
    nextVersion: 1,
    reader,
  };
}

function reader({ plans = [], workOrders = [], planDocument } = {}) {
  const so = salesOrder();
  const bomDoc = bom();
  return {
    async getDocument(_tenant, doctype, name) {
      if (doctype === "Sales Order" && name === so.name) return so;
      if (doctype === "Bill of Materials" && name === bomDoc.name) return bomDoc;
      if (doctype === "Production Plan" && planDocument && name === planDocument.name) return planDocument;
      return null;
    },
    async listDocumentsByDoctype(_tenant, doctype) {
      if (doctype === "Production Plan") return plans;
      if (doctype === "Work Order") return workOrders;
      return [];
    },
    async hasMasterRecord() { return true; },
  };
}

test("Production Plan freezes exact Sales Order row lineage instead of matching only item_code", async () => {
  const controller = new SalesLinkedProductionPlanController();
  const result = await controller.normalize(context("Production Plan", "PLAN-1", "save", {
    company: "ACME",
    posting_at: "2026-08-13",
    items: [planRow()],
  }, reader()));

  const row = result.items[0];
  assert.equal(row.sales_order, "SO-1");
  assert.equal(row.sales_order_row_id, "SO-ROW-1");
  assert.equal(row.sales_order_document_version, 7);
  assert.equal(row.sales_order_revision_no, 2);
  assert.equal(row.production_source_snapshot.source_row_id, "SO-ROW-1");
  assert.equal(row.production_source_snapshot.sales_option_code, "DOOR-DE");
  assert.equal(row.production_source_snapshot.sales_package_checksum, "pkg-checksum");
  assert.match(row.production_source_checksum, /^[0-9a-f]{64}$/);
});

test("Production Plan refuses partial Sales Order lineage", async () => {
  const controller = new SalesLinkedProductionPlanController();
  await assert.rejects(
    controller.normalize(context("Production Plan", "PLAN-1", "save", {
      company: "ACME",
      posting_at: "2026-08-13",
      items: [planRow({ sales_order_row_id: undefined })],
    }, reader())),
    /requires both sales_order and sales_order_row_id/,
  );
});

test("submitted Production Plans cannot cumulatively exceed the source Sales Order row", async () => {
  const prior = document("Production Plan", "PLAN-OLD", {
    company: "ACME",
    posting_at: "2026-08-12",
    items: [planRow({ planned_qty: "5.000000", planned_qty_micros: 5_000_000 })],
  });
  const controller = new SalesLinkedProductionPlanController();
  await assert.rejects(
    controller.normalize(context("Production Plan", "PLAN-NEW", "submit", {
      company: "ACME",
      posting_at: "2026-08-13",
      items: [planRow({ planned_qty: "6.000000", planned_qty_micros: 6_000_000 })],
    }, reader({ plans: [prior] }))),
    /Cumulative Production Plan quantity exceeds Sales Order/,
  );
});

test("Work Order derives BOM and sales lineage from submitted Production Plan and caps cumulative release", async () => {
  const enrichedPlan = document("Production Plan", "PLAN-1", {
    company: "ACME",
    posting_at: "2026-08-13",
    items: [planRow({
      sales_order_document_version: 7,
      sales_order_revision_no: 2,
      production_source_snapshot: { schema_version: 1, source_name: "SO-1", source_row_id: "SO-ROW-1" },
      production_source_checksum: "source-checksum",
    })],
  }, 1, 3);
  const priorWorkOrder = document("Work Order", "WO-OLD", {
    company: "ACME",
    production_item: "FG-DOOR",
    bom_no: "BOM-FG-1",
    qty: "4.000000",
    qty_micros: 4_000_000,
    production_plan: "PLAN-1",
    production_plan_row_id: "PLAN-ROW-1",
  });
  const controller = new SalesLinkedWorkOrderController();

  await assert.rejects(
    controller.normalize(context("Work Order", "WO-NEW", "submit", {
      company: "ACME",
      production_item: "FG-DOOR",
      bom_no: "BOM-FG-1",
      qty: "3.000000",
      source_warehouse: "RAW",
      target_warehouse: "FG",
      planned_start_date: "2026-08-13",
      production_plan: "PLAN-1",
      production_plan_row_id: "PLAN-ROW-1",
    }, reader({ planDocument: enrichedPlan, workOrders: [priorWorkOrder] }))),
    /Cumulative Work Order quantity exceeds Production Plan/,
  );

  const result = await controller.normalize(context("Work Order", "WO-OK", "save", {
    company: "ACME",
    production_item: "FG-DOOR",
    qty: "2.000000",
    source_warehouse: "RAW",
    target_warehouse: "FG",
    planned_start_date: "2026-08-13",
    production_plan: "PLAN-1",
    production_plan_row_id: "PLAN-ROW-1",
  }, reader({ planDocument: enrichedPlan })));

  assert.equal(result.bom_no, "BOM-FG-1");
  assert.equal(result.production_plan, "PLAN-1");
  assert.equal(result.production_plan_row_id, "PLAN-ROW-1");
  assert.equal(result.production_plan_document_version, 3);
  assert.equal(result.sales_order, "SO-1");
  assert.equal(result.sales_order_row_id, "SO-ROW-1");
  assert.equal(result.production_source_checksum, "source-checksum");
  assert.equal(result.required_items[0].item_code, "RM-1");
  assert.equal(result.required_items[0].required_qty, "4.000000");
});
