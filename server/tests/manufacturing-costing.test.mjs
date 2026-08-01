import test from "node:test";
import assert from "node:assert/strict";
import { calculateManufacturingCostSummary } from "../dist/packages/clouderp-erpnext/src/manufacturing-costing.js";

test("manufacturing costing closes a completed Work Order to actual cost", () => {
  const result = calculateManufacturingCostSummary({
    target_qty_micros: 10_000_000,
    produced_qty_micros: 10_000_000,
    standard_material_cost_minor: 1_000_000,
    standard_operating_cost_minor: 500_000,
    actual_material_cost_minor: 1_100_000,
    actual_operation_cost_minor: 550_000,
    finished_stock_value_minor: 1_500_000,
  });

  assert.equal(result.completion_micros, 1_000_000);
  assert.equal(result.standard_total_cost_for_completed_minor, 1_500_000);
  assert.equal(result.actual_total_cost_to_date_minor, 1_650_000);
  assert.equal(result.actual_cost_allocated_to_finished_minor, 1_650_000);
  assert.equal(result.estimated_wip_cost_minor, 0);
  assert.equal(result.material_variance_minor, 100_000);
  assert.equal(result.operation_variance_minor, 50_000);
  assert.equal(result.total_variance_minor, 150_000);
  assert.equal(result.valuation_adjustment_to_actual_minor, 150_000);
  assert.equal(result.actual_unit_cost_minor, 165_000);
});

test("manufacturing costing keeps unfinished cost in an explicit WIP estimate", () => {
  const result = calculateManufacturingCostSummary({
    target_qty_micros: 10_000_000,
    produced_qty_micros: 4_000_000,
    standard_material_cost_minor: 1_000_000,
    standard_operating_cost_minor: 500_000,
    actual_material_cost_minor: 430_000,
    actual_operation_cost_minor: 220_000,
    finished_stock_value_minor: 240_000,
  });

  assert.equal(result.completion_micros, 400_000);
  assert.equal(result.standard_material_cost_for_completed_minor, 400_000);
  assert.equal(result.standard_operating_cost_for_completed_minor, 200_000);
  assert.equal(result.actual_total_cost_to_date_minor, 650_000);
  assert.equal(result.actual_cost_allocated_to_finished_minor, 260_000);
  assert.equal(result.estimated_wip_cost_minor, 390_000);
  assert.equal(result.valuation_adjustment_to_actual_minor, 20_000);
});

test("manufacturing costing rejects impossible over-production", () => {
  assert.throws(
    () => calculateManufacturingCostSummary({
      target_qty_micros: 1_000_000,
      produced_qty_micros: 1_000_001,
      standard_material_cost_minor: 1,
      standard_operating_cost_minor: 0,
      actual_material_cost_minor: 1,
      actual_operation_cost_minor: 0,
      finished_stock_value_minor: 1,
    }),
    (error) => error?.code === "VALIDATION_ERROR" && /between zero and target/i.test(error.message),
  );
});
