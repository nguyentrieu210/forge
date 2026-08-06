import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { calculateSalesTotals } from "../dist/packages/clouderp-selling/src/totals.js";

test("commercial VAT totals do not need a ledger account", () => {
  const totals = calculateSalesTotals(
    [{ row_id: "ITEM-1", item_code: "CUA-DUC", uom: "Bộ", qty: 1, rate: 100000 }],
    [{ row_id: "VAT", charge_type: "On Net Total", rate: 10 }],
    2,
  );
  assert.equal(totals.net_total, "100000.00");
  assert.equal(totals.total_taxes_and_charges, "10000.00");
  assert.equal(totals.grand_total, "110000.00");
  assert.equal(totals.taxes[0].account, "");
});

test("Alumdoor Sales Order restores account-less VAT only after canonical validation", () => {
  const totals = fs.readFileSync("server/packages/clouderp-selling/src/totals.ts", "utf8");
  const controllers = fs.readFileSync("server/packages/clouderp-selling/src/controllers.ts", "utf8");
  const coreControllers = fs.readFileSync("server/packages/clouderp-selling/src/controllers-core.ts", "utf8");
  assert.match(totals, /__COMMERCIAL_TAX_/);
  assert.match(controllers, /input\.company !== "ALUMDOOR"/);
  assert.match(controllers, /taxes: taxes\.filter\(hasAccount\)/);
  assert.match(controllers, /calculateSalesTotals\(discountedItems, taxes/);
  assert.match(controllers, /applyOperatorLineDiscounts/);
  assert.match(controllers, /percentOfMinor/);
  assert.match(coreControllers, /SalesInvoiceController/);
  assert.match(coreControllers, /Receivable and income accounts are required/);
  assert.match(coreControllers, /totals\.taxes\.map\(\(tax\): \[string, string\] => \["Account", tax\.account\]\)/);
});
