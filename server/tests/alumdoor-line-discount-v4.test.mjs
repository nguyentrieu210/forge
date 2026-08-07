import test from "node:test";
import assert from "node:assert/strict";
import { calculateSalesTotals } from "../dist/packages/clouderp-selling/src/index.js";

test("server-priced manual line discount is applied exactly once", () => {
  const totals = calculateSalesTotals([{
    row_id: "1",
    item_code: "CUA-DUC",
    qty: "10",
    rate: "1000000",
    item_price: "Đại lý:CUA-DUC:M2",
    discount_percentage: "15",
  }], [], 0);

  assert.equal(totals.items[0].discount_percentage, "15.000000");
  assert.equal(totals.items[0].rate, "850000");
  assert.equal(totals.net_total, "8500000");
  assert.equal(totals.grand_total, "8500000");
});

test("pricing-rule discount already folded into resolved rate is not applied twice", () => {
  const totals = calculateSalesTotals([{
    row_id: "1",
    item_code: "CUA-DUC",
    qty: "10",
    rate: "850000",
    item_price: "Đại lý:CUA-DUC:M2",
    pricing_rule: "RULE-15",
    discount_percentage: "15",
  }], [], 0);

  assert.equal(totals.items[0].rate, "850000");
  assert.equal(totals.net_total, "8500000");
});

test("client-only discount without authoritative Item Price cannot change canonical totals", () => {
  const totals = calculateSalesTotals([{
    row_id: "1",
    item_code: "GENERIC",
    qty: "2",
    rate: "100",
    discount_percentage: "90",
  }], [], 0);

  assert.equal(totals.items[0].rate, "100");
  assert.equal(totals.net_total, "200");
});
