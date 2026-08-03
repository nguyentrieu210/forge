import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAppManifestWithInputTables,
} from "../dist/packages/app-registry/src/index.js";

function packageWithTable(overrides = {}) {
  return {
    id: "bulk-demo",
    name: "Bulk Demo",
    version: "1.0.0",
    doctypes: [{
      name: "Receipt",
      module: "Stock",
      fields: [{ fieldname: "supplier", label: "Nhà cung cấp", fieldtype: "Data" }],
      permissions: [{ role: "Stock User", read: true, write: true, create: true }],
      revision: 1,
    }],
    roles: [{ role: "Stock User" }],
    worker: "bulk-demo-worker",
    actions: [{
      name: "receive-lines",
      label: "Nhận hàng loạt",
      fields: [{ fieldname: "note", label: "Ghi chú", fieldtype: "Data" }],
      input_tables: [{
        fieldname: "lines",
        label: "Chi tiết",
        columns: [
          { fieldname: "item_code", label: "Mã hàng", fieldtype: "Data", required: true },
          { fieldname: "qty", label: "Số lượng", fieldtype: "Float", required: true },
        ],
        min_rows: 1,
        max_rows: 50,
        allow_paste: true,
      }],
      commit: { method: "bulk_demo.receive", label: "Nhận" },
      permission_doctype: "Receipt",
    }],
    ...overrides,
  };
}

test("tooling parser validates through the canonical manifest parser and exposes first-class input_tables", () => {
  const manifest = parseAppManifestWithInputTables(packageWithTable());
  const action = manifest.actions[0];

  assert.equal(action.name, "receive-lines");
  assert.equal(action.input_tables.length, 1);
  assert.equal(action.input_tables[0].fieldname, "lines");
  assert.equal(action.input_tables[0].max_rows, 50);
  assert.deepEqual(action.input_tables[0].columns.map((column) => column.fieldname), ["item_code", "qty"]);

  const compatibility = action.fields.find((field) => field.fieldname === "lines");
  assert.ok(compatibility, "rolling-upgrade compatibility field remains visible in tooling view");
  assert.equal(compatibility.fieldtype, "Text");
  assert.ok(compatibility.options.startsWith("BulkTransaction:"));
});

test("tooling parser still applies canonical manifest rules after lowering", () => {
  assert.throws(
    () => parseAppManifestWithInputTables(packageWithTable({ worker: undefined })),
    /declares actions but no worker/,
  );

  const invalid = packageWithTable();
  invalid.actions[0].permission_doctype = "Secret Receipt";
  assert.throws(
    () => parseAppManifestWithInputTables(invalid),
    /permission_doctype points at Secret Receipt/,
  );
});

test("tooling parser rejects a first-class table colliding with a scalar action key", () => {
  const invalid = packageWithTable();
  invalid.actions[0].fields = [{ fieldname: "lines", label: "Sai", fieldtype: "Text" }];
  assert.throws(
    () => parseAppManifestWithInputTables(invalid),
    /input key is declared more than once: lines/,
  );
});
