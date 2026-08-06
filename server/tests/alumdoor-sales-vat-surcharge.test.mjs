import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sheet = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesSheetV2.tsx", "utf8");

test("sales sheet exposes editable VAT and surcharge before confirmation", () => {
  assert.match(sheet, /VAT %/);
  assert.match(sheet, /Phụ thu/);
  assert.match(sheet, /value=\{vatPct\}/);
  assert.match(sheet, /value=\{surcharge\}/);
  assert.match(sheet, /Tài khoản VAT/);
  assert.match(sheet, /Tài khoản phụ thu/);
});

test("VAT and surcharge affect the live payable total", () => {
  assert.match(sheet, /const taxableTotal = Math\.max\(0, grossTotal - totalDiscount\)/);
  assert.match(sheet, /const totalVat = Number\.isFinite\(vatRate\) && vatRate > 0 \? taxableTotal \* vatRate \/ 100 : 0/);
  assert.match(sheet, /const totalSurcharge = Number\.isFinite\(surchargeValue\) && surchargeValue > 0 \? surchargeValue : 0/);
  assert.match(sheet, /const total = taxableTotal \+ totalVat \+ totalSurcharge/);
});

test("VAT and surcharge persist through canonical Sales Taxes and Charges rows", () => {
  assert.match(sheet, /charge_type: "On Net Total"[\s\S]*account_head: vatAccount[\s\S]*rate: vatRate/);
  assert.match(sheet, /charge_type: "Actual"[\s\S]*account_head: surchargeAccount[\s\S]*tax_amount: surchargeValue/);
  assert.match(sheet, /taxes: buildTaxes\(\)/);
});

test("financial charges fail closed without explicit ledger accounts", () => {
  assert.match(sheet, /vatRate > 0 && !vatAccount/);
  assert.match(sheet, /surchargeValue > 0 && !surchargeAccount/);
  assert.match(sheet, /VAT phải từ 0 đến 100%/);
  assert.match(sheet, /Phụ thu phải lớn hơn hoặc bằng 0/);
});
