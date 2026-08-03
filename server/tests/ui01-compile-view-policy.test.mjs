import test from "node:test";
import assert from "node:assert/strict";
import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { validateBriefSchema } from "../scripts/lib/validate-brief-schema.mjs";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";

const projection = (name) => ({
  kind: "projection",
  name,
  permissionDoctype: "Thing",
  permissionAction: "read",
});

function brief() {
  return {
    id: "ui01-matrix-fixture",
    name: "UI01 Matrix Fixture",
    doctypes: [{
      name: "Thing",
      kind: "master",
      list: ["title", "amount"],
      fields: [
        "title:Data! Title",
        "amount:Currency Amount",
        "active:Check Active",
      ],
      permissions: { Operator: "rwc" },
      bulk: {
        enabled: true,
        columns: ["title", "amount"],
        editableFields: ["amount"],
        commitStrategy: "document_update",
        pageSize: 50,
      },
      matrix: {
        enabled: true,
        navigator: {
          source: projection("thing.matrix.navigator"),
          keyField: "key",
          labelField: "label",
          parentField: "parent_key",
          secondaryLabelField: "secondary_label",
          searchFields: ["label", "secondary_label"],
        },
        rowAxis: {
          source: projection("thing.matrix.rows"),
          keyField: "row_key",
          labelField: "label",
          primaryField: "is_primary",
          auxiliaryFields: [{
            field: "factor",
            label: "Factor",
            editor: "Float",
            readOnlyWhenField: "is_primary",
            validation: "positive",
          }],
        },
        columnAxis: {
          source: projection("thing.matrix.columns"),
          keyField: "column_key",
          labelField: "label",
          subtitleField: "subtitle",
          disabledField: "disabled",
          selectedFirst: true,
        },
        cell: {
          source: projection("thing.matrix.cells"),
          identity: {
            rowField: "row_key",
            columnField: "column_key",
            recordField: "record_id",
          },
          valueField: "value",
          editor: "Currency",
          enabled: { field: "enabled", when: "truthy" },
          versionField: "version",
          validation: "non_negative",
          disabledColumnReadOnly: true,
        },
        write: {
          strategy: "action",
          action: "thing.matrix.commit",
          permissionDoctype: "Thing",
          permissionAction: "write",
        },
        rowMembers: {
          create: { action: "thing.matrix.row.create", permissionDoctype: "Thing", permissionAction: "create" },
          remove: { action: "thing.matrix.row.remove", permissionDoctype: "Thing", permissionAction: "write" },
          primaryRemovable: false,
        },
        columnMembers: {
          create: { action: "thing.matrix.column.create", permissionDoctype: "Thing", permissionAction: "create" },
          allowHide: true,
          allowHideAll: true,
          allowShow: true,
          allowShowAll: true,
        },
        query: {
          pageSize: 100,
          searchLimit: 50,
          minSearchChars: 1,
          searchMode: "token_contains",
          accentInsensitive: true,
        },
        presentation: {
          stickyRowAxis: true,
          stickyColumnAxis: true,
          focusMode: "toggle",
          mobileMode: "step",
          navigatorResizable: true,
          navigatorCollapsible: true,
          showDirtyIndicator: true,
          unsavedChangeGuard: true,
        },
        dirtyPolicy: "warn",
        conflictPolicy: "prompt_reload",
      },
    }],
  };
}

test("brief schema accepts first-class Bulk and Matrix policy blocks", async () => {
  assert.deepEqual(await validateBriefSchema(brief()), []);
});

test("canonical App Factory compiler preserves Bulk and Matrix through the authoritative manifest parser", () => {
  const input = brief();
  const compiled = compileBrief(input);
  const manifest = parseAppManifest(compiled);
  const doctype = manifest.doctypes.find((entry) => entry.name === "Thing");

  assert.deepEqual(doctype.viewPolicy.bulk, input.doctypes[0].bulk);
  assert.equal(doctype.viewPolicy.matrix.enabled, true);
  assert.equal(doctype.viewPolicy.matrix.navigator.secondaryLabelField, "secondary_label");
  assert.equal(doctype.viewPolicy.matrix.rowAxis.primaryField, "is_primary");
  assert.equal(doctype.viewPolicy.matrix.columnAxis.disabledField, "disabled");
  assert.equal(doctype.viewPolicy.matrix.cell.versionField, "version");
  assert.equal(doctype.viewPolicy.matrix.query.searchMode, "token_contains");
  assert.equal(doctype.viewPolicy.matrix.presentation.mobileMode, "step");
});

test("brief UI policy authoring rejects non-object blocks before compilation", async () => {
  const input = brief();
  input.doctypes[0].matrix = "matrix-ish";
  assert.match((await validateBriefSchema(input)).join("\n"), /matrix must be an object/);
});

test("authoring path cannot bypass canonical server Matrix bounds", () => {
  const input = brief();
  input.doctypes[0].matrix.query.pageSize = 5000;
  assert.throws(() => parseAppManifest(compileBrief(input)), /pageSize.*20 to 500/);
});
