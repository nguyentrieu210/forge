import test from "node:test";
import assert from "node:assert/strict";
import {
  assertFieldConditionSupported,
  evaluateFieldCondition,
  InMemoryMetadataStore,
  parseDocTypeMeta,
  parseFieldCondition,
  resolveAutoname,
} from "../dist/packages/frappe-model/src/index.js";

const NOW = "2026-07-26T10:00:00.000Z";

function plan(pattern, document = {}) {
  return resolveAutoname({ doctype: "Sales Order", pattern, document, now: NOW });
}

// ---- autoname patterns ------------------------------------------------------

test("hash names are unique per call", () => {
  const a = plan("hash");
  const b = plan("hash");
  assert.equal(a.kind, "literal");
  assert.match(a.name, /^SALES-ORDER-/);
  assert.notEqual(a.name, b.name);
});

test("a series pattern strips the separator dots, as Frappe does", () => {
  // The dots delimit literal and placeholder segments; keeping them would put
  // them in the document name, which no Frappe user expects.
  assert.deepEqual(plan("SO-.YYYY.-####"), { kind: "series", seriesKey: "Sales Order:SO-2026-:4", prefix: "SO-2026-", digits: 4 });
  assert.deepEqual(plan("SO-####"), { kind: "series", seriesKey: "Sales Order:SO-:4", prefix: "SO-", digits: 4 });
});

test("date placeholders give each period its own sequence", () => {
  // Which is the point of putting a year in a series: 2026 must not continue 2025.
  const y2026 = plan("SO-.YYYY.-####", {});
  const y2027 = resolveAutoname({ doctype: "Sales Order", pattern: "SO-.YYYY.-####", document: {}, now: "2027-01-01T00:00:00.000Z" });
  assert.notEqual(y2026.seriesKey, y2027.seriesKey);
  assert.equal(y2027.prefix, "SO-2027-");
  assert.equal(plan("SO-.YY..MM..DD.-##").prefix, "SO-260726-");
});

test("field: names the document after one of its own values", () => {
  assert.deepEqual(plan("field:item_code", { item_code: "  WIDGET-1  " }), { kind: "literal", name: "WIDGET-1" });
  assert.throws(() => plan("field:item_code", {}), /required because/);
  assert.throws(() => plan("field:", {}), /requires a field name/);
});

test("naming_series: reads the series from the document, so one doctype can run several", () => {
  const resolved = plan("naming_series:", { naming_series: "SINV-.YYYY.-#####" });
  assert.equal(resolved.prefix, "SINV-2026-");
  assert.equal(resolved.digits, 5);
  assert.throws(() => plan("naming_series:", {}), /requires a naming series/);
});

test("format: interpolates fields and keeps a separate counter per resolved prefix", () => {
  const acme = plan("format:INV-{customer}-{####}", { customer: "ACME" });
  const other = plan("format:INV-{customer}-{####}", { customer: "OTHER" });
  assert.equal(acme.prefix, "INV-ACME-");
  assert.notEqual(acme.seriesKey, other.seriesKey, "each customer gets its own sequence");
  assert.deepEqual(plan("format:FIXED-{customer}", { customer: "ACME" }), { kind: "literal", name: "FIXED-ACME" });
  assert.throws(() => plan("format:INV-{customer}-{####}", {}), /required because it appears/);
});

test("format: refuses shapes the allocator cannot honour", () => {
  assert.throws(() => plan("format:{####}-{##}", {}), /at most one counter/);
  assert.throws(() => plan("format:{####}-SUFFIX", {}), /must be the last element/);
});

test("prompt and autoincrement are recognised", () => {
  assert.deepEqual(plan("prompt"), { kind: "prompt" });
  assert.deepEqual(plan(undefined), { kind: "prompt" });
  assert.deepEqual(plan(""), { kind: "prompt" });
  assert.deepEqual(plan("autoincrement"), { kind: "autoincrement", seriesKey: "Sales Order:autoincrement" });
});

test("an unrecognised pattern is refused rather than falling back to hash", () => {
  // A silent fallback would name documents by a rule nobody chose, and the
  // mistake would only surface once users went looking for a missing number.
  assert.throws(() => plan("SO-{{weird}}"), /Unsupported autoname pattern/);
  assert.throws(() => plan("SO-#############"), /at most 12 digits/);
});

test("the store allocates monotonically and honours every plan kind", async () => {
  const store = new InMemoryMetadataStore();
  assert.equal(await store.nextName("t1", "Sales Order", "SO-####", NOW), "SO-0001");
  assert.equal(await store.nextName("t1", "Sales Order", "SO-####", NOW), "SO-0002");
  // A different series does not share the counter.
  assert.equal(await store.nextName("t1", "Sales Order", "SQ-####", NOW), "SQ-0001");
  // Nor does another tenant.
  assert.equal(await store.nextName("t2", "Sales Order", "SO-####", NOW), "SO-0001");
  assert.equal(await store.nextName("t1", "Sales Order", "autoincrement", NOW), "1");
  assert.equal(await store.nextName("t1", "Sales Order", "field:item_code", NOW, { item_code: "X-1" }), "X-1");
  await assert.rejects(() => store.nextName("t1", "Sales Order", "prompt", NOW), /supply a name/);
});

// ---- field conditions -------------------------------------------------------

