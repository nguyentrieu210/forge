import assert from "node:assert/strict";
import test from "node:test";

import { parseLegacyBulkTransactionField } from "../dist/packages/app-registry/src/index.js";

test("legacy action table preserves metadata money precision", () => {
  const spec = {
    columns: [
      { fieldname: "item_code", label: "Mã SP", fieldtype: "Link", options: "Item", required: true },
      { fieldname: "amount", label: "T.Tiền", fieldtype: "Currency" },
    ],
    minRows: 1,
    maxRows: 100,
    allowPaste: true,
    presentation: {
      mode: "child-grid-inline",
      row_doctype: "Purchase Order Item",
      fit_viewport: true,
      money_precision: 0,
    },
  };

  const table = parseLegacyBulkTransactionField({
    fieldname: "items",
    label: "Mặt hàng",
    fieldtype: "Text",
    options: `BulkTransaction:${JSON.stringify(spec)}`,
  }, new Set(["Item", "Purchase Order Item"]));

  assert.ok(table);
  assert.equal(table.presentation.money_precision, 0);
});
