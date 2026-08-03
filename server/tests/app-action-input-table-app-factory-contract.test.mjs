import assert from "node:assert/strict";
import test from "node:test";

import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { parseAppManifestWithInputTables } from "../dist/packages/app-registry/src/index.js";

const brief = {
  id: "receive-grid",
  name: "Receive Grid",
  worker: "receive-grid-worker",
  roles: ["Warehouse User"],
  doctypes: [{
    name: "Receipt",
    fields: ["reference:Data! Tham chiếu"],
    permissions: { "Warehouse User": "rwc" },
  }],
  actions: [{
    name: "bulk-receive",
    label: "Nhận hàng loạt",
    permission: "Receipt",
    inputTables: [{
      fieldname: "lines",
      label: "Chi tiết",
      columns: [
        { fieldname: "item_code", label: "Mã hàng", fieldtype: "Data", required: true },
        { fieldname: "qty", label: "Số lượng", fieldtype: "Float", required: true },
      ],
      minRows: 1,
      maxRows: 200,
      allowPaste: true,
    }],
    commit: "receive_grid.commit | Ghi nhận",
  }],
};

test("App Factory compiles a table-only action and the server-authoritative parser accepts it", () => {
  const pkg = compileBrief(brief);
  assert.deepEqual(pkg.actions[0].fields, [], "compiler-only stub must never enter the package");
  assert.equal(pkg.actions[0].input_tables[0].fieldname, "lines");

  const manifest = parseAppManifestWithInputTables(pkg);
  const action = manifest.actions[0];
  assert.equal(action.input_tables.length, 1);
  assert.equal(action.input_tables[0].max_rows, 200);
  assert.deepEqual(action.input_tables[0].columns.map((column) => column.fieldname), ["item_code", "qty"]);

  const fallback = action.fields.find((field) => field.fieldname === "lines");
  assert.ok(fallback, "server parser view must retain rolling-upgrade fallback");
  assert.equal(fallback.fieldtype, "Text");
  assert.ok(fallback.options.startsWith("BulkTransaction:"));
});
