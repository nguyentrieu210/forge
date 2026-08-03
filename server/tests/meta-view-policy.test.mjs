import test from "node:test";
import assert from "node:assert/strict";
import { parseDocTypeMeta } from "../dist/packages/frappe-model/src/index.js";
import { toFrappeDocType } from "../dist/packages/frappe-api/src/index.js";

function field(fieldname, fieldtype, extra = {}) {
  return {
    fieldname,
    label: fieldname,
    fieldtype,
    valueSource: "user",
    editMode: "editable",
    surface: "expanded",
    ...extra,
  };
}

function currentSource(name = "Matrix Cell") {
  return {
    kind: "doctype",
    name,
    permissionDoctype: name,
    permissionAction: "read",
  };
}

function projectionSource(name) {
  return {
    kind: "projection",
    name,
    permissionDoctype: "Matrix Cell",
    permissionAction: "read",
  };
}

function simpleMatrix() {
  const source = currentSource();
  return {
    enabled: true,
    navigator: {
      source,
      keyField: "nav_key",
      labelField: "nav_label",
      parentField: "nav_parent",
      secondaryLabelField: "nav_secondary",
      searchFields: ["nav_label", "nav_secondary"],
    },
    rowAxis: {
      source,
      keyField: "row_key",
      labelField: "row_label",
      primaryField: "row_primary",
      searchFields: ["row_label"],
      filterFields: ["row_key"],
      auxiliaryFields: [{
        field: "conversion_factor",
        label: "Conversion",
        editor: "Float",
        readOnlyWhenField: "row_primary",
        validation: "positive",
      }],
    },
    columnAxis: {
      source,
      keyField: "column_key",
      labelField: "column_label",
      subtitleField: "column_subtitle",
      disabledField: "column_disabled",
      selectedFirst: true,
      searchFields: ["column_label"],
    },
    cell: {
      source,
      identity: { rowField: "row_key", columnField: "column_key", recordField: "name" },
      valueField: "rate",
      editor: "Currency",
      enabled: { field: "enabled", when: "truthy" },
      versionField: "modified",
      validation: "non_negative",
      disabledColumnReadOnly: true,
    },
    write: {
      strategy: "document_update",
      permissionDoctype: "Matrix Cell",
      permissionAction: "write",
    },
    rowMembers: { primaryRemovable: false },
    columnMembers: {
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
  };
}

function definition(matrix = simpleMatrix()) {
  return {
    name: "Matrix Cell",
    module: "Test",
    kind: "master",
    fields: [
      field("nav_key", "Data"),
      field("nav_label", "Data"),
      field("nav_secondary", "Data"),
      field("nav_parent", "Data"),
      field("row_key", "Data"),
      field("row_label", "Data"),
      field("row_primary", "Check"),
      field("column_key", "Data"),
      field("column_label", "Data"),
      field("column_subtitle", "Data"),
      field("column_disabled", "Check"),
      field("rate", "Currency"),
      field("enabled", "Check"),
      field("conversion_factor", "Float"),
    ],
    viewPolicy: {
      list: { enabled: true, columns: ["row_key", "column_key", "rate"] },
      form: { enabled: true, fields: ["row_key", "column_key", "rate"] },
      matrix,
    },
    permissions: [],
    revision: 1,
  };
}

test("viewPolicy preserves reason-required workflow semantics", () => {
  const meta = parseDocTypeMeta({
    name: "Approval Rule",
    module: "Security",
    kind: "transaction",
    fields: [
      {
        fieldname: "workflow_state",
        label: "State",
        fieldtype: "Data",
        read_only: true,
        valueSource: "workflow",
        editMode: "readonly",
        surface: "expanded",
        serverEnforced: true,
      },
      {
        fieldname: "reason",
        label: "Reason",
        fieldtype: "Data",
        valueSource: "user",
        editMode: "editable",
        surface: "expanded",
      },
    ],
    viewPolicy: {
      list: { enabled: true, columns: ["workflow_state"] },
      form: { enabled: true, fields: ["reason"] },
      kanban: {
        enabled: true,
        stageField: "workflow_state",
        reasonRequiredOn: ["backward", "cancel"],
      },
    },
    permissions: [],
    revision: 1,
  });

  assert.deepEqual(meta.viewPolicy?.kanban?.reasonRequiredOn, ["backward", "cancel"]);
  assert.equal(meta.viewPolicy?.kanban?.stageField, "workflow_state");
});

test("valid simple Matrix preserves parity semantics through getdoctype shape", () => {
  const meta = parseDocTypeMeta(definition());
  const matrix = meta.viewPolicy?.matrix;
  assert.equal(matrix?.enabled, true);
  assert.equal(matrix?.navigator.secondaryLabelField, "nav_secondary");
  assert.equal(matrix?.rowAxis.primaryField, "row_primary");
  assert.equal(matrix?.rowAxis.auxiliaryFields[0].validation, "positive");
  assert.equal(matrix?.columnAxis.disabledField, "column_disabled");
  assert.equal(matrix?.columnAxis.selectedFirst, true);
  assert.equal(matrix?.cell.versionField, "modified");
  assert.equal(matrix?.cell.validation, "non_negative");
  assert.equal(matrix?.cell.disabledColumnReadOnly, true);
  assert.equal(matrix?.query.searchMode, "token_contains");
  assert.equal(matrix?.query.accentInsensitive, true);
  assert.equal(matrix?.presentation.mobileMode, "step");
  assert.equal(matrix?.presentation.unsavedChangeGuard, true);

  const frappe = toFrappeDocType(meta, null);
  assert.deepEqual(frappe.viewPolicy, meta.viewPolicy, "manifest/meta transport must not drop Matrix semantics");
});

test("valid projection + named action Matrix preserves generic permission boundaries", () => {
  const matrix = {
    enabled: true,
    navigator: {
      source: projectionSource("catalog.matrix.navigator"),
      keyField: "node_id",
      labelField: "label",
      parentField: "parent_id",
      secondaryLabelField: "secondary_label",
      searchFields: ["label", "secondary_label"],
    },
    rowAxis: {
      source: projectionSource("catalog.matrix.rows"),
      keyField: "row_id",
      labelField: "label",
      primaryField: "is_primary",
      auxiliaryFields: [{ field: "factor", label: "Factor", editor: "Float", readOnlyWhenField: "is_primary", validation: "positive" }],
    },
    columnAxis: {
      source: projectionSource("catalog.matrix.columns"),
      keyField: "column_id",
      labelField: "label",
      subtitleField: "subtitle",
      disabledField: "disabled",
      selectedFirst: true,
    },
    cell: {
      source: projectionSource("catalog.matrix.cells"),
      identity: { rowField: "row_id", columnField: "column_id", recordField: "record_id" },
      valueField: "value",
      editor: "Currency",
      enabled: { field: "enabled", when: "truthy" },
      versionField: "version",
      validation: "non_negative",
      disabledColumnReadOnly: true,
    },
    write: {
      strategy: "action",
      action: "catalog.matrix.commit",
      permissionDoctype: "Matrix Cell",
      permissionAction: "write",
    },
    rowMembers: {
      create: { action: "catalog.matrix.row.create", permissionDoctype: "Matrix Cell", permissionAction: "create" },
      remove: { action: "catalog.matrix.row.remove", permissionDoctype: "Matrix Cell", permissionAction: "write" },
      primaryRemovable: false,
    },
    columnMembers: {
      create: { action: "catalog.matrix.column.create", permissionDoctype: "Matrix Cell", permissionAction: "create" },
      allowHide: true,
      allowHideAll: true,
      allowShow: true,
      allowShowAll: true,
    },
    query: {
      pageSize: 80,
      searchLimit: 40,
      minSearchChars: 2,
      searchMode: "token_contains",
      accentInsensitive: true,
    },
  };

  const parsed = parseDocTypeMeta(definition(matrix));
  assert.equal(parsed.viewPolicy?.matrix?.enabled, true);
  assert.equal(parsed.viewPolicy.matrix.write.strategy, "action");
  assert.equal(parsed.viewPolicy.matrix.write.action, "catalog.matrix.commit");
  assert.equal(parsed.viewPolicy.matrix.presentation.mobileMode, "scroll", "mobile fallback is deterministic");
  assert.equal(parsed.viewPolicy.matrix.presentation.showDirtyIndicator, true);
  assert.equal(parsed.viewPolicy.matrix.presentation.unsavedChangeGuard, true);
  assert.equal(parsed.viewPolicy.matrix.dirtyPolicy, "warn");
  assert.equal(parsed.viewPolicy.matrix.conflictPolicy, "reject");
});

test("Matrix refuses a missing axis key", () => {
  const raw = definition();
  delete raw.viewPolicy.matrix.rowAxis.keyField;
  assert.throws(() => parseDocTypeMeta(raw), /rowAxis\.keyField/);
});

test("Matrix refuses duplicate row/column axis identity", () => {
  const raw = definition();
  raw.viewPolicy.matrix.columnAxis.keyField = "row_key";
  assert.throws(() => parseDocTypeMeta(raw), /same source\/key identity/);
});

test("Matrix editor refuses readonly or server-owned targets", () => {
  const raw = definition();
  const rate = raw.fields.find((entry) => entry.fieldname === "rate");
  rate.serverEnforced = true;
  assert.throws(() => parseDocTypeMeta(raw), /readonly or server-owned/);
});

test("Matrix named action refuses a missing permission boundary", () => {
  const raw = definition();
  raw.viewPolicy.matrix.write = {
    strategy: "action",
    action: "catalog.matrix.commit",
    permissionAction: "write",
  };
  assert.throws(() => parseDocTypeMeta(raw), /permissionDoctype/);
});

test("Matrix refuses generic document_update for transaction metadata", () => {
  const raw = definition();
  raw.kind = "transaction";
  raw.is_submittable = true;
  assert.throws(() => parseDocTypeMeta(raw), /cannot use document_update/);
});

test("Matrix refuses invalid mobile or focus presentation hints", () => {
  const raw = definition();
  raw.viewPolicy.matrix.presentation.mobileMode = "cards";
  assert.throws(() => parseDocTypeMeta(raw), /mobileMode/);
});

test("Matrix refuses invalid source references", () => {
  const raw = definition();
  raw.viewPolicy.matrix.rowAxis.source.kind = "sql";
  assert.throws(() => parseDocTypeMeta(raw), /rowAxis\.source\.kind/);
});

test("Matrix query declarations are bounded", () => {
  const raw = definition();
  raw.viewPolicy.matrix.query.pageSize = 5000;
  assert.throws(() => parseDocTypeMeta(raw), /pageSize.*20 to 500/);
});

test("Matrix rejects conditional edit semantics without their required markers", () => {
  const missingDisabledMarker = definition();
  delete missingDisabledMarker.viewPolicy.matrix.columnAxis.disabledField;
  assert.throws(() => parseDocTypeMeta(missingDisabledMarker), /disabledColumnReadOnly requires columnAxis\.disabledField/);

  const missingPrimaryMarker = definition();
  delete missingPrimaryMarker.viewPolicy.matrix.rowAxis.primaryField;
  assert.throws(() => parseDocTypeMeta(missingPrimaryMarker), /primaryRemovable=false requires rowAxis\.primaryField/);
});

test("Matrix refuses nonnumeric validation semantics on nonnumeric editors", () => {
  const raw = definition();
  raw.viewPolicy.matrix.cell.editor = "Data";
  assert.throws(() => parseDocTypeMeta(raw), /editor Data does not match Currency|validation requires a numeric editor/);
});

test("canonical Bulk is preserved and legacy mobile Bulk remains accepted", () => {
  const raw = definition({ enabled: false });
  raw.viewPolicy.bulk = {
    enabled: true,
    columns: ["row_key", "rate"],
    editableFields: ["rate"],
    commitStrategy: "document_update",
    allowPaste: true,
    allowFillDown: true,
    pageSize: 75,
  };
  raw.viewPolicy.mobile = {
    bulk: {
      enabled: true,
      columns: ["row_key", "rate"],
      editableFields: ["rate"],
      commitStrategy: "document_update",
    },
  };

  const meta = parseDocTypeMeta(raw);
  assert.deepEqual(meta.viewPolicy?.bulk, raw.viewPolicy.bulk);
  assert.deepEqual(meta.viewPolicy?.mobile?.bulk, raw.viewPolicy.mobile.bulk);
});
