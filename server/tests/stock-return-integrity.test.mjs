import test from "node:test";
import assert from "node:assert/strict";
import { StockReturnIntegrityController } from "../dist/packages/clouderp-erpnext/src/stock-return-integrity.js";

function context(warehouse) {
  return {
    command: { tenant_id: "tenant-a", action: "submit", document: {
      party: "SUP-1", company: "COMP-A", currency: "VND", posting_at: "2026-08-03T09:00:00.000Z",
      return_against: "PREC-1", return_type: "Purchase",
      items: [{ item_code: "ITEM-1", warehouse: "WH-1", qty: "1" }],
    } },
    reader: { async getMasterRecordData(_tenantId, type) { return type === "Warehouse" ? warehouse : null; } },
  };
}

test("Stock Return rejects cross-company and group warehouse before source mutation plan", async () => {
  const controller = new StockReturnIntegrityController();
  await assert.rejects(() => controller.buildPlan(context({ company: "COMP-B", is_group: 0 })), /belongs to COMP-B, not COMP-A/);
  await assert.rejects(() => controller.buildPlan(context({ company: "COMP-A", is_group: 1 })), /disabled or is a group/);
});
