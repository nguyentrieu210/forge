import assert from "node:assert/strict";
import test from "node:test";

import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { validateBriefSchema } from "../scripts/lib/validate-brief-schema.mjs";

function tableOnlyBrief() {
  return {
    id: "bulk-only",
    name: "Bulk Only",
    worker: "bulk-only-worker",
    roles: ["Stock User"],
    doctypes: [{
      name: "Receipt",
      fields: ["title:Data! Phiếu"],
      permissions: { "Stock User": "rwc" },
    }],
    actions: [{
      name: "receive-lines",
      label: "Nhận hàng loạt",
      permission: "Receipt",
      inputTables: [{
        fieldname: "lines",
        label: "Chi tiết",
        columns: [
          { fieldname: "item_code", label: "Mã hàng", fieldtype: "Data", required: true },
          { fieldname: "qty", label: "Số lượng", fieldtype: "Float", required: true },
        ],
      }],
      commit: "bulk_only.receive | Nhận",
    }],
  };
}

test("table-only AppAction passes the transitional schema adapter", async () => {
  const source = tableOnlyBrief();
  const before = structuredClone(source);

  assert.deepEqual(await validateBriefSchema(source), []);
  assert.deepEqual(source, before, "schema validation must not mutate the author brief");
});

test("table-only AppAction compiles without leaking the internal scalar stub", () => {
  const source = tableOnlyBrief();
  const before = structuredClone(source);
  const pkg = compileBrief(source);

  assert.deepEqual(source, before, "compilation must not mutate the author brief");
  assert.deepEqual(pkg.actions[0].fields, []);
  assert.equal(pkg.actions[0].input_tables.length, 1);
  assert.equal(pkg.actions[0].input_tables[0].fieldname, "lines");
});
