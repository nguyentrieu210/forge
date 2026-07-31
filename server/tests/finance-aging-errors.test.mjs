import test from "node:test";
import assert from "node:assert/strict";
import { asCloudForgeError } from "../dist/packages/core/src/index.js";

for (const [databaseCode, message] of [
  ["INVOICE_DUE_DATE_REQUIRED", "Invoice due date is required before submission"],
  ["INVOICE_DUE_DATE_INVALID", "Invoice due date must be a valid YYYY-MM-DD date"],
  ["INVOICE_DUE_DATE_BEFORE_POSTING", "Invoice due date cannot be before the posting date"],
  ["INVOICE_POSTING_DATE_INVALID", "Invoice posting date is invalid"],
]) {
  test(`maps ${databaseCode} to safe validation error`, () => {
    const error = asCloudForgeError(new Error(`D1_ERROR: ${databaseCode}`));
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.equal(error.status, 422);
    assert.equal(error.message, message);
    assert.ok(!error.message.includes("D1_ERROR"));
  });
}
