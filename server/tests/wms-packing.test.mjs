import test from "node:test";
import assert from "node:assert/strict";
import { validatePacking } from "../dist/packages/clouderp-stock/src/index.js";

const Q = 1_000_000;

test("packing may split one picked batch across packages without exceeding picked qty", () => {
  const result = validatePacking([
    { item_code: "ITEM-1", warehouse: "WH-1", batch_no: "B1", picked_qty_micros: 5 * Q },
  ], [
    { package_id: "P1", lines: [{ item_code: "ITEM-1", warehouse: "WH-1", batch_no: "B1", packed_qty_micros: 2 * Q }] },
    { package_id: "P2", lines: [{ item_code: "ITEM-1", warehouse: "WH-1", batch_no: "B1", packed_qty_micros: 3 * Q }] },
  ]);
  assert.equal(result.complete, true);
  assert.equal(result.remaining_qty_micros, 0);
});

test("packing rejects unpicked identity and cumulative overpack", () => {
  const picked = [{ item_code: "ITEM-1", warehouse: "WH-1", batch_no: "B1", picked_qty_micros: 2 * Q }];
  assert.throws(() => validatePacking(picked, [
    { package_id: "P1", lines: [{ item_code: "ITEM-1", warehouse: "WH-1", batch_no: "B2", packed_qty_micros: Q }] },
  ]), /was not picked/);
  assert.throws(() => validatePacking(picked, [
    { package_id: "P1", lines: [{ item_code: "ITEM-1", warehouse: "WH-1", batch_no: "B1", packed_qty_micros: 2 * Q }] },
    { package_id: "P2", lines: [{ item_code: "ITEM-1", warehouse: "WH-1", batch_no: "B1", packed_qty_micros: Q }] },
  ]), /exceeds picked quantity/);
});

test("serial packing is exactly one unit", () => {
  assert.throws(() => validatePacking([
    { item_code: "ITEM-1", warehouse: "WH-1", serial_no: "S1", picked_qty_micros: Q },
  ], [
    { package_id: "P1", lines: [{ item_code: "ITEM-1", warehouse: "WH-1", serial_no: "S1", packed_qty_micros: 2 * Q }] },
  ]), /exactly one unit/);
});
