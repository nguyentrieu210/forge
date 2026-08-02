import assert from "node:assert/strict";
import test from "node:test";

import {
  assertActionInputNamesUnique,
  parseAppActionInputTable,
  parseLegacyBulkTransactionField,
} from "../dist/packages/app-registry/src/index.js";

const linkTargets = new Set(["Item", "Item Color"]);

function validTable(overrides = {}) {
  return {
    fieldname: "lines",
    label: "Chi tiết nhận",
    description: "Dán nhiều dòng từ Excel hoặc nhập trực tiếp.",
    columns: [
      { fieldname: "item_code", label: "Mã hàng", fieldtype: "Link", options: "Item", required: true },
      { fieldname: "qty_bar", label: "Số cây", fieldtype: "Float", required: true },
      { fieldname: "color", label: "Màu", fieldtype: "Link", options: "Item Color", required: true },
      { fieldname: "is_stamped", label: "Dập", fieldtype: "Select", options: "Có\nKhông", default: "Không" },
    ],
    min_rows: 1,
    max_rows: 100,
    allow_paste: true,
    ...overrides,
  };
}

test("AppAction input-table normalizes a first-class repeatable input", () => {
  const table = parseAppActionInputTable(validTable(), 0, linkTargets);

  assert.equal(table.fieldname, "lines");
  assert.equal(table.min_rows, 1);
  assert.equal(table.max_rows, 100);
  assert.equal(table.allow_paste, true);
  assert.deepEqual(table.columns.map((column) => column.fieldname), [
    "item_code",
    "qty_bar",
    "color",
    "is_stamped",
  ]);
  assert.equal(table.columns[3].default, "Không");
});

test("AppAction input-table defaults row bounds and paste behavior", () => {
  const table = parseAppActionInputTable(validTable({
    min_rows: undefined,
    max_rows: undefined,
    allow_paste: undefined,
  }), 0, linkTargets);

  assert.equal(table.min_rows, 1);
  assert.equal(table.max_rows, 100);
  assert.equal(table.allow_paste, true);
});

test("AppAction input-table refuses duplicate columns and invalid row bounds", () => {
  assert.throws(
    () => parseAppActionInputTable(validTable({
      columns: [
        { fieldname: "item_code", label: "Mã hàng", fieldtype: "Data" },
        { fieldname: "item_code", label: "Mã hàng 2", fieldtype: "Data" },
      ],
    })),
    /Duplicate input_tables\[0\] column: item_code/,
  );

  assert.throws(
    () => parseAppActionInputTable(validTable({ min_rows: 20, max_rows: 10 })),
    /max_rows must be greater than or equal to min_rows/,
  );
});

test("AppAction input-table refuses controls the runtime cannot render", () => {
  assert.throws(
    () => parseAppActionInputTable(validTable({
      columns: [{ fieldname: "lines", label: "Con", fieldtype: "Table" }],
    })),
    /fieldtype is not one an action input table can render/,
  );

  assert.throws(
    () => parseAppActionInputTable(validTable({
      columns: [{ fieldname: "item_code", label: "Mã hàng", fieldtype: "Link" }],
    })),
    /Link but names no options/,
  );

  assert.throws(
    () => parseAppActionInputTable(validTable({
      columns: [{ fieldname: "supplier", label: "NCC", fieldtype: "Link", options: "Supplier" }],
    }), 0, linkTargets),
    /Supplier, which is not declared/,
  );
});

test("legacy BulkTransaction Text transport decodes to the first-class contract", () => {
  const legacySpec = {
    columns: [
      { fieldname: "item_code", label: "Mã hàng", fieldtype: "Link", options: "Item", required: true },
      { fieldname: "qty_bar", label: "Số cây", fieldtype: "Float", required: true },
    ],
    minRows: 1,
    maxRows: 100,
    allowPaste: true,
  };

  const table = parseLegacyBulkTransactionField({
    fieldname: "lines",
    label: "Chi tiết nhôm nhận",
    fieldtype: "Text",
    options: `BulkTransaction:${JSON.stringify(legacySpec)}`,
  }, linkTargets);

  assert.ok(table);
  assert.equal(table.fieldname, "lines");
  assert.equal(table.min_rows, 1);
  assert.equal(table.max_rows, 100);
  assert.equal(table.allow_paste, true);
  assert.deepEqual(table.columns.map((column) => column.fieldname), ["item_code", "qty_bar"]);
});

test("legacy decoder ignores ordinary Text fields but fails closed on malformed compatibility JSON", () => {
  assert.equal(parseLegacyBulkTransactionField({
    fieldname: "note",
    label: "Ghi chú",
    fieldtype: "Text",
    options: "ordinary text options",
  }), undefined);

  assert.throws(
    () => parseLegacyBulkTransactionField({
      fieldname: "lines",
      label: "Chi tiết",
      fieldtype: "Text",
      options: "BulkTransaction:{not-json}",
    }),
    /not valid JSON/,
  );
});

test("scalar fields and repeatable tables cannot post to the same key", () => {
  const table = parseAppActionInputTable(validTable());
  assert.doesNotThrow(() => assertActionInputNamesUnique(["supplier", "warehouse"], [table]));
  assert.throws(
    () => assertActionInputNamesUnique(["lines"], [table]),
    /input key is declared more than once: lines/,
  );
});
