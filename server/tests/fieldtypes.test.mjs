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

test("title_field is always searchable for Link pickers", () => {
  const parsed = parseDocTypeMeta({
    name: "Class Group",
    module: "Center",
    title_field: "class_name",
    fields: [
      { fieldname: "class_name", label: "Class Name", fieldtype: "Data", required: true },
      { fieldname: "code", label: "Code", fieldtype: "Data" },
    ],
    permissions: [{ role: "System Manager", read: true, write: true }],
    revision: 1,
  });
  const definition = metadataToListDefinition(parsed);
  assert.deepEqual(definition.searchFields, ["name", "class_name"]);
});

// ---- DocField properties the server enforces --------------------------------

import { renderPrintFormat } from "../dist/packages/frappe-model/src/index.js";

test("presentation properties survive parsing instead of being dropped", () => {
  // The parser builds an allow-listed object, so anything unnamed was silently lost.
  // A DocType imported from a Frappe site kept its data and lost its entire
  // presentation layer — invisible, because it still saved and still listed.
  const parsed = meta([{
    fieldname: "amount", fieldtype: "Currency",
    bold: true, collapsible: true, columns: 4, width: 200, print_width: 120,
    placeholder: "Nhập số tiền", alignment: "right", in_global_search: true,
    documentation_url: "https://example.com/help", oldfieldname: "amt",
  }]);
  const field = parsed.fields[0];
  assert.equal(field.bold, true);
  assert.equal(field.collapsible, true);
  assert.equal(field.columns, 4);
  assert.equal(field.width, 200);
  assert.equal(field.print_width, 120);
  assert.equal(field.placeholder, "Nhập số tiền");
  assert.equal(field.alignment, "right");
  assert.equal(field.in_global_search, true);
  assert.equal(field.documentation_url, "https://example.com/help");
  // Frappe's own migration leftovers travel too, so a round trip does not lose them.
  assert.equal(field.oldfieldname, "amt");
});

test("a nonsense presentation value is still refused", () => {
  // Carrying a property through is not the same as accepting anything: an out-of-range
  // column count would reach the client and break its layout maths.
  assert.throws(() => meta([{ fieldname: "x", fieldtype: "Data", columns: 99 }]));
  assert.throws(() => meta([{ fieldname: "x", fieldtype: "Data", placeholder: 5 }]));
});

test("print_hide keeps a field off the printed page", () => {
  const format = { name: "F", doc_type: "Sample", format_type: "Jinja", revision: 1,
    html: "<p>{{ subject }}</p><p>{{ margin }}</p><p>{{ note }}</p>" };
  const document = {
    doctype: "Sample", name: "S-1", owner: "u", docstatus: 0, status: "Draft", version: 1,
    data: { subject: "Hiện ra", margin: "BÍ MẬT", note: "" }, children: [],
  };
  const printed = renderPrintFormat(format, document, "vi", meta([
    { fieldname: "subject", fieldtype: "Data" },
    { fieldname: "margin", fieldtype: "Currency", print_hide: true },
    { fieldname: "note", fieldtype: "Data", print_hide_if_no_value: true },
  ]));
  assert.match(printed, /Hiện ra/);
  // The whole point: an internal figure must not reach the paper a customer is handed.
  assert.doesNotMatch(printed, /BÍ MẬT/);
});

test("print_hide_if_no_value hides only when there is nothing to show", () => {
  const format = { name: "F", doc_type: "Sample", format_type: "Jinja", revision: 1, html: "<p>{{ note }}</p>" };
  const withValue = renderPrintFormat(format, {
    doctype: "Sample", name: "S-1", owner: "u", docstatus: 0, status: "Draft", version: 1,
    data: { note: "có nội dung" }, children: [],
  }, "vi", meta([{ fieldname: "note", fieldtype: "Data", print_hide_if_no_value: true }]));
  assert.match(withValue, /có nội dung/);
});