test("a bare field name means that field is truthy", () => {
  assert.equal(evaluateFieldCondition("is_return", { is_return: 1 }), true);
  assert.equal(evaluateFieldCondition("is_return", { is_return: 0 }), false);
  assert.equal(evaluateFieldCondition("is_return", {}), false);
});

test("checkbox comparisons work across the representations Frappe actually stores", () => {
  // 0/1, "0"/"1", true/false all appear in real documents; strict comparison
  // would make ordinary conditions silently never fire.
  for (const stored of [1, "1", true]) {
    assert.equal(evaluateFieldCondition("eval:doc.is_return == 1", { is_return: stored }), true, String(stored));
    assert.equal(evaluateFieldCondition("eval:doc.is_return == true", { is_return: stored }), true, String(stored));
  }
  for (const stored of [0, "0", false, undefined, null, ""]) {
    assert.equal(evaluateFieldCondition("eval:doc.is_return == 1", { is_return: stored }), false, String(stored));
  }
});

test("comparison, negation and membership all evaluate", () => {
  assert.equal(evaluateFieldCondition("eval:doc.qty > 10", { qty: 11 }), true);
  assert.equal(evaluateFieldCondition("eval:doc.qty > 10", { qty: 10 }), false);
  assert.equal(evaluateFieldCondition("eval:doc.qty <= 10", { qty: "10" }), true);
  assert.equal(evaluateFieldCondition("eval:doc.status != 'Draft'", { status: "Submitted" }), true);
  assert.equal(evaluateFieldCondition("eval:!doc.is_return", { is_return: 0 }), true);
  assert.equal(evaluateFieldCondition("eval:doc.status in ['Draft','Submitted']", { status: "Draft" }), true);
  assert.equal(evaluateFieldCondition("eval:doc.status in ['Draft','Submitted']", { status: "Cancelled" }), false);
});

test("&& and || combine clauses", () => {
  assert.equal(evaluateFieldCondition("eval:doc.a == 1 && doc.b == 2", { a: 1, b: 2 }), true);
  assert.equal(evaluateFieldCondition("eval:doc.a == 1 && doc.b == 2", { a: 1, b: 3 }), false);
  assert.equal(evaluateFieldCondition("eval:doc.a == 1 || doc.b == 2", { a: 9, b: 2 }), true);
  assert.equal(evaluateFieldCondition("eval:doc.a == 1 || doc.b == 2", { a: 9, b: 9 }), false);
});

test("a field absent from the payload falls back to the stored document", () => {
  // A partial save must be judged against the document as it will be, not as the
  // request happened to describe it.
  assert.equal(evaluateFieldCondition("eval:doc.is_return == 1", { other: 1 }, { is_return: 1 }), true);
  assert.equal(evaluateFieldCondition("eval:doc.is_return == 1", { is_return: 0 }, { is_return: 1 }), false,
    "the payload wins when it names the field");
});

test("anything outside the grammar is refused, and cannot execute", () => {
  const hostile = [
    "eval:doc.a == 1 ? 1 : 0",
    "eval:frappe.session.user == 'x'",
    "eval:(doc.a || doc.b) && doc.c",
    "eval:doc.a == 1 && doc.b == 2 || doc.c == 3",
    "eval:process.exit(1)",
    "eval:doc['a'] == 1",
    "eval:this.a == 1",
    "eval:doc.a.b == 1",
    "eval:",
  ];
  for (const expression of hostile) {
    assert.throws(() => parseFieldCondition(expression), /not supported|Unsupported|cannot|empty|mix/i, expression);
  }
});

test("a doctype carrying an unenforceable condition is rejected at save time", () => {
  // This is what makes runtime evaluation safe: the metadata never contains a
  // rule the server cannot apply, so a rule can never appear to exist and be
  // quietly ignored.
  const meta = (condition) => ({
    name: "Widget",
    module: "Custom",
    fields: [
      { fieldname: "is_return", label: "Is Return", fieldtype: "Check" },
      { fieldname: "reason", label: "Reason", fieldtype: "Data", mandatory_depends_on: condition },
    ],
    permissions: [{ role: "System Manager", read: true, write: true }],
    revision: 1,
  });
  assert.doesNotThrow(() => parseDocTypeMeta(meta("eval:doc.is_return == 1")));
  assert.throws(() => parseDocTypeMeta(meta("eval:frappe.db.get_value('X','y')")), /cannot be enforced by the server/);
  assert.throws(() => assertFieldConditionSupported("eval:doc.a ? 1 : 0", "reason", "mandatory_depends_on"), /cannot be enforced/);
});

test("a Dynamic Link must name a field that exists, or it could never be validated", () => {
  const base = {
    name: "Payment Entry", module: "Custom",
    permissions: [{ role: "System Manager", read: true }],
    revision: 1,
  };
  assert.doesNotThrow(() => parseDocTypeMeta({
    ...base,
    fields: [
      { fieldname: "party_type", label: "Party Type", fieldtype: "Link", options: "DocType" },
      { fieldname: "party", label: "Party", fieldtype: "Dynamic Link", options: "party_type" },
    ],
  }));
  assert.throws(() => parseDocTypeMeta({
    ...base,
    fields: [{ fieldname: "party", label: "Party", fieldtype: "Dynamic Link", options: "missing_field" }],
  }), /points at unknown field/);
  assert.throws(() => parseDocTypeMeta({
    ...base,
    fields: [{ fieldname: "party", label: "Party", fieldtype: "Dynamic Link" }],
  }), /requires options/);
});
