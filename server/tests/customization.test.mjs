import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryCustomizationStore,
  mergeCustomizations,
  parseCustomField,
  parseDocTypeMeta,
  parsePropertySetter,
} from "../dist/packages/frappe-model/src/index.js";

const BASE = parseDocTypeMeta({
  name: "Sales Order",
  module: "Selling",
  is_submittable: true,
  title_field: "name",
  fields: [
    { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer", required: true },
    { fieldname: "transaction_date", label: "Date", fieldtype: "Date" },
    { fieldname: "items", label: "Items", fieldtype: "Table", options: "Sales Order Item" },
  ],
  permissions: [{ role: "Sales User", read: true, write: true, create: true }],
  revision: 7,
});

function customField(overrides = {}) {
  return parseCustomField({
    dt: "Sales Order",
    fieldname: "po_no",
    field: { fieldtype: "Data", label: "PO No" },
    insert_after: "customer",
    ...overrides,
  });
}

function setter(overrides = {}) {
  return parsePropertySetter({
    doc_type: "Sales Order",
    doctype_or_field: "DocField",
    field_name: "customer",
    property: "label",
    value: "Khách hàng",
    ...overrides,
  });
}

function merge(customFields = [], propertySetters = [], revision = 3) {
  return mergeCustomizations({ base: BASE, customFields, propertySetters, customizationRevision: revision });
}

// ---- custom fields ----------------------------------------------------------

test("a custom field lands exactly after the field it names, not appended blindly", () => {
  const merged = merge([customField()]);
  assert.deepEqual(merged.fields.map((field) => field.fieldname), ["customer", "po_no", "transaction_date", "items"]);
  const added = merged.fields.find((field) => field.fieldname === "po_no");
  assert.equal(added.label, "PO No");
  assert.equal(added.fieldtype, "Data");
});

test("a custom field with no insert_after, or an unknown one, appends rather than vanishing", () => {
  assert.equal(merge([customField({ insert_after: null })]).fields.at(-1).fieldname, "po_no");
  // A standard field may be removed by an upgrade; the custom field must survive.
  assert.equal(merge([customField({ insert_after: "field_that_went_away" })]).fields.at(-1).fieldname, "po_no");
});

test("the standard definition is never mutated by a merge", () => {
  const before = BASE.fields.map((field) => field.fieldname).join(",");
  merge([customField()], [setter()]);
  assert.equal(BASE.fields.map((field) => field.fieldname).join(","), before);
  assert.equal(BASE.fields[0].label, "Customer", "a property setter must not leak into the base definition");
});

test("a custom field colliding with a standard field is refused, not silently overriding it", () => {
  // The standard field carries business meaning controllers depend on; Property
  // Setter is the supported way to adjust it.
  assert.throws(() => merge([customField({ fieldname: "customer", field: { fieldtype: "Data", label: "X" } })]), /collides with a standard field/);
});

test("custom fieldnames are constrained, and framework names are reserved", () => {
  for (const fieldname of ["name", "owner", "modified", "docstatus", "amended_from", "parent", "naming_series"]) {
    assert.throws(() => customField({ fieldname }), /reserved/, fieldname);
  }
  for (const fieldname of ["PoNo", "po-no", "1po", "po no", ""]) {
    assert.throws(() => customField({ fieldname }), /lowercase|required/, fieldname);
  }
});

test("a custom field is validated by the same rules as a standard one", () => {
  assert.throws(() => customField({ field: { fieldtype: "Link", label: "Bad" } }), /requires options/);
  assert.throws(() => customField({ field: { fieldtype: "Nonsense", label: "Bad" } }), /Unsupported field type/);
  // Including the server-enforceability rule for conditions.
  assert.throws(() => customField({ field: { fieldtype: "Data", label: "X", mandatory_depends_on: "eval:frappe.x()" } }), /cannot be enforced/);
});

// ---- property setters -------------------------------------------------------

test("a field property setter overrides only that property", () => {
  const merged = merge([], [setter()]);
  const customer = merged.fields.find((field) => field.fieldname === "customer");
  assert.equal(customer.label, "Khách hàng");
  assert.equal(customer.required, true, "unrelated properties are untouched");
  assert.equal(customer.options, "Customer");
});

test("flags and integers are coerced back from the text Frappe stores them as", () => {
  const merged = merge([], [
    setter({ field_name: "transaction_date", property: "reqd", value: "1", property_type: "Check" }),
    setter({ field_name: "customer", property: "permlevel", value: "2", property_type: "Int" }),
    setter({ field_name: "customer", property: "hidden", value: "0", property_type: "Check" }),
  ]);
  const byName = Object.fromEntries(merged.fields.map((field) => [field.fieldname, field]));
  // `reqd` is Frappe's name for the kernel's `required`.
  assert.equal(byName.transaction_date.required, true);
  assert.equal(byName.customer.permlevel, 2);
  assert.equal(byName.customer.hidden, false);
});

test("an empty value clears the property, which is how a customisation is undone", () => {
  const merged = merge([], [setter({ property: "description", value: "" })]);
  assert.equal(merged.fields.find((field) => field.fieldname === "customer").description, undefined);
});

test("a doctype-level setter changes the doctype, not a field", () => {
  const merged = merge([], [parsePropertySetter({
    doc_type: "Sales Order", doctype_or_field: "DocType", property: "title_field", value: "customer",
  })]);
  assert.equal(merged.title_field, "customer");
});

test("properties that would corrupt stored data cannot be customised", () => {
  // Renaming a field orphans every stored value under the old key; changing a
  // fieldtype reinterprets data already written under the old type.
  for (const property of ["fieldname", "fieldtype"]) {
    assert.throws(() => setter({ property }), /cannot be customised on a field/, property);
  }
  // Toggling submittability would leave existing documents in a docstatus the
  // lifecycle no longer recognises.
  for (const property of ["is_submittable", "name", "module"]) {
    assert.throws(() => parsePropertySetter({ doc_type: "Sales Order", doctype_or_field: "DocType", property, value: "x" }),
      /cannot be customised on a doctype/, property);
  }
});

test("a setter for a field that no longer exists is skipped, not fatal", () => {
  // An upgrade may drop a standard field; one stale overlay row must not make the
  // whole doctype unreadable — including unreadable to the request that would
  // remove the row.
  assert.doesNotThrow(() => merge([], [setter({ field_name: "field_that_went_away" })]));
});

test("a DocField setter must name a field and a DocType setter must not", () => {
  assert.throws(() => parsePropertySetter({ doc_type: "Sales Order", doctype_or_field: "DocField", property: "label", value: "x" }), /field_name is required/);
});

// ---- effective revision -----------------------------------------------------

test("the effective revision folds in the overlay, so a cache cannot serve a stale schema", () => {
  const withoutOverlay = merge([customField()], [], 3);
  const afterAnotherChange = merge([customField()], [], 4);
  assert.equal(withoutOverlay.effective_revision, "7.3");
  assert.notEqual(withoutOverlay.effective_revision, afterAnotherChange.effective_revision);
  // The standard definition's own revision is preserved for optimistic locking.
  assert.equal(withoutOverlay.revision, 7);
});

// ---- overlay store ----------------------------------------------------------

test("every overlay write advances the customisation revision", async () => {
  const store = new InMemoryCustomizationStore();
  assert.equal(await store.revision("t1", "Sales Order"), 0, "never customised is distinct from customised-then-reverted");

  await store.putCustomField("t1", customField());
  assert.equal(await store.revision("t1", "Sales Order"), 1);
  await store.putPropertySetter("t1", setter());
  assert.equal(await store.revision("t1", "Sales Order"), 2);
  await store.deleteCustomField("t1", "Sales Order", "po_no");
  assert.equal(await store.revision("t1", "Sales Order"), 3);
});

test("the overlay is scoped per tenant and per doctype", async () => {
  const store = new InMemoryCustomizationStore();
  await store.putCustomField("t1", customField());
  assert.equal((await store.listCustomFields("t1", "Sales Order")).length, 1);
  assert.equal((await store.listCustomFields("t2", "Sales Order")).length, 0);
  assert.equal((await store.listCustomFields("t1", "Purchase Order")).length, 0);
});

test("re-saving a setter for the same target replaces it instead of stacking", async () => {
  const store = new InMemoryCustomizationStore();
  await store.putPropertySetter("t1", setter({ value: "First" }));
  await store.putPropertySetter("t1", setter({ value: "Second" }));
  const stored = await store.listPropertySetters("t1", "Sales Order");
  assert.equal(stored.length, 1, "two setters for one property would make the winner depend on scan order");
  assert.equal(stored[0].value, "Second");
});

test("overlay rows are returned in a deterministic order", async () => {
  // Two custom fields inserted after the same standard field must not swap places
  // between reads, or the form would reorder itself at random.
  const store = new InMemoryCustomizationStore();
  await store.putCustomField("t1", customField({ fieldname: "zeta" }));
  await store.putCustomField("t1", customField({ fieldname: "alpha" }));
  const first = (await store.listCustomFields("t1", "Sales Order")).map((entry) => entry.fieldname);
  const second = (await store.listCustomFields("t1", "Sales Order")).map((entry) => entry.fieldname);
  assert.deepEqual(first, second);
  assert.deepEqual(first, ["Sales Order-alpha", "Sales Order-zeta"].map((name) => name.split("-").pop()));
});

test("a full overlay merges fields and properties together and stays valid", () => {
  const merged = merge(
    [customField(), customField({ fieldname: "delivery_note_no", field: { fieldtype: "Data", label: "DN" }, insert_after: "items" })],
    [
      setter(),
      setter({ field_name: "transaction_date", property: "reqd", value: "1" }),
      parsePropertySetter({ doc_type: "Sales Order", doctype_or_field: "DocType", property: "title_field", value: "customer" }),
    ],
  );
  assert.deepEqual(merged.fields.map((field) => field.fieldname), ["customer", "po_no", "transaction_date", "items", "delivery_note_no"]);
  assert.equal(merged.fields[0].label, "Khách hàng");
  assert.equal(merged.fields[2].required, true);
  assert.equal(merged.title_field, "customer");
  // idx is renumbered by the validator, so the form renders in the merged order.
  assert.deepEqual(merged.fields.map((field) => field.idx), [1, 2, 3, 4, 5]);
});
