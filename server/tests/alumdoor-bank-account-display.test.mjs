import assert from "node:assert/strict";
import test from "node:test";

import { alumdoorBankAccountLabel } from "../dist/packages/frappe-api/src/alumdoor-display.js";

test("Alumdoor bank account links show bank, account number and holder", () => {
  assert.equal(
    alumdoorBankAccountLabel({
      name: "100868272670",
      bank_name: "Vietinbank",
      account_number: "100868272670",
      account_holder: "Nguyễn Trọng Triệu",
    }),
    "Vietinbank · 100868272670 · CTK Nguyễn Trọng Triệu",
  );
});

test("bank account display falls back to the document name when legacy fields are empty", () => {
  assert.equal(alumdoorBankAccountLabel({ name: "BANK-1" }), "BANK-1");
});
