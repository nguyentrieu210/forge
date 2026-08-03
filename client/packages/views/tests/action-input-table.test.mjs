import assert from "node:assert/strict";
import test from "node:test";

import { preferFirstClassActionInputTables } from "../dist/action/input-table.js";

const PREFIX = "BulkTransaction:";

function baseAction() {
  return {
    name: "stock-count",
    label: "Kiểm kê",
    fields: [
      { fieldname: "warehouse", label: "Kho", fieldtype: "Link", options: "Warehouse", required: true },
      {
        fieldname: "lines",
        label: "Legacy lines",
        fieldtype: "Text",
        options: `${PREFIX}${JSON.stringify({ columns: [{ fieldname: "old", label: "Old", fieldtype: "Data" }], minRows: 1, maxRows: 10, allowPaste: false })}`,
      },
    ],
    input_tables: [{
      fieldname: "lines",
      label: "Chi tiết kiểm kê",
      description: "Nhập số lượng thực tế",
      columns: [
        { fieldname: "item_code", label: "Mã hàng", fieldtype: "Link", options: "Item", required: true },
        { fieldname: "qty", label: "Số lượng", fieldtype: "Float", required: true },
      ],
      min_rows: 2,
      max_rows: 500,
      allow_paste: true,
    }],
    commit: { method: "stock.reconcile", label: "Ghi nhận" },
    permission_doctype: "Stock Reconciliation",
  };
}

test("first-class input_tables win over matching legacy fallback without mutating source", () => {
  const source = baseAction();
  const before = structuredClone(source);
  const normalized = preferFirstClassActionInputTables(source);

  assert.deepEqual(source, before);
  assert.notStrictEqual(normalized, source);
  assert.equal(normalized.fields.filter((field) => field.fieldname === "lines").length, 1);
  assert.equal(normalized.fields[0].fieldname, "warehouse");

  const tableField = normalized.fields.find((field) => field.fieldname === "lines");
  assert.equal(tableField.label, "Chi tiết kiểm kê");
  assert.equal(tableField.fieldtype, "Text");
  assert.equal(tableField.required, true);
  assert.equal(tableField.description, "Nhập số lượng thực tế");
  assert.ok(tableField.options.startsWith(PREFIX));

  const spec = JSON.parse(tableField.options.slice(PREFIX.length));
  assert.equal(spec.minRows, 2);
  assert.equal(spec.maxRows, 500);
  assert.equal(spec.allowPaste, true);
  assert.deepEqual(spec.columns.map((column) => column.fieldname), ["item_code", "qty"]);
  assert.equal(normalized.input_tables[0].fieldname, "lines");
});

test("legacy-only actions remain byte-for-byte object-identical at the boundary", () => {
  const action = baseAction();
  delete action.input_tables;
  assert.strictEqual(preferFirstClassActionInputTables(action), action);
});

test("malformed first-class tables fail soft and preserve the existing action", () => {
  const action = baseAction();
  action.input_tables = [{ fieldname: "lines", label: "Broken", columns: [], min_rows: 1, max_rows: 10, allow_paste: true }];
  assert.strictEqual(preferFirstClassActionInputTables(action), action);
});

test("client clamps defensive row bounds to the server contract ceiling", () => {
  const action = baseAction();
  action.input_tables[0].min_rows = 999;
  action.input_tables[0].max_rows = 1200;
  const normalized = preferFirstClassActionInputTables(action);
  const tableField = normalized.fields.find((field) => field.fieldname === "lines");
  const spec = JSON.parse(tableField.options.slice(PREFIX.length));
  assert.equal(spec.minRows, 500);
  assert.equal(spec.maxRows, 500);
});
