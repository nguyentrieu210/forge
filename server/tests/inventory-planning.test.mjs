import test from "node:test";
import assert from "node:assert/strict";
import { inventoryPosition, planMinMaxReplenishment, planPicking, planPutaway } from "../dist/packages/clouderp-stock/src/index.js";

const Q = 1_000_000;

test("putaway respects priority and reports unallocated quantity", () => {
  const full = planPutaway(6 * Q, [
    { warehouse: "A", priority: 1, capacity_qty_micros: 5 * Q, current_qty_micros: 2 * Q },
    { warehouse: "B", priority: 2, capacity_qty_micros: 10 * Q, current_qty_micros: 0 },
  ]);
  assert.deepEqual(full.allocations.map((x) => [x.warehouse, x.qty_micros]), [["A", 3 * Q], ["B", 3 * Q]]);
  assert.equal(full.unallocated_qty_micros, 0);
  const short = planPutaway(8 * Q, [{ warehouse: "A", priority: 1, capacity_qty_micros: 5 * Q, current_qty_micros: 2 * Q }]);
  assert.equal(short.unallocated_qty_micros, 5 * Q);
});

test("picking never over-allocates and follows resolved sequence", () => {
  const plan = planPicking(7 * Q, [
    { warehouse: "B", batch_no: "B2", sequence: 2, available_qty_micros: 5 * Q },
    { warehouse: "A", batch_no: "B1", sequence: 1, available_qty_micros: 3 * Q },
  ]);
  assert.deepEqual(plan.allocations.map((x) => [x.batch_no, x.qty_micros]), [["B1", 3 * Q], ["B2", 4 * Q]]);
  assert.equal(plan.shortage_qty_micros, 0);
});

test("picking exposes shortage and serial candidate must equal one unit", () => {
  assert.equal(planPicking(5 * Q, [{ warehouse: "A", sequence: 1, available_qty_micros: 2 * Q }]).shortage_qty_micros, 3 * Q);
  assert.throws(() => planPicking(Q, [{ warehouse: "A", serial_no: "S1", sequence: 1, available_qty_micros: 2 * Q }]), /exactly one unit/);
});

test("inventory position subtracts reservations without moving physical stock", () => {
  assert.deepEqual(inventoryPosition({ on_hand_qty_micros: 100 * Q, inbound_qty_micros: 20 * Q, outbound_qty_micros: 15 * Q, reserved_qty_micros: 30 * Q }), {
    on_hand_qty_micros: 100 * Q, inbound_qty_micros: 20 * Q, outbound_qty_micros: 15 * Q, reserved_qty_micros: 30 * Q, projected_qty_micros: 75 * Q,
  });
});

test("projected stock supports explicitly allowed negative on-hand", () => {
  const position = inventoryPosition({ on_hand_qty_micros: -5 * Q, inbound_qty_micros: 2 * Q });
  assert.equal(position.projected_qty_micros, -3 * Q);
  const plan = planMinMaxReplenishment({ on_hand_qty_micros: -5 * Q }, { min_qty_micros: 5 * Q, max_qty_micros: 20 * Q });
  assert.equal(plan.suggested_qty_micros, 25 * Q);
});

test("min-max replenishment triggers below min and replenishes exactly to max", () => {
  const plan = planMinMaxReplenishment({ on_hand_qty_micros: 20 * Q, inbound_qty_micros: 5 * Q, reserved_qty_micros: 12 * Q }, {
    min_qty_micros: 15 * Q, max_qty_micros: 40 * Q, safety_stock_qty_micros: 10 * Q,
  });
  assert.equal(plan.projected_qty_micros, 13 * Q);
  assert.equal(plan.reorder_required, true);
  assert.equal(plan.suggested_qty_micros, 27 * Q);
  assert.equal(plan.below_safety_stock, false);
});

test("safety stock remains diagnostic and invalid min-max policy fails closed", () => {
  const plan = planMinMaxReplenishment({ on_hand_qty_micros: 8 * Q }, { min_qty_micros: 5 * Q, max_qty_micros: 20 * Q, safety_stock_qty_micros: 10 * Q });
  assert.equal(plan.below_safety_stock, true);
  assert.equal(plan.reorder_required, false);
  assert.equal(plan.suggested_qty_micros, 0);
  assert.throws(() => planMinMaxReplenishment({ on_hand_qty_micros: Q }, { min_qty_micros: 20 * Q, max_qty_micros: 10 * Q }), /max_qty_micros/);
});
