import assert from "node:assert/strict";
import test from "node:test";
import { ManufacturingReleaseAuthorityWorkOrderController } from "../dist/packages/clouderp-erpnext/src/manufacturing-release-authority.js";

const NOW = "2026-08-13T12:00:00.000Z";
const bom = {
  tenant_id: "tenant-a", doctype: "Bill of Materials", name: "BOM-1", owner: "u", docstatus: 1, status: "Submitted", version: 1,
  created_at: NOW, modified_at: NOW, children: [],
  data: { company: "ACME", item: "FG", quantity: "1", quantity_micros: 1_000_000, revision: 1, bom_status: "Active", effective_from: "2026-01-01", output_stock_qty_micros: 1_000_000, bom_checksum: "x", items: [{ row_id: "R1", item_code: "RM", qty: "1", qty_micros: 1_000_000, stock_qty_micros: 1_000_000, qty_basis: "Cố định", source_warehouse: "RAW" }] },
};
const reader = {
  async getDocument(_tenant, doctype, name) { return doctype === "Bill of Materials" && name === "BOM-1" ? bom : null; },
  async getMasterRecordData() { return null; },
  async hasMasterRecord() { return true; },
  async listDocumentsByDoctype() { return []; },
};
function context(document) {
  return {
    command: { schema_version: 1, command_id: "c1", tenant_id: "tenant-a", aggregate: { doctype: "Work Order", name: "WO-1" }, action: "save", expected_version: null, payload_hash: "x", document, actor: { user_id: "u", roles: [] }, submitted_at: NOW },
    existing: null, now: NOW, nextVersion: 1, reader,
  };
}

test("AlumDoor Production Request Work Order is not forced through Production Plan", async () => {
  const controller = new ManufacturingReleaseAuthorityWorkOrderController();
  const result = await controller.normalize(context({ company: "ACME", production_item: "FG", bom_no: "BOM-1", qty: "1", source_warehouse: "RAW", target_warehouse: "FG", production_request: "PR-1", production_request_line_key: "SO-ROW-1-SET-1", against_sales_order: "SO-1", sales_order_row_id: "SO-ROW-1" }));
  assert.equal(result.production_request, "PR-1");
  assert.equal(result.production_request_line_key, "SO-ROW-1-SET-1");
  assert.equal(result.sales_order_row_id, "SO-ROW-1");
});

test("release authority cannot mix Production Request and Production Plan", async () => {
  const controller = new ManufacturingReleaseAuthorityWorkOrderController();
  await assert.rejects(controller.normalize(context({ company: "ACME", production_item: "FG", bom_no: "BOM-1", qty: "1", source_warehouse: "RAW", target_warehouse: "FG", production_request: "PR-1", production_request_line_key: "K1", production_plan: "PLAN-1", production_plan_row_id: "P1" })), /cannot mix Production Request and Production Plan/);
});
