import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sheet = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesSheetV2.tsx", "utf8");

test("VAT lives in the totals block and accounting controls are absent", () => {
  assert.match(sheet, /Tổng tiền/);
  assert.match(sheet, /Tạm tính/);
  assert.match(sheet, /Sau chiết khấu/);
  assert.match(sheet, /VAT \(%\)/);
  assert.match(sheet, /Tiền VAT/);
  assert.match(sheet, /TỔNG THANH TOÁN/);
  assert.doesNotMatch(sheet, /Tài khoản VAT/);
  assert.doesNotMatch(sheet, /Tài khoản phụ thu/);
  assert.doesNotMatch(sheet, /Phụ thu/);
});

test("commercial VAT affects payable total and persists without account_head", () => {
  assert.match(sheet, /const taxableTotal = Math\.max\(0, grossTotal - totalDiscount\)/);
  assert.match(sheet, /const totalVat = Number\.isFinite\(vatRate\) && vatRate > 0 \? taxableTotal \* vatRate \/ 100 : 0/);
  assert.match(sheet, /const total = taxableTotal \+ totalVat/);
  assert.match(sheet, /charge_type: "On Net Total"/);
  assert.match(sheet, /description: `VAT/);
  assert.doesNotMatch(sheet, /account_head/);
});
