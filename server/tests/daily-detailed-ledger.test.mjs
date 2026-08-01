import test from "node:test";
import assert from "node:assert/strict";
import {
  assertDailyLedgerAdjustmentRole,
  buildDailyLedgerContextKey,
  fingerprintDailyLedgerLines,
} from "../dist/packages/document-kernel/src/daily-detailed-ledger.js";

test("daily ledger context key is normalized and dimension-stable", () => {
  const key = buildDailyLedgerContextKey({
    ledger_date: "2026-08-01",
    company: "  Demo  ",
    warehouse: " Main ",
    customer: " CUST-1 ",
    sales_order: " SO-1 ",
  });
  assert.equal(key, JSON.stringify(["2026-08-01", "Demo", "Main", "CUST-1", "SO-1"]));
  assert.throws(
    () => buildDailyLedgerContextKey({ ledger_date: "2026-02-31", company: "Demo" }),
    (error) => error.code === "VALIDATION_ERROR",
  );
});

test("daily ledger source fingerprint is independent of source row order", async () => {
  const inventory = {
    line_key: "Inventory:Stock Entry:STE-1:1:A",
    domain: "Inventory",
    source_type: "Stock Entry",
    source_ref: "STE-1",
    metric: "stock_value_difference",
    quantity_micros: 1_000_000,
    amount_minor: 50_000,
    currency: "VND",
    details_json: '{"item_code":"A"}',
  };
  const finance = {
    line_key: "Finance:GL:Sales Invoice:SI-1:1:AR",
    domain: "Finance",
    source_type: "Sales Invoice",
    source_ref: "SI-1",
    metric: "gl_net",
    quantity_micros: 0,
    amount_minor: 50_000,
    currency: "VND",
    details_json: '{"account":"131"}',
  };
  const first = await fingerprintDailyLedgerLines([inventory, finance]);
  const second = await fingerprintDailyLedgerLines([finance, inventory]);
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);

  const changed = await fingerprintDailyLedgerLines([
    inventory,
    { ...finance, amount_minor: 50_001 },
  ]);
  assert.notEqual(first, changed);
});

test("post-freeze adjustments require accounting leadership roles", () => {
  assert.doesNotThrow(() => assertDailyLedgerAdjustmentRole({
    user_id: "chief@example.com",
    roles: ["Chief Accountant"],
  }));
  assert.doesNotThrow(() => assertDailyLedgerAdjustmentRole({
    user_id: "director@example.com",
    roles: ["Giám đốc"],
  }));
  assert.doesNotThrow(() => assertDailyLedgerAdjustmentRole({
    user_id: "Administrator",
    roles: [],
  }));
  assert.throws(
    () => assertDailyLedgerAdjustmentRole({ user_id: "stock@example.com", roles: ["Stock Manager"] }),
    (error) => error.code === "PERMISSION_DENIED",
  );
});
