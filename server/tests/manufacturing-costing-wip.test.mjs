import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../dist/packages/clouderp-erpnext/src/manufacturing-costing-exact.js", import.meta.url).href;

async function loadModule() {
  return import(moduleUrl);
}

test("material WIP is the net stock value actually remaining in transfer target warehouses", async () => {
  const { deriveMaterialWipState } = await loadModule();
  const state = deriveMaterialWipState("", [
    { warehouse: "RAW", line_key: "SRC-R1", stock_value_difference_minor: -1_000, purpose: "Material Transfer" },
    { warehouse: "WIP", line_key: "TGT-R1", stock_value_difference_minor: 1_000, purpose: "Material Transfer" },
    { warehouse: "WIP", line_key: "SRC-R1", stock_value_difference_minor: -600, purpose: "Manufacture" },
    { warehouse: "FG", line_key: "FINISHED", stock_value_difference_minor: 600, purpose: "Manufacture" },
  ]);
  assert.equal(state.material_wip_stock_value_minor, 400);
  assert.deepEqual(state.material_wip_warehouses, ["WIP"]);
  assert.equal(state.material_wip_source, "TRANSFER_TARGETS");
});

test("explicit Work Order WIP warehouse rejects a conflicting material-transfer target", async () => {
  const { deriveMaterialWipState } = await loadModule();
  assert.throws(
    () => deriveMaterialWipState("WIP-A", [
      { warehouse: "WIP-B", line_key: "TGT-R1", stock_value_difference_minor: 500, purpose: "Material Transfer" },
    ]),
    /does not match Work Order WIP warehouse/,
  );
});

test("direct material consumption has exact zero material WIP", async () => {
  const { deriveMaterialWipState } = await loadModule();
  const state = deriveMaterialWipState("", [
    { warehouse: "RAW", line_key: "SRC-R1", stock_value_difference_minor: -700, purpose: "Manufacture" },
    { warehouse: "FG", line_key: "FINISHED", stock_value_difference_minor: 700, purpose: "Manufacture" },
  ]);
  assert.equal(state.material_wip_stock_value_minor, 0);
  assert.deepEqual(state.material_wip_warehouses, []);
  assert.equal(state.material_wip_source, "DIRECT_CONSUMPTION");
});

test("operation WIP estimates only cost completed ahead of finished quantity", async () => {
  const { calculateOperationWipEstimate } = await loadModule();
  const wip = calculateOperationWipEstimate(4_000_000, [
    { operation: "Cắt", completed_qty_micros: 10_000_000, total_cost_minor: 1_000 },
    { operation: "Sơn", completed_qty_micros: 4_000_000, total_cost_minor: 800 },
  ]);
  assert.equal(wip, 600);
});

test("operation WIP becomes zero when finished quantity catches every costed operation", async () => {
  const { calculateOperationWipEstimate } = await loadModule();
  const wip = calculateOperationWipEstimate(10_000_000, [
    { operation: "Cắt", completed_qty_micros: 10_000_000, total_cost_minor: 1_001 },
    { operation: "Sơn", completed_qty_micros: 10_000_000, total_cost_minor: 799 },
  ]);
  assert.equal(wip, 0);
});
