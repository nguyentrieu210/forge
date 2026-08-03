import assert from "node:assert/strict";
import test from "node:test";

import { parseMatrixViewPolicy } from "../dist/packages/frappe-model/src/index.js";

const projection = (name) => ({
  kind: "projection",
  name,
  permissionDoctype: "Thing",
  permissionAction: "read",
});

const context = {
  name: "Thing",
  kind: "master",
  isChild: false,
  isTree: false,
  isSingle: false,
  isSubmittable: false,
  fields: [
    { fieldname: "title", label: "Title", fieldtype: "Data" },
    { fieldname: "amount", label: "Amount", fieldtype: "Currency" },
  ],
};

function matrix() {
  return {
    enabled: true,
    rowAxis: { source: projection("thing.matrix.rows"), keyField: "row_id", labelField: "label" },
    columnAxis: { source: projection("thing.matrix.columns"), keyField: "column_id", labelField: "label" },
    cell: {
      source: projection("thing.matrix.cells"),
      identity: { rowField: "row_id", columnField: "column_id" },
      valueField: "value",
      editor: "Currency",
    },
    rowMembers: {
      create: {
        action: "thing.matrix.row.create",
        permissionDoctype: "Thing",
        permissionAction: "create",
        label: "Add row",
        description: "Create one row member",
        fields: [
          { fieldname: "member", label: "Member", fieldtype: "Link", options: "Thing", required: true },
          { fieldname: "factor", label: "Factor", fieldtype: "Float", default: "1" },
        ],
        inputTables: [{
          fieldname: "notes",
          label: "Notes",
          columns: [{ fieldname: "note", label: "Note", fieldtype: "Data", required: true }],
          minRows: 1,
          maxRows: 5,
          allowPaste: true,
        }],
      },
    },
    columnMembers: {
      create: {
        action: "thing.matrix.column.create",
        permissionDoctype: "Thing",
        permissionAction: "create",
        label: "Add column",
        confirm: "Create this member?",
        fields: [{ fieldname: "title", label: "Title", fieldtype: "Data", required: true }],
      },
    },
    query: { pageSize: 100, searchLimit: 50, minSearchChars: 1 },
    presentation: { stickyRowAxis: true, stickyColumnAxis: true, focusMode: "toggle", mobileMode: "step" },
    dirtyPolicy: "warn",
    conflictPolicy: "reject",
  };
}

test("Matrix member actions preserve AppAction-compatible scalar/table input metadata", () => {
  const parsed = parseMatrixViewPolicy(matrix(), context);
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.rowMembers.create.label, "Add row");
  assert.deepEqual(parsed.rowMembers.create.fields.map((field) => [field.fieldname, field.fieldtype, field.options]), [
    ["member", "Link", "Thing"],
    ["factor", "Float", undefined],
  ]);
  assert.equal(parsed.rowMembers.create.inputTables[0].columns[0].fieldname, "note");
  assert.equal(parsed.rowMembers.create.inputTables[0].minRows, 1);
  assert.equal(parsed.rowMembers.create.inputTables[0].maxRows, 5);
  assert.equal(parsed.columnMembers.create.confirm, "Create this member?");
});

test("Matrix member action Link/Select inputs require options", () => {
  const input = matrix();
  delete input.rowMembers.create.fields[0].options;
  assert.throws(() => parseMatrixViewPolicy(input, context), /Link.*names no options/);

  const select = matrix();
  select.rowMembers.create.fields[0] = { fieldname: "mode", label: "Mode", fieldtype: "Select", required: true };
  assert.throws(() => parseMatrixViewPolicy(select, context), /Select.*names no options/);
});

test("Matrix member action rejects unsupported fieldtype and unsafe fieldname", () => {
  const fieldtype = matrix();
  fieldtype.rowMembers.create.fields[0].fieldtype = "HTML";
  assert.throws(() => parseMatrixViewPolicy(fieldtype, context), /not a renderable action input fieldtype/);

  const fieldname = matrix();
  fieldname.rowMembers.create.fields[0].fieldname = "Member Code";
  assert.throws(() => parseMatrixViewPolicy(fieldname, context), /lowercase letters, digits and underscore/);
});

test("Matrix member action rejects scalar/table key collisions and invalid table bounds", () => {
  const duplicate = matrix();
  duplicate.rowMembers.create.inputTables[0].fieldname = "member";
  assert.throws(() => parseMatrixViewPolicy(duplicate, context), /input key is declared more than once: member/);

  const bounds = matrix();
  bounds.rowMembers.create.inputTables[0].minRows = 10;
  bounds.rowMembers.create.inputTables[0].maxRows = 2;
  assert.throws(() => parseMatrixViewPolicy(bounds, context), /maxRows must be greater than or equal to minRows/);
});

test("Matrix member action defaults table bounds and paste capability deterministically", () => {
  const input = matrix();
  delete input.rowMembers.create.inputTables[0].minRows;
  delete input.rowMembers.create.inputTables[0].maxRows;
  delete input.rowMembers.create.inputTables[0].allowPaste;
  const parsed = parseMatrixViewPolicy(input, context);
  assert.equal(parsed.rowMembers.create.inputTables[0].minRows, 1);
  assert.equal(parsed.rowMembers.create.inputTables[0].maxRows, 100);
  assert.equal(parsed.rowMembers.create.inputTables[0].allowPaste, true);
});
