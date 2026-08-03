import test from "node:test";
import assert from "node:assert/strict";
import { planProcurementLandedCost } from "../dist/packages/clouderp-core/src/index.js";

function receipt(name, company, currency, items, docstatus = 1) {
  return {
    tenant_id: "demo",
    doctype: "Purchase Receipt",
    name,
    owner: "buyer@example.com",
    docstatus,
    status: docstatus === 1 ? "Submitted" : "Draft",
    version: docstatus === 1 ? 2 : 1,
    created_at: "2026-08-04T03:00:00.000Z",
    modified_at: "2026-08-04T03:00:00.000Z",
    data: {
      supplier: `SUP-${name}`,
      company,
      currency,
      currency_scale: 2,
      posting_at: "2026-08-04T03:00:00.000Z",
      items,
    },
    children: [],
  };
}

const receiptA = receipt("PR-LC-A", "Demo", "USD", [{
  row_id: "A1",
  item_code: "ITEM-A",
  warehouse: "Stores",
  qty: "1",
  qty_micros: 1_000_000,
  stock_qty: "1",
  stock_qty_micros: 1_000_000,
  rate: "100",
  amount_minor: 10_000,
  net_amount_minor: 10_000,
  actual_weight_micros: 2_000_000,
}]);
const receiptB = receipt("PR-LC-B", "Demo", "USD", [{
  row_id: "B1",
  item_code: "ITEM-B",
  warehouse: "Stores",
  qty: "3",
  qty_micros: 3_000_000,
  stock_qty: "3",
  stock_qty_micros: 3_000_000,
  rate: "100",
  amount_minor: 30_000,
  net_amount_minor: 30_000,
  actual_weight_micros: 1_000_000,
}]);

test("procurement landed-cost orchestration reuses exact stock allocator and reconciles amount basis", () => {
  const plan = planProcurementLandedCost(1_001, "amount", [receiptA, receiptB]);
  assert.equal(plan.company, "Demo");
  assert.equal(plan.currency, "USD");
  assert.equal(plan.total_cost_minor, 1_001);
  assert.deepEqual(plan.allocations.map((line) => [line.line_key, line.allocated_cost_minor]), [
    ["PR-LC-A:A1", 250],
    ["PR-LC-B:B1", 751],
  ]);
  assert.equal(plan.allocations.reduce((sum, line) => sum + line.allocated_cost_minor, 0), 1_001);
  assert.equal("stock_entries" in plan, false);
  assert.equal("gl_entries" in plan, false);
});

test("procurement landed-cost orchestration supports canonical quantity and measured-weight bases", () => {
  const quantity = planProcurementLandedCost(1_001, "quantity", [receiptA, receiptB]);
  assert.deepEqual(quantity.allocations.map((line) => line.allocated_cost_minor), [250, 751]);

  const weight = planProcurementLandedCost(1_001, "weight", [receiptA, receiptB]);
  assert.deepEqual(weight.allocations.map((line) => line.allocated_cost_minor), [667, 334]);
  assert.equal(weight.basis_total_units, 3_000_000);
});

test("procurement landed-cost orchestration rejects draft or cross-company/currency sources", () => {
  assert.throws(
    () => planProcurementLandedCost(100, "amount", [receiptA, receipt("PR-DRAFT", "Demo", "USD", receiptB.data.items, 0)]),
    /Submitted Purchase Receipt PR-DRAFT is required/,
  );
  assert.throws(
    () => planProcurementLandedCost(100, "amount", [receiptA, receipt("PR-OTHER-CO", "Other", "USD", receiptB.data.items)]),
    /must share Company, Currency and currency scale/,
  );
  assert.throws(
    () => planProcurementLandedCost(100, "amount", [receiptA, receipt("PR-OTHER-CUR", "Demo", "VND", receiptB.data.items)]),
    /must share Company, Currency and currency scale/,
  );
});

test("procurement landed-cost weight basis fails closed without measured weight", () => {
  const missingWeight = receipt("PR-NO-WEIGHT", "Demo", "USD", [{
    row_id: "NW1",
    item_code: "ITEM-NW",
    warehouse: "Stores",
    qty: "1",
    qty_micros: 1_000_000,
    rate: "10",
    net_amount_minor: 1_000,
  }]);
  assert.throws(
    () => planProcurementLandedCost(100, "weight", [missingWeight]),
    /requires measured weight/,
  );
});
