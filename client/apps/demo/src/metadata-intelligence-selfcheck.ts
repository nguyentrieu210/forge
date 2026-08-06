import { strict as assert } from "node:assert";
import {
  bindActionField,
  bindActionTableColumns,
  buildActionTableRow,
  buildMetadataDefaults,
  collectMetadataReactiveFields,
  deriveContextLinkCapabilityFilters,
  mergeAutomaticFieldPatch,
  resolveField,
  resolveFieldContract,
  shouldApplyAutomaticValue,
  type AppActionInputTable,
  type DocField,
  type DocTypeMeta,
} from "@metaforge/core";
import { defaultChildGridHiddenColumns, resolveChildGridColumns } from "@metaforge/views";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("metadata intelligence selfcheck — neutral fixture:");

const meta: DocTypeMeta = {
  name: "Reference Transaction",
  is_submittable: 1,
  permissions: [{ role: "Operator", permlevel: 0, read: 1, write: 1 }],
  fields: [
    { fieldname: "reference", label: "Reference", fieldtype: "Link", options: "Reference Master", reqd: 1, surface: "quick" },
    { fieldname: "reference_label", label: "Reference label", fieldtype: "Data", fetch_from: "reference.title", valueSource: "link", editMode: "editable", dirtyGuard: "preserve_user_value" },
    { fieldname: "posting_date", label: "Posting date", fieldtype: "Date", default: "Today", valueSource: "default" },
    { fieldname: "server_total", label: "Server total", fieldtype: "Currency", read_only: 1, valueSource: "formula", editMode: "readonly", serverEnforced: true },
    { fieldname: "external_code", label: "External code", fieldtype: "Data", set_only_once: 1, editMode: "set_once" },
    { fieldname: "approved_note", label: "Approved note", fieldtype: "Data", editMode: "immutable_after_submit" },
    { fieldname: "advanced", label: "Advanced", fieldtype: "Check" },
    { fieldname: "advanced_note", label: "Advanced note", fieldtype: "Data", depends_on: "eval:doc.advanced == 1", mandatory_depends_on: "eval:doc.advanced == 1", surface: "expanded" },
    { fieldname: "target_doctype", label: "Target type", fieldtype: "Link", options: "DocType" },
    { fieldname: "target", label: "Target", fieldtype: "Dynamic Link", options: "target_doctype" },
    { fieldname: "internal_token", label: "Internal", fieldtype: "Data", hidden: 1, editMode: "hidden", surface: "internal", valueSource: "system", serverEnforced: true },
  ],
};

check("explicit field contract wins over inferred legacy flags", () => {
  const linked = meta.fields.find((field) => field.fieldname === "reference_label")!;
  assert.deepEqual(resolveFieldContract(linked), {
    valueSource: "link",
    editMode: "editable",
    surface: "expanded",
    serverEnforced: false,
    dirtyGuard: "preserve_user_value",
  });
  const hidden = meta.fields.find((field) => field.fieldname === "internal_token")!;
  assert.equal(resolveFieldContract(hidden).editMode, "hidden");
  assert.equal(resolveFieldContract(hidden).serverEnforced, true);
});

check("legacy metadata derives the same safe ownership defaults", () => {
  const legacy: DocField = { fieldname: "customer_name", fieldtype: "Data", fetch_from: "customer.customer_name" };
  const contract = resolveFieldContract(legacy);
  assert.equal(contract.valueSource, "link");
  assert.equal(contract.editMode, "editable");
  assert.equal(contract.dirtyGuard, "preserve_user_value");
});

check("Today default is resolved by one metadata primitive", () => {
  const defaults = buildMetadataDefaults(meta, new Date("2026-08-06T12:34:00.000Z"));
  assert.equal(defaults.posting_date, "2026-08-06");
  assert.equal("internal_token" in defaults, false);
});

check("reactive dependency set covers depends/link/fetch/dynamic link", () => {
  const fields = new Set(collectMetadataReactiveFields(meta));
  assert.equal(fields.has("reference"), true);
  assert.equal(fields.has("advanced"), true);
  assert.equal(fields.has("target_doctype"), true);
});

check("dirty guard protects an operator override from automatic refresh", () => {
  const field = meta.fields.find((entry) => entry.fieldname === "reference_label")!;
  assert.equal(shouldApplyAutomaticValue(field, "manual", "user"), false);
  assert.equal(shouldApplyAutomaticValue(field, "", "user"), true);
  const merged = mergeAutomaticFieldPatch(meta, { reference_label: "manual" }, { reference_label: "automatic", unknown: 1 }, { reference_label: "user" });
  assert.equal(merged.reference_label, "manual");
  assert.equal("unknown" in merged, false);
});

check("set_once and immutable_after_submit are effective in resolver", () => {
  const setOnce = meta.fields.find((field) => field.fieldname === "external_code")!;
  assert.equal(resolveField(setOnce, meta, { doc: { external_code: "EXT-1" }, roles: ["Operator"] }).readOnly, true);
  assert.equal(resolveField(setOnce, meta, { doc: { external_code: "" }, roles: ["Operator"] }).readOnly, false);
  const immutable = meta.fields.find((field) => field.fieldname === "approved_note")!;
  assert.equal(resolveField(immutable, meta, { doc: { docstatus: 0 }, roles: ["Operator"] }).readOnly, false);
  assert.equal(resolveField(immutable, meta, { doc: { docstatus: 1 }, roles: ["Operator"] }).readOnly, true);
});

