import test from "node:test";
import assert from "node:assert/strict";

import { routeManufacturingCostingApi } from "../dist/apps/tenant-worker/src/manufacturing-costing-api.js";

const path = "/api/method/metaforge.manufacturing.get_work_order_lifecycle";

function workOrder(requiredItems = []) {
  return {
    tenant_id: "tenant-a", doctype: "Work Order", name: "WO-1", owner: "u",
    docstatus: 1, status: "Not Started", version: 1,
    created_at: "2026-08-13T00:00:00.000Z", modified_at: "2026-08-13T00:00:00.000Z", children: [],
    data: {
      company: "ACME", production_item: "FG", bom_no: "BOM-FG", qty: "1", qty_micros: 1_000_000,
      produced_qty: "0", produced_qty_micros: 0, source_warehouse: "RAW", target_warehouse: "FG",
      required_items: requiredItems,
    },
  };
}

function stockEntry() {
  return {
    tenant_id: "tenant-a", doctype: "Stock Entry", name: "STE-1", owner: "u",
    docstatus: 1, status: "Submitted", version: 1,
    created_at: "2026-08-13T00:00:00.000Z", modified_at: "2026-08-13T00:00:00.000Z", children: [],
    data: {
      company: "ACME", posting_at: "2026-08-13", purpose: "Material Transfer", work_order: "WO-1",
      items: [{ row_id: "I1", bom_row_id: "B1", item_code: "RM", qty: "0.5", qty_micros: 500_000, manufacturing_kind: "Issue" }],
    },
  };
}

async function invoke({ work = workOrder(), stock = [], ledger = async () => { throw new Error("ledger must not be read"); } } = {}) {
  return routeManufacturingCostingApi(
    new Request(`https://tenant.test${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ work_order: "WO-1" }) }),
    new URL(`https://tenant.test${path}`),
    {
      tenantId: "tenant-a", actor: { user_id: "u", roles: ["Manufacturing User"] }, traceId: "trace",
      permissions: { canReadDocument: async () => true },
      loadWorkOrder: async () => work,
      loadBom: async () => null,
      listStockEntries: async () => stock,
      getVoucherStockEntries: ledger,
    },
  );
}

test("lifecycle endpoint does not fetch Stock Ledger evidence", async () => {
  const response = await invoke();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message.stage, "RELEASED");
});

test("legacy Work Order with submitted execution cannot advertise cancel", async () => {
  const response = await invoke({ work: workOrder([]), stock: [stockEntry()] });
  const body = await response.json();
  assert.equal(body.message.actions.can_cancel_work_order, false);
});

test("material progress remains exact BOM-row scoped", async () => {
  const work = workOrder([
    { row_id: "B1", item_code: "RM", required_qty: "1", required_qty_micros: 1_000_000, source_warehouse: "RAW" },
  ]);
  const response = await invoke({ work, stock: [stockEntry()] });
  const body = await response.json();
  assert.equal(body.message.material_rows.length, 1);
  assert.equal(body.message.material_rows[0].issued_qty_micros, 500_000);
  assert.equal(body.message.material_rows[0].remaining_to_issue_micros, 500_000);
  assert.equal("issued_qty_micros" in body.message, false);
});
