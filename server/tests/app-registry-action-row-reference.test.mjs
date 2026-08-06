import assert from "node:assert/strict";
import test from "node:test";

import { parseAppActionInputTable } from "../dist/packages/app-registry/src/index.js";

function table(rowReference = {}) {
  return {
    fieldname: "items",
    label: "Mặt hàng",
    columns: [
      { fieldname: "item_code", label: "Mã SP", fieldtype: "Link", options: "Item", required: true },
      { fieldname: "rate", label: "Đơn giá", fieldtype: "Currency", required: true },
    ],
    min_rows: 1,
    max_rows: 100,
    allow_paste: true,
    presentation: {
      mode: "child-grid-inline",
      row_doctype: "Purchase Order Item",
      row_reference: {
        method: "alumdoor.purchase.item_price_history",
        parent_field: "supplier",
        row_field: "item_code",
        response_object_field: "latest",
        value_field: "rate",
        label: "Giá mua gần nhất",
        empty_text: "Chưa có lịch sử mua từ NCC này",
        format: "currency",
        ...rowReference,
      },
    },
  };
}

const linkTargets = new Set(["Item", "Purchase Order Item"]);

test("AppAction input table preserves a read-only row reference declaration", () => {
  const parsed = parseAppActionInputTable(table(), 0, linkTargets);
  assert.deepEqual(parsed.presentation.row_reference, {
    method: "alumdoor.purchase.item_price_history",
    parent_field: "supplier",
    row_field: "item_code",
    response_object_field: "latest",
    value_field: "rate",
    label: "Giá mua gần nhất",
    empty_text: "Chưa có lịch sử mua từ NCC này",
    format: "currency",
  });
});

test("AppAction row reference must bind to a declared table column", () => {
  assert.throws(
    () => parseAppActionInputTable(table({ row_field: "unknown_item" }), 0, linkTargets),
    /row_reference\.row_field must name a declared input-table column/,
  );
});

test("AppAction row reference rejects unsupported presentation formats", () => {
  assert.throws(
    () => parseAppActionInputTable(table({ format: "money-ish" }), 0, linkTargets),
    /format must be currency, number or text/,
  );
});
