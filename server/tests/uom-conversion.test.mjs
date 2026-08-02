import test from "node:test";
import assert from "node:assert/strict";
import { convertUomQuantity } from "../dist/packages/clouderp-stock/src/index.js";

const Q = 1_000_000;

test("exact UOM conversion preserves authoritative fixed-point quantity", () => {
  const result = convertUomQuantity(2 * Q, 12, 1, "EXACT");
  assert.equal(result.target_qty_micros, 24 * Q);
  assert.equal(result.exact, true);
});

test("EXACT mode rejects non-representable conversion instead of silently rounding", () => {
  assert.throws(() => convertUomQuantity(1, 1, 3, "EXACT"), /not exactly representable/);
});

test("HALF_UP must be explicit and handles signed quantities symmetrically", () => {
  assert.equal(convertUomQuantity(1, 1, 2, "HALF_UP").target_qty_micros, 1);
  assert.equal(convertUomQuantity(-1, 1, 2, "HALF_UP").target_qty_micros, -1);
});

test("invalid UOM factor fails closed", () => {
  assert.throws(() => convertUomQuantity(Q, 0, 1, "EXACT"), /must be positive/);
});
