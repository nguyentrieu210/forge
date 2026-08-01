import test from "node:test";
import assert from "node:assert/strict";
import { toFrappeMetaBundle } from "../dist/packages/frappe-api/src/index.js";
import { parseDocTypeMeta } from "../dist/packages/frappe-model/src/index.js";

/**
 * The façade's metadata fed into the CLIENT'S OWN normaliser and column derivation.
 *
 * This closes the gap that every other server-side test leaves open: those assert what
 * the façade emits, which proves nothing about whether the client can use it. A response
 * can satisfy every server assertion and still render a blank table — a flag arriving as
 * `true` where the client's types say `0 | 1` is read as absent, and the column is
 * dropped without any error anywhere.
 *
 * Imports the real built `@metaforge/core` and `@metaforge/views` from `client/`, not a
 * copy of their rules. A reimplementation would drift, and the drift would surface as a
 * blank screen rather than a failing test.
 */
const CLIENT = "../../client/packages";
const { normalizeMeta } = await import(`${CLIENT}/core/dist/meta/normalize.js`);
const { deriveColumns } = await import(`${CLIENT}/views/dist/list/columns.js`);

const ROLES = ["System Manager"];

const META = parseDocTypeMeta({
  name: "Field Visit",
  module: "Custom",
  is_submittable: true,
  autoname: "FV-.YYYY.-####",
  title_field: "subject",
  search_fields: ["subject"],
  track_seen: true,
  fields: [
    { fieldname: "subject", label: "Subject", fieldtype: "Data", required: true, in_list_view: true },
    { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer", in_list_view: true },
    { fieldname: "is_billable", label: "Billable", fieldtype: "Check" },
    { fieldname: "secret_margin", label: "Margin", fieldtype: "Currency", permlevel: 2 },
  ],
  permissions: [{
    role: "System Manager",
    read: true, write: true, create: true, submit: true, cancel: true, amend: true, report: true, export: true, print: true,
  }],
  revision: 3,
});

/** Exactly what `frappe.desk.form.load.getdoctype` returns, then what the client makes of it. */
function throughClient(meta, options = {}) {
  const bundle = toFrappeMetaBundle({ meta, ...options });
  const raw = bundle.docs.find((doc) => doc.name === meta.name) ?? bundle.docs[0];
  return normalizeMeta(raw, bundle.masked_fields);
}

test("the client's normaliser accepts the facade's metadata without throwing", () => {
  // normalizeMeta is strict by design (P0-08: no blind casting). If it throws, the Desk
  // renders an error and never issues a list query at all.
  const normalized = throughClient(META);
  assert.equal(normalized.name, "Field Visit");
  assert.equal(normalized.fields.length, 4);
});

test("the title field survives normalisation, so the list is not headed by a bare ID", () => {
  const normalized = throughClient(META);
  // `deriveColumns` falls back to an "ID" column when `title_field` is missing or its
  // field is absent — the exact symptom of a list that looks empty and unconfigured.
  assert.equal(normalized.title_field, "subject");
  assert.ok(normalized.fields.some((field) => field.fieldname === "subject"));
});

test("DocPerm rows reach the client, filtered to the actor's own roles", () => {
  // The native API deliberately withholds permission rows; the Frappe contract carries
  // them, and the client needs them to decide field editability (see the test below for
  // what they do and do not affect).
  const normalized = throughClient(META);
  assert.equal(normalized.permissions.length, 1);
  assert.equal(normalized.permissions[0].role, "System Manager");
  assert.equal(normalized.permissions[0].read, 1, "flags must be integers, not booleans");
});

test("sort_field and sort_order are always present, as Frappe always sends them", () => {
  // Clients build `order_by` straight from these. A missing sort_field yields
  // "undefined desc" at best and a thrown TypeError at worst.
  const withoutSort = throughClient(META);
  assert.equal(withoutSort.sort_field, "modified");
  assert.equal(withoutSort.sort_order, "DESC");

  const explicit = throughClient(parseDocTypeMeta({ ...META, sort_field: "subject", sort_order: "ASC" }));
  assert.equal(explicit.sort_field, "subject");
  assert.equal(explicit.sort_order, "ASC");
});

test("Frappe timestamp sort aliases normalize to canonical storage fields", () => {
  assert.equal(parseDocTypeMeta({ ...META, sort_field: "modified" }).sort_field, "modified_at");
  assert.equal(parseDocTypeMeta({ ...META, sort_field: "creation" }).sort_field, "created_at");
});

test("the client derives the columns the metadata declared, not a bare ID fallback", () => {
  const normalized = throughClient(META);
  const columns = deriveColumns(normalized, { roles: ROLES });
  const labels = columns.map((column) => column.label);

  // The title column comes first and carries the title field's label — "ID" here would
  // mean the client fell back, which is what a broken metadata contract looks like.
  assert.equal(columns[0].fieldname, "subject");
  assert.equal(labels[0], "Subject");
  assert.ok(labels.includes("Customer"), `expected a Customer column, got ${labels.join(", ")}`);
  assert.equal(columns.length, 2, `expected title + one in_list_view column, got ${labels.join(", ")}`);
});

test("a field the actor may not read is masked, and its column is dropped", () => {
  // permlevel 2 with no matching permission row: the client must not offer a column
  // whose values the server would redact anyway.
  const masked = throughClient(META, { maskedFields: ["secret_margin"] });
  assert.deepEqual(masked.masked_fields, ["secret_margin"]);
  const columns = deriveColumns(masked, { roles: ROLES });
  assert.ok(!columns.some((column) => column.fieldname === "secret_margin"));
});

test("DocPerm rows govern editability, not column presence", () => {
  // Worth pinning down because it was initially assumed backwards. An empty
  // `permissions` array does NOT collapse the list to an ID column: the client treats
  // permlevel 0 as readable once the document itself opened, so the columns still
  // appear. What the rows actually decide is whether a field is WRITABLE —
  // `perms.write.has(permlevel)` — so with none present every field goes read-only.
  //
  // The rows are still emitted (see the test above): the Frappe contract carries them,
  // and inline list editing and form editability depend on them. But an empty array is
  // not the explanation for an ID-only list, and recording that here stops the same
  // wrong hypothesis being chased twice.
  const normalized = throughClient(META);
  const withRows = deriveColumns(normalized, { roles: ROLES });
  const withoutRows = deriveColumns({ ...normalized, permissions: [] }, { roles: ROLES });
  assert.deepEqual(
    withoutRows.map((column) => column.fieldname),
    withRows.map((column) => column.fieldname),
    "column set must not depend on DocPerm rows",
  );
});

test("integer flags survive the round trip, since booleans would read as absent", () => {
  const normalized = throughClient(META);
  const byName = Object.fromEntries(normalized.fields.map((field) => [field.fieldname, field]));
  assert.equal(byName.subject.reqd, 1);
  assert.equal(byName.subject.in_list_view, 1);
  assert.equal(byName.is_billable.in_list_view, 0);
  assert.equal(normalized.is_submittable, 1);
  assert.equal(normalized.issingle, 0);
  assert.equal(normalized.track_seen, 1);
});

test("a child doctype in the bundle is found by name, not by position", () => {
  // getdoctype(with_parent=1) answers a child query with the parent's whole bundle,
  // parent first; taking docs[0] would hand the client the wrong meta entirely.
  const child = parseDocTypeMeta({
    name: "Field Visit Line",
    module: "Custom",
    is_child: true,
    fields: [{ fieldname: "note", label: "Note", fieldtype: "Data" }],
    permissions: [{ role: "System Manager", read: true }],
    revision: 1,
  });
  const bundle = toFrappeMetaBundle({ meta: child, children: [META] });
  const raw = bundle.docs.find((doc) => doc.name === "Field Visit Line");
  const normalized = normalizeMeta(raw, bundle.masked_fields);
  assert.equal(normalized.istable, 1);
  assert.equal(normalized.fields[0].fieldname, "note");
});
