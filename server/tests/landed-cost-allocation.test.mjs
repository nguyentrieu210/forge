import test from "node:test";
import assert from "node:assert/strict";
import { allocateLandedCost } from "../dist/packages/clouderp-stock/src/index.js";

test("landed cost reconciles exactly with deterministic largest remainder", () => {
  const result = allocateLandedCost(100, [
    { line_key: "B", basis_units: 1 },
    { line_key: "A", basis_units: 1 },
    { line_key: "C", basis_units: 1 },
  ]);
  assert.deepEqual(result, [
    { line_key: "B", basis_units: 1, allocated_cost_minor: 33 },
    { line_key: "A", basis_units: 1, allocated_cost_minor: 34 },
    { line_key: "C", basis_units: 1, allocated_cost_minor: 33 },
  ]);
  assert.equal(result.reduce((sum, row) => sum + row.allocated_cost_minor, 0), 100);
});

test("negative landed-cost credit allocates exactly with same deterministic basis", () => {
  const result = allocateLandedCost(-5, [
    { line_key: "A", basis_units: 2 },
    { line_key: "B", basis_units: 1 },
  ]);
  assert.deepEqual(result.map((row) => row.allocated_cost_minor), [-3, -2]);
  assert.equal(result.reduce((sum, row) => sum + row.allocated_cost_minor, 0), -5);
});

test("zero basis rejects non-zero landed cost", () => {
  assert.throws(() => allocateLandedCost(10, [
    { line_key: "A", basis_units: 0 },
  ]), /basis cannot be zero/);
});

test("duplicate landed-cost line fails closed", () => {
  assert.throws(() => allocateLandedCost(10, [
    { line_key: "A", basis_units: 1 },
    { line_key: "A", basis_units: 1 },
  ]), /Duplicate landed-cost line/);
});
