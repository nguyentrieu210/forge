import assert from "node:assert/strict";
import test from "node:test";

import { routeManufacturingGenealogyApi } from "../dist/apps/tenant-worker/src/manufacturing-genealogy-api.js";

const URL = "https://tenant.test/api/method/metaforge.manufacturing.get_work_order_genealogy";

function workOrder() {
  return {
    tenant_id: "tenant-a", doctype: "Work Order", name: "WO-1", owner: "planner@example.com",
    docstatus: 1, status: "In Process", version: 1,
    created_at: "2026-08-03T00:00:00.000Z", modified_at: "2026-08-03T00:00:00.000Z", children: [],
    data: { company: "ACME", production_item: "FG", bom_no: "BOM-FG", qty: "2", qty_micros: 2_000_000 },
  };
}

function stockEntry(name, docstatus = 1) {
  return {
    tenant_id: "tenant-a", doctype: "Stock Entry", name, owner: "stock@example.com",
    docstatus, status: docstatus === 2 ? "Cancelled" : "Submitted", version: docstatus === 2 ? 2 : 1,
    created_at: "2026-08-03T01:00:00.000Z", modified_at: "2026-08-03T01:00:00.000Z", children: [],
    data: {
      company: "ACME", posting_at: "2026-08-03T01:00:00.000Z", purpose: "Manufacture", work_order: "WO-1",
      finished_good_item: "FG", finished_good_qty: "2", target_warehouse: "FG",
      items: [{ row_id: "R1", item_code: "RM", qty: "3", source_warehouse: "RAW", bom_row_id: "BOM-R1" }],
    },
  };
}

function ledgerRows() {
  return [
    {
      line_key: "SRC-R1", item_code: "RM", warehouse: "RAW", actual_qty_micros: -3_000_000,
      valuation_rate_minor: 10, stock_value_difference_minor: -30, qty_scale: 6, currency_scale: 2,
      currency: "VND", posting_at: "2026-08-03T01:00:00.000Z", batch_no: "B-RM",
    },
    {
      line_key: "FINISHED", item_code: "FG", warehouse: "FG", actual_qty_micros: 2_000_000,
      valuation_rate_minor: 15, stock_value_difference_minor: 30, qty_scale: 6, currency_scale: 2,
      currency: "VND", posting_at: "2026-08-03T01:00:00.000Z", batch_no: "B-FG",
    },
  ];
}

function request(body) {
  return new Request(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function context({ wo = workOrder(), entries = [stockEntry("STE-1"), stockEntry("STE-C", 2)], unreadable = new Set() } = {}) {
  const ledgerCalls = [];
  return {
    ledgerCalls,
    value: {
      tenantId: "tenant-a",
      actor: { user_id: "planner@example.com", roles: ["Manufacturing User"] },
      traceId: "trace-genealogy",
      permissions: {
        async canReadDocument(_actor, _tenant, document) { return !unreadable.has(document.name); },
      },
      async loadWorkOrder(name) { return name === "WO-1" ? wo : null; },
      async listStockEntries() { return entries; },
      async getVoucherStockEntries(name, version) { ledgerCalls.push([name, version]); return ledgerRows(); },
    },
  };
}

async function json(response) { return response.json(); }

test("genealogy API returns effective movements and visible cancellation history", async () => {
  const ctx = context();
  const response = await routeManufacturingGenealogyApi(request({ work_order: "WO-1" }), new URL(URL), ctx.value);
  assert.equal(response.status, 200);
  const payload = await json(response);
  assert.equal(payload.message.work_order, "WO-1");
  assert.equal(payload.message.consumptions[0].batch_no, "B-RM");
  assert.equal(payload.message.finished_goods[0].batch_no, "B-FG");
  assert.deepEqual(payload.message.cancelled_stock_entries, ["STE-C"]);
  assert.deepEqual(ctx.ledgerCalls, [["STE-1", 1]]);
});

test("genealogy API fails closed when the Work Order is unreadable", async () => {
  const ctx = context({ unreadable: new Set(["WO-1"]) });
  await assert.rejects(
    () => routeManufacturingGenealogyApi(request({ work_order: "WO-1" }), new URL(URL), ctx.value),
    /Work Order WO-1 is not readable/,
  );
  assert.equal(ctx.ledgerCalls.length, 0);
});

test("genealogy API fails closed instead of silently dropping a hidden related Stock Entry", async () => {
  const ctx = context({ unreadable: new Set(["STE-1"]) });
  await assert.rejects(
    () => routeManufacturingGenealogyApi(request({ work_order: "WO-1" }), new URL(URL), ctx.value),
    /Stock Entry outside the current read scope/,
  );
});

test("genealogy API rejects client-selected tenant scope", async () => {
  const ctx = context();
  await assert.rejects(
    () => routeManufacturingGenealogyApi(request({ work_order: "WO-1", tenant_id: "other" }), new URL(URL), ctx.value),
    /tenant scope is controlled/,
  );
  assert.equal(ctx.ledgerCalls.length, 0);
});

test("genealogy API supports Frappe args JSON transport", async () => {
  const ctx = context();
  const response = await routeManufacturingGenealogyApi(
    request({ args: JSON.stringify({ work_order: "WO-1" }) }),
    new URL(URL),
    ctx.value,
  );
  assert.equal(response.status, 200);
  const payload = await json(response);
  assert.equal(payload.message.trace_scope, "WORK_ORDER_GROUP");
});
