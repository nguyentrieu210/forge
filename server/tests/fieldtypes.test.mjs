import test from "node:test";
import assert from "node:assert/strict";
import { metadataToListDefinition, parseDocTypeMeta } from "../dist/packages/frappe-model/src/index.js";

/**
 * The fieldtypes Frappe has that this platform now also has.
 *
 * Adding a name to a union is not adding a fieldtype. Each of these needs SERVER
 * behaviour — a value rule, a query type, a masking decision — and without it the
 * generic controller's `default:` branch let the value through unvalidated on save and
 * then refused the document on SUBMIT with "Unsupported executable field type". A
 * doctype using `Text Editor` could be filled in and never submitted.
 */
function meta(fields) {
  return parseDocTypeMeta({
    name: "Sample",
    module: "Custom",
    fields: fields.map((field) => ({ label: field.fieldname, ...field })),
    permissions: [{ role: "System Manager", read: true, write: true }],
    revision: 1,
  });
}

test("every fieldtype Frappe declares is accepted in a DocType", () => {
  // The full v16.19.0 list, minus the ones that were already supported. A rejection
  // here means an app that models its data the way Frappe does cannot be installed.
  const added = [
    "Text Editor", "Markdown Editor", "HTML Editor", "Password", "Phone", "Color",
    "Icon", "Signature", "Barcode", "Autocomplete", "Image", "Read Only",
    "Duration", "Rating", "Geolocation", "Tab Break", "Fold", "Button",
  ];
  for (const fieldtype of added) {
    assert.doesNotThrow(() => meta([{ fieldname: "value", fieldtype }]), fieldtype);
  }
});

// ---- what is queryable -------------------------------------------------------

test("the new value-bearing types are filterable and sortable", () => {
  const definition = metadataToListDefinition(meta([
    { fieldname: "body", fieldtype: "Text Editor" },
    { fieldname: "mobile", fieldtype: "Phone" },
    { fieldname: "minutes", fieldtype: "Duration" },
    { fieldname: "score", fieldtype: "Rating" },
  ]));
  assert.ok(Object.hasOwn(definition.fields, "body"));
  assert.ok(Object.hasOwn(definition.fields, "mobile"));
  // Seconds are an integer, so ranges and ordering behave arithmetically.
  assert.equal(definition.fields.minutes.type, "int");
  assert.ok(Object.hasOwn(definition.fields, "score"));
});

test("a Password is not queryable at all", () => {
  // `like` on a secret recovers it a character at a time, which is the same disclosure
  // as reading it outright.
  const definition = metadataToListDefinition(meta([
    { fieldname: "api_key", fieldtype: "Password" },
    { fieldname: "title", fieldtype: "Data" },
  ]));
  assert.equal(Object.hasOwn(definition.fields, "api_key"), false);
  assert.ok(Object.hasOwn(definition.fields, "title"), "an ordinary field is unaffected");
});

test("layout-only types carry no queryable value", () => {
  const definition = metadataToListDefinition(meta([
    { fieldname: "tab_one", fieldtype: "Tab Break" },
    { fieldname: "more", fieldtype: "Fold" },
    { fieldname: "do_it", fieldtype: "Button" },
  ]));
  for (const fieldname of ["tab_one", "more", "do_it"]) {
    assert.equal(Object.hasOwn(definition.fields, fieldname), false, fieldname);
  }
});
