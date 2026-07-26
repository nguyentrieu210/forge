import test from "node:test";
import assert from "node:assert/strict";
import { addMinor, fromScaledInt, multiplyScaled, percentOfMinor, toScaledInt } from "../dist/packages/money/src/index.js";
import { calculateSalesTotals } from "../dist/packages/clouderp-selling/src/index.js";

test("fixed-point decimal math avoids binary floating-point drift", () => {
  assert.equal(toScaledInt("0.10", 2), 10);
  assert.equal(multiplyScaled("3", 6, "0.10", 6, 2), 30);
  assert.equal(multiplyScaled("0.1", 6, "0.2", 6, 2), 2);
  assert.equal(percentOfMinor(10_000, "7.25"), 725);
  assert.equal(fromScaledInt(addMinor([10, 20, 30]), 2), "0.60");
});

test("sales totals are canonical decimal strings backed by minor integers", () => {
  const totals = calculateSalesTotals([
    { row_id: "1", item_code: "A", qty: "3", rate: "0.10" },
    { row_id: "2", item_code: "B", qty: "1", rate: "0.20" },
  ], [{ row_id: "T", account: "Tax", rate: "7.25" }], 2);
  assert.equal(totals.net_total_minor, 50);
  assert.equal(totals.net_total, "0.50");
  assert.equal(totals.total_taxes_and_charges_minor, 4);
  assert.equal(totals.grand_total, "0.54");
});

test("advanced tax matrix matches pinned ERPNext oracle examples", () => {
  const item = [{ row_id: "1", item_code: "A", qty: "1", rate: "500" }];
  const multi = calculateSalesTotals(item, [
    { row_id: "T1", account: "Tax A", rate: "10" },
    { row_id: "T2", account: "Tax B", rate: "5" },
  ], 2);
  assert.equal(multi.net_total, "500.00");
  assert.deepEqual(multi.taxes.map((row) => row.tax_amount), ["50.00", "25.00"]);
  assert.equal(multi.grand_total, "575.00");

  const previous = calculateSalesTotals(item, [
    { row_id: "T1", account: "Tax A", rate: "10" },
    { row_id: "T2", account: "Tax B", rate: "5", charge_type: "On Previous Row Total" },
  ], 2);
  assert.deepEqual(previous.taxes.map((row) => row.tax_amount), ["50.00", "27.50"]);
  assert.equal(previous.grand_total, "577.50");

  const actual = calculateSalesTotals(item, [{ row_id: "T", account: "Tax", rate: "0", charge_type: "Actual", tax_amount: "37.50" }], 2);
  assert.equal(actual.grand_total, "537.50");

  const perQty = calculateSalesTotals([{ row_id: "1", item_code: "A", qty: "5", rate: "100" }], [
    { row_id: "T", account: "Tax", rate: "3", charge_type: "On Item Quantity" },
  ], 2);
  assert.equal(perQty.taxes[0].tax_amount, "15.00");
  assert.equal(perQty.grand_total, "515.00");
});

test("inclusive tax, document discount and currency-rate rounding are deterministic", () => {
  const inclusive = calculateSalesTotals([{ row_id: "1", item_code: "A", qty: "1", rate: "500" }], [
    { row_id: "T", account: "Tax", rate: "10", included_in_print_rate: true },
  ], 2);
  assert.equal(inclusive.net_total, "454.55");
  assert.equal(inclusive.taxes[0].tax_amount, "45.46");
  assert.equal(inclusive.rounding_adjustment, "-0.01");
  assert.equal(inclusive.grand_total, "500.00");

  const netDiscount = calculateSalesTotals([{ row_id: "1", item_code: "A", qty: "1", rate: "500" }], [
    { row_id: "T", account: "Tax", rate: "10" },
  ], 2, { apply_discount_on: "Net Total", additional_discount_percentage: "10" });
  assert.equal(netDiscount.net_total, "450.00");
  assert.equal(netDiscount.taxes[0].tax_amount, "45.00");
  assert.equal(netDiscount.discount_amount, "50.00");
  assert.equal(netDiscount.grand_total, "495.00");

  const grandDiscount = calculateSalesTotals([{ row_id: "1", item_code: "A", qty: "1", rate: "500" }], [
    { row_id: "T", account: "Tax", rate: "10" },
  ], 2, { apply_discount_on: "Grand Total", additional_discount_percentage: "10" });
  assert.equal(grandDiscount.net_total, "450.00");
  assert.equal(grandDiscount.taxes[0].tax_amount, "45.00");
  assert.equal(grandDiscount.discount_amount, "55.00");
  assert.equal(grandDiscount.grand_total, "495.00");

  const roundedRate = calculateSalesTotals([{ row_id: "1", item_code: "A", qty: "3", rate: "10.005" }], [
    { row_id: "T", account: "Tax", rate: "6.25" },
  ], 2);
  assert.equal(roundedRate.net_total, "30.03");
  assert.equal(roundedRate.taxes[0].tax_amount, "1.88");
  assert.equal(roundedRate.grand_total, "31.91");
});

test("deductive Actual tax, fixed Grand Total discount and normalized re-entry remain stable", () => {
  const item = [{ row_id: "1", item_code: "A", qty: "1", rate: "100" }];
  const deduct = calculateSalesTotals(item, [{
    row_id: "T", account: "Withholding", rate: "0", charge_type: "Actual",
    add_deduct_tax: "Deduct", actual_tax_amount: "10",
  }], 2);
  assert.equal(deduct.taxes[0].actual_tax_amount, "10.00");
  assert.equal(deduct.taxes[0].tax_amount, "-10.00");
  assert.equal(deduct.grand_total, "90.00");

  // A GET response can be submitted/saved again without treating its signed
  // canonical tax_amount or computed percentage discount as a second input.
  const reentered = calculateSalesTotals(deduct.items, deduct.taxes, 2, {
    apply_discount_on: deduct.apply_discount_on,
    additional_discount_percentage: deduct.additional_discount_percentage,
    discount_amount: deduct.discount_amount,
  });
  assert.equal(reentered.grand_total, "90.00");
  assert.equal(reentered.taxes[0].tax_amount, "-10.00");

  const fixedGrand = calculateSalesTotals(item, [{ row_id: "T", account: "Tax", rate: "7.25" }], 2, {
    apply_discount_on: "Grand Total", discount_amount: "10.00",
  });
  assert.equal(fixedGrand.discount_amount, "10.00");
  assert.equal(fixedGrand.grand_total, "97.25");
  assert.equal(
    fixedGrand.net_total_minor + fixedGrand.total_taxes_and_charges_minor + fixedGrand.rounding_adjustment_minor,
    fixedGrand.grand_total_minor,
  );

  const percentageReentry = calculateSalesTotals(item, [{ row_id: "T", account: "Tax", rate: "10" }], 2, {
    apply_discount_on: "Grand Total", additional_discount_percentage: "10", discount_amount: "11.00",
  });
  assert.equal(percentageReentry.discount_amount, "11.00");
  assert.equal(percentageReentry.grand_total, "99.00");
});
