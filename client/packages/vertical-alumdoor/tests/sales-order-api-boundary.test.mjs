import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workbenchUrl = new URL("../src/quotation/AlumdoorQuotationWorkbench.tsx", import.meta.url);

test("màn Đơn hàng chỉ gọi API Sales Order, không gọi runtime Quotation", async () => {
  const source = await readFile(workbenchUrl, "utf8");

  assert.doesNotMatch(source, /services\.quotation_service/);
  assert.match(source, /api_v1\.get_customer_context/);
  assert.match(source, /api_v1\.get_item_sales_context/);
  assert.match(source, /api_v1\.calculate_order/);
  assert.match(source, /api_v1\.save_order/);
  assert.match(source, /idempotency_key:\s*requestKey\(\)/);
  assert.match(source, /expected_modified:\s*text\(doc\.modified\)/);
});

test("tổng tiền trên màn đọc kết quả server thay vì tự cộng lại dòng", async () => {
  const source = await readFile(workbenchUrl, "utf8");

  assert.match(source, /subtotal:\s*number\(doc\.subtotal\)/);
  assert.match(source, /grand:\s*number\(doc\.grand_total\)/);
  assert.match(source, /outstanding:\s*number\(doc\.outstanding_amount\)/);
  assert.doesNotMatch(source, /const vat = \(subtotal - discount \+ surcharge\)/);
});

test("commit trễ cùng giá trị không được hủy kết quả tính đang chạy", async () => {
  const source = await readFile(workbenchUrl, "utf8");

  assert.match(source, /const changed = Object\.entries\(next\)\.some/);
  assert.match(source, /linesRef\.current\.find/);
  assert.match(source, /if \(changed\) patchLine\(key, next, invalidate\)/);
});
