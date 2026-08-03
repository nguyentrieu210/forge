import assert from "node:assert/strict";
import test from "node:test";

import {
  BriefError,
  compileBrief,
} from "../scripts/lib/compile-brief-app-factory.mjs";
import { validateBriefSchema } from "../scripts/lib/validate-brief-schema.mjs";

function brief(overrides = {}) {
  return {
    id: "bulk-demo",
    name: "Bulk Demo",
    worker: "bulk-demo-worker",
    roles: ["Stock User"],
    doctypes: [{
      name: "Receipt",
      fields: ["supplier:Data! Nhà cung cấp"],
      permissions: { "Stock User": "rwc" },
    }],
    actions: [{
      name: "receive-lines",
      label: "Nhận hàng loạt",
      permission: "Receipt",
      fields: ["note:Data Ghi chú"],
      inputTables: [{
        fieldname: "lines",
        label: "Chi tiết",
        columns: [
          { fieldname: "item_code", label: "Mã hàng", fieldtype: "Data", required: true },
          { fieldname: "qty", label: "Số lượng", fieldtype: "Float", required: true },
        ],
        minRows: 1,
        maxRows: 50,
        allowPaste: true,
      }],
      commit: "bulk_demo.receive | Nhận",
    }],
    ...overrides,
  };
}

test("brief schema validation accepts the WS09 inputTables extension without weakening unknown-key checks", async () => {
  assert.deepEqual(await validateBriefSchema(brief()), []);

  const unknown = brief();
  unknown.actions[0].mysteryKey = true;
  const errors = await validateBriefSchema(unknown);
  assert.ok(errors.some((error) => error.includes("additional properties")), errors.join("\n"));
});

test("brief schema validation reports malformed inputTables before compilation", async () => {
  const invalid = brief();
  invalid.actions[0].inputTables[0].columns = [
    { fieldname: "Item Code", label: "Mã", fieldtype: "Link" },
  ];
  invalid.actions[0].inputTables[0].minRows = 20;
  invalid.actions[0].inputTables[0].maxRows = 10;

  const errors = await validateBriefSchema(invalid);
  assert.ok(errors.some((error) => error.includes("fieldname")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("options")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("maxRows")), errors.join("\n"));
});

test("App Factory compiler emits first-class input_tables while leaving scalar fields intact", () => {
  const pkg = compileBrief(brief());
  const action = pkg.actions[0];

  assert.deepEqual(action.fields.map((field) => field.fieldname), ["note"]);
  assert.equal(action.input_tables.length, 1);
  assert.equal(action.input_tables[0].fieldname, "lines");
  assert.equal(action.input_tables[0].min_rows, 1);
  assert.equal(action.input_tables[0].max_rows, 50);
  assert.equal(action.input_tables[0].allow_paste, true);
  assert.deepEqual(action.input_tables[0].columns.map((column) => column.fieldname), ["item_code", "qty"]);
});

test("App Factory compiler refuses scalar/table POST key collisions", () => {
  const invalid = brief();
  invalid.actions[0].fields = ["lines:Text Sai"];

  assert.throws(
    () => compileBrief(invalid),
    (error) => error instanceof BriefError && /cả field thường và inputTables/.test(error.message),
  );
});
