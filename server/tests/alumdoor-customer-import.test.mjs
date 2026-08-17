import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomerImportRow } from "../dist/apps-src/alumdoor-worker/src/customer-import.js";

test("customer import requires canonical customer name and price group", () => {
  const missing = normalizeCustomerImportRow({ customer_name: "  ", price_group: "" });
  assert.match(missing.errors.customer_name, /bắt buộc/i);
  assert.match(missing.errors.price_group, /bắt buộc/i);

  const guessed = normalizeCustomerImportRow({ customer_name: "Công ty A", price_group: "Khác" });
  assert.match(guessed.errors.price_group, /Đại lý.*Lẻ/i);
  assert.equal(guessed.normalized.price_group, undefined);
});

test("customer import preserves string tax ids and normalizes contact values", () => {
  const result = normalizeCustomerImportRow({
    customer_name: "  Công ty Minh Huy  ",
    price_group: "Đại lý",
    tax_id: " 0012345678 ",
    phone: "090 123-4567",
    email: " SALES@EXAMPLE.COM ",
    disabled: "không",
  });
  assert.deepEqual(result.errors, {});
  assert.equal(result.normalized.customer_name, "Công ty Minh Huy");
  assert.equal(result.normalized.price_group, "Đại lý");
  assert.equal(result.normalized.tax_id, "0012345678");
  assert.equal(result.normalized.phone, "0901234567");
  assert.equal(result.normalized.email, "sales@example.com");
  assert.equal(result.normalized.disabled, false);
});

test("customer import rejects unsafe values instead of guessing", () => {
  const result = normalizeCustomerImportRow({
    customer_name: "Khách A",
    price_group: "Lẻ",
    credit_limit: "-100",
    email: "not-an-email",
    disabled: "maybe",
    payment_terms: "90 ngày",
    unknown_field: "x",
  });
  assert.match(result.errors.credit_limit, /không âm/i);
  assert.match(result.errors.email, /định dạng/i);
  assert.match(result.errors.disabled, /0\/1/i);
  assert.match(result.errors.payment_terms, /không hợp lệ/i);
  assert.match(result.errors.unknown_field, /không được/i);
});
