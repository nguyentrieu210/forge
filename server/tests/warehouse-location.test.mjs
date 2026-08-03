import test from "node:test";
import assert from "node:assert/strict";
import { resolveWarehousePath } from "../dist/packages/clouderp-stock/src/index.js";

function context(records) {
  return {
    command: { tenant_id: "tenant-a" },
    reader: { async getMasterRecordData(_tenantId, type, name) { return type === "Warehouse" ? records[name] ?? null : null; } },
  };
}

test("warehouse path resolves root to physical leaf and allows existing leaf-parent convention", async () => {
  const path = await resolveWarehousePath(context({
    ROOT: { company: "COMP-A", is_group: 1 },
    K36: { company: "COMP-A", parent_warehouse: "ROOT", is_group: 0, stock_role: "Kho chính" },
    "K36-DT": { company: "COMP-A", parent_warehouse: "K36", is_group: 0, stock_role: "Kho đầu thừa" },
  }), "K36-DT", "COMP-A");
  assert.deepEqual(path.map((x) => x.name), ["ROOT", "K36", "K36-DT"]);
});

test("warehouse path rejects cycle, disabled ancestor and cross-company parent", async () => {
  await assert.rejects(() => resolveWarehousePath(context({ A: { company: "COMP-A", parent_warehouse: "B", is_group: 0 }, B: { company: "COMP-A", parent_warehouse: "A", is_group: 1 } }), "A", "COMP-A"), /cycle/);
  await assert.rejects(() => resolveWarehousePath(context({ A: { company: "COMP-A", parent_warehouse: "ROOT", is_group: 0 }, ROOT: { company: "COMP-A", disabled: 1, is_group: 1 } }), "A", "COMP-A"), /disabled/);
  await assert.rejects(() => resolveWarehousePath(context({ A: { company: "COMP-A", parent_warehouse: "ROOT", is_group: 0 }, ROOT: { company: "COMP-B", is_group: 1 } }), "A", "COMP-A"), /belongs to COMP-B, not COMP-A/);
});
