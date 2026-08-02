import test from "node:test";
import assert from "node:assert/strict";
import { resolvePurchaseDeliverySchedule } from "../dist/packages/clouderp-core/src/index.js";

function order(overrides = {}) {
  return {
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    transaction_date: "2026-08-03",
    schedule_date: "2026-08-10",
    items: [
      { row_id: "ROW-1", item_code: "ITEM-A", qty: 1, rate: 1 },
      { row_id: "ROW-2", item_code: "ITEM-B", qty: 1, rate: 1, schedule_date: "2026-08-08" },
    ],
    ...overrides,
  };
}

test("delivery schedule uses line date before header fallback", () => {
  const result = resolvePurchaseDeliverySchedule(order());
  assert.deepEqual(result, [
    { row_id: "ROW-1", item_code: "ITEM-A", schedule_date: "2026-08-10", source: "header" },
    { row_id: "ROW-2", item_code: "ITEM-B", schedule_date: "2026-08-08", source: "line" },
  ]);
});

test("delivery schedule permits unscheduled lines when no date is declared", () => {
  const result = resolvePurchaseDeliverySchedule(order({
    schedule_date: undefined,
    items: [{ row_id: "ROW-1", item_code: "ITEM-A", qty: 1, rate: 1 }],
  }));
  assert.equal(result[0].schedule_date, null);
  assert.equal(result[0].source, "unscheduled");
});

test("delivery schedule rejects header or line dates before order date", () => {
  assert.throws(
    () => resolvePurchaseDeliverySchedule(order({ schedule_date: "2026-08-02" })),
    /schedule_date cannot be before transaction_date/,
  );
  assert.throws(
    () => resolvePurchaseDeliverySchedule(order({
      items: [{ row_id: "ROW-1", item_code: "ITEM-A", qty: 1, rate: 1, schedule_date: "2026-08-01" }],
    })),
    /row 1 schedule date cannot be before transaction_date/,
  );
});
