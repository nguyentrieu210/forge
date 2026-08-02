import test from "node:test";
import assert from "node:assert/strict";
import { ageInventory, classifyAbc, classifyMovementAge } from "../dist/packages/clouderp-stock/src/index.js";

const Q = 1_000_000;

test("stock aging preserves quantity and value across explicit buckets", () => {
  const buckets = ageInventory([
    { qty_micros: 2 * Q, value_minor: 200, received_at: "2026-07-30T00:00:00.000Z" },
    { qty_micros: 3 * Q, value_minor: 450, received_at: "2026-06-01T00:00:00.000Z" },
    { qty_micros: 4 * Q, value_minor: 800, received_at: "2025-12-01T00:00:00.000Z" },
  ], "2026-08-03T00:00:00.000Z", [30, 90]);
  assert.deepEqual(buckets.map((x) => [x.min_age_days, x.max_age_days, x.qty_micros, x.value_minor]), [
    [0, 30, 2 * Q, 200],
    [31, 90, 3 * Q, 450],
    [91, undefined, 4 * Q, 800],
  ]);
});

test("ABC classification is deterministic and cutoffs are explicit", () => {
  const result = classifyAbc([
    { key: "C", annual_consumption_value_minor: 10 },
    { key: "A", annual_consumption_value_minor: 70 },
    { key: "B", annual_consumption_value_minor: 20 },
  ], 0.8, 0.95);
  assert.deepEqual(result.map((x) => [x.key, x.class]), [["A", "A"], ["B", "B"], ["C", "C"]]);
  assert.throws(() => classifyAbc([], 0.95, 0.8), /ABC cutoffs/);
});

test("slow and dead stock classification honors configured thresholds", () => {
  const result = classifyMovementAge([
    { key: "ACTIVE", last_movement_at: "2026-07-20T00:00:00.000Z", on_hand_qty_micros: Q },
    { key: "SLOW", last_movement_at: "2026-05-01T00:00:00.000Z", on_hand_qty_micros: Q },
    { key: "DEAD", last_movement_at: "2025-01-01T00:00:00.000Z", on_hand_qty_micros: Q },
    { key: "EMPTY", last_movement_at: "2025-01-01T00:00:00.000Z", on_hand_qty_micros: 0 },
    { key: "NEVER", on_hand_qty_micros: Q },
  ], "2026-08-03T00:00:00.000Z", 60, 180);
  assert.deepEqual(result.map((x) => [x.key, x.status]), [
    ["ACTIVE", "Active"], ["SLOW", "Slow"], ["DEAD", "Dead"], ["EMPTY", "No Stock"], ["NEVER", "Never Moved"],
  ]);
});