check("price-list capability filters derive from context + target schema, not target name", () => {
  const target = { fields: [{ fieldname: "selling" }, { fieldname: "buying" }] };
  assert.deepEqual(deriveContextLinkCapabilityFilters({ supported: ["selling_price_list"] }, target), { selling: 1 });
  assert.deepEqual(deriveContextLinkCapabilityFilters({ supported: ["buying_price_list"] }, target), { buying: 1 });
  assert.deepEqual(deriveContextLinkCapabilityFilters({ supported: ["selling_price_list", "buying_price_list"] }, target), {});
  assert.deepEqual(deriveContextLinkCapabilityFilters({ supported: ["selling_price_list"] }, { fields: [{ fieldname: "other" }] }), {});
});

check("bound AppAction fields inherit canonical semantics instead of copied schema", () => {
  const declared = { fieldname: "reference", label: "Pick reference", fieldtype: "Data", required: false, default: "WRONG" };
  const bound = bindActionField(declared, meta);
  assert.equal(bound.fieldtype, "Link");
  assert.equal(bound.options, "Reference Master");
  assert.equal(bound.reqd, 1);
  assert.equal(bound.default, undefined);
  assert.equal(bound.label, "Pick reference");
  const synthetic = bindActionField({ fieldname: "reason", label: "Reason", fieldtype: "Data", required: true }, meta);
  assert.equal(synthetic.fieldtype, "Data");
  assert.equal(synthetic.reqd, 1);
});

check("action input tables keep declared order but canonical field contracts", () => {
  const table: AppActionInputTable = {
    fieldname: "rows",
    label: "Rows",
    min_rows: 1,
    max_rows: 20,
    allow_paste: true,
    presentation: { mode: "child-grid-inline", row_doctype: meta.name },
    columns: [
      { fieldname: "reference_label", label: "Action label", fieldtype: "Data", required: true },
      { fieldname: "reference", label: "Reference", fieldtype: "Data" },
    ],
  };
  const columns = bindActionTableColumns(table, meta);
  assert.deepEqual(columns.map((field) => field.fieldname), ["reference_label", "reference"]);
  assert.equal(columns[0]!.fetch_from, "reference.title");
  assert.equal(columns[0]!.dirtyGuard, "preserve_user_value");
  assert.equal(columns[1]!.fieldtype, "Link");
  assert.equal(columns[1]!.reqd, 1);
});

check("new action rows use canonical defaults before legacy action defaults", () => {
  const rowMeta: DocTypeMeta = {
    ...meta,
    fields: [
      ...meta.fields,
      { fieldname: "mode", label: "Mode", fieldtype: "Data", default: "canonical" },
    ],
  };
  const table: AppActionInputTable = {
    fieldname: "rows",
    label: "Rows",
    min_rows: 1,
    max_rows: 20,
    allow_paste: true,
    columns: [
      { fieldname: "posting_date", label: "Date", fieldtype: "Date" },
      { fieldname: "mode", label: "Mode", fieldtype: "Data", default: "legacy" },
    ],
  };
  const row = buildActionTableRow(rowMeta, table, "new-1");
  assert.equal(row.mode, "canonical");
  assert.equal(typeof row.posting_date, "string");
  assert.equal(String(row.posting_date).length, 10);
});

check("ChildGrid columns are declaration-driven and independent of DocType business name", () => {
  const child: DocTypeMeta = {
    name: "Reference Child",
    fields: [
      { fieldname: "reference", label: "Reference", fieldtype: "Link", options: "Reference Master", in_list_view: 1 },
      { fieldname: "qty", label: "Quantity", fieldtype: "Float", in_list_view: 1 },
      { fieldname: "amount", label: "Amount", fieldtype: "Currency", read_only: 1, in_list_view: 1 },
      { fieldname: "note", label: "Note", fieldtype: "Small Text" },
    ],
    viewPolicy: {
      list: { enabled: true, columns: ["reference", "qty", "amount"] },
      form: { enabled: true },
      quickEntry: { enabled: true, fields: ["reference", "qty"] },
    },
    permissions: [],
  };
  const expected = ["reference", "qty", "amount"];
  const neutral = resolveChildGridColumns(child, []).map((field) => field.fieldname);
  const businessNamed = resolveChildGridColumns({ ...child, name: "Sales Order Item" }, []).map((field) => field.fieldname);
  assert.deepEqual(neutral, expected);
  assert.deepEqual(businessNamed, expected);
  assert.deepEqual(defaultChildGridHiddenColumns(child, resolveChildGridColumns(child, []), false), ["amount"]);
  assert.deepEqual(defaultChildGridHiddenColumns(child, resolveChildGridColumns(child, []), true), []);
});

check("ChildGrid falls back to in_list_view without adding undeclared business columns", () => {
  const child: DocTypeMeta = {
    name: "Purchase Order Item",
    fields: [
      { fieldname: "alpha", label: "Alpha", fieldtype: "Data", in_list_view: 1 },
      { fieldname: "beta", label: "Beta", fieldtype: "Float", in_list_view: 1 },
      { fieldname: "gamma", label: "Gamma", fieldtype: "Data" },
    ],
    permissions: [],
  };
  assert.deepEqual(resolveChildGridColumns(child, []).map((field) => field.fieldname), ["alpha", "beta"]);
});

console.log(`metadata intelligence selfcheck: ${passed} checks passed`);
