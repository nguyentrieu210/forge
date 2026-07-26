import test from "node:test";
import assert from "node:assert/strict";
import {
  assertModifiedMatches,
  buildCommand,
  fromFrappeDatetime,
  fromFrappeDoc,
  maskedFieldNames,
  readFrappeArgs,
  stripServerOwnedFields,
  toFrappeDatetime,
  toFrappeDoc,
  toFrappeMetaBundle,
  toFrappeModified,
  toKernelFilters,
  toKernelSearch,
  toKernelSort,
  faultResponse,
  methodResponse,
} from "../dist/packages/frappe-api/src/index.js";
import { errors } from "../dist/packages/core/src/index.js";
import { parseDocumentListRequest, DocumentListCompiler } from "../dist/packages/document-kernel/src/index.js";
import { parseDocTypeMeta } from "../dist/packages/frappe-model/src/index.js";

const ACTOR = { user_id: "user@example.com", roles: ["Sales User"] };

function document(overrides = {}) {
  return {
    tenant_id: "t1",
    doctype: "Sales Order",
    name: "SO-0001",
    owner: "owner@example.com",
    docstatus: 0,
    status: "Draft",
    version: 3,
    created_at: "2026-07-26T10:00:00.000Z",
    modified_at: "2026-07-26T10:30:00.250Z",
    data: { customer: "CUST-1", total: "120.00" },
    children: [
      { fieldname: "items", child_doctype: "Sales Order Item", row_id: "ROW-2", idx: 2, data: { item_code: "B" } },
      { fieldname: "items", child_doctype: "Sales Order Item", row_id: "ROW-1", idx: 1, data: { item_code: "A" } },
    ],
    ...overrides,
  };
}

// ---- datetime / concurrency token -------------------------------------------

test("frappe datetime round-trips through the kernel ISO form", () => {
  assert.equal(toFrappeDatetime("2026-07-26T10:30:00.250Z"), "2026-07-26 10:30:00.250000");
  assert.equal(fromFrappeDatetime("2026-07-26 10:30:00.250000"), "2026-07-26T10:30:00.250Z");
  assert.equal(fromFrappeDatetime("2026-07-26 10:30:00"), "2026-07-26T10:30:00.000Z");
});

test("the modified token distinguishes two versions committed in the same millisecond", () => {
  // This is the whole reason `modified` is not a plain timestamp passthrough: the
  // aggregate Durable Object can commit twice inside one millisecond, and a stale
  // client must not be able to match the newer value.
  const at = "2026-07-26T10:30:00.250Z";
  const v3 = toFrappeModified(at, 3);
  const v4 = toFrappeModified(at, 4);
  assert.notEqual(v3, v4);
  assert.equal(v3, "2026-07-26 10:30:00.250003");
  assert.equal(v4, "2026-07-26 10:30:00.250004");
  // The clock part still parses back to the true millisecond.
  assert.equal(fromFrappeDatetime(v4), at);
});

test("the modified token stays monotonic as the version advances", () => {
  const at = "2026-07-26T10:30:00.000Z";
  const tokens = [1, 2, 10, 99, 999].map((version) => toFrappeModified(at, version));
  assert.deepEqual([...tokens].sort(), tokens);
});

test("a stale or missing modified value is a conflict, never a force-write", () => {
  const doc = document();
  const current = toFrappeModified(doc.modified_at, doc.version);
  assert.doesNotThrow(() => assertModifiedMatches(doc, current));
  // Same instant, older version — the naive passthrough would accept this.
  assert.throws(() => assertModifiedMatches(doc, toFrappeModified(doc.modified_at, 2)), /VERSION_CONFLICT|changed/);
  assert.throws(() => assertModifiedMatches(doc, undefined), /VERSION_CONFLICT|changed/);
  assert.throws(() => assertModifiedMatches(doc, ""), /VERSION_CONFLICT|changed/);
});

// ---- deterministic idempotency ----------------------------------------------

test("the same logical write derives the same command id, so a retry cannot double-post", async () => {
  const input = { tenantId: "t1", actor: ACTOR, doctype: "Sales Order", name: "SO-1", action: "save", expectedVersion: 2, document: { customer: "C1" } };
  const first = await buildCommand(input);
  const second = await buildCommand({ ...input, document: { customer: "C1" } });
  assert.equal(first.command_id, second.command_id);
  assert.match(first.command_id, /^frappe-[0-9a-f]{40}$/);
});

test("a different payload or version derives a different command id", async () => {
  const base = { tenantId: "t1", actor: ACTOR, doctype: "Sales Order", name: "SO-1", action: "save", expectedVersion: 2, document: { customer: "C1" } };
  const original = await buildCommand(base);
  const otherPayload = await buildCommand({ ...base, document: { customer: "C2" } });
  const otherVersion = await buildCommand({ ...base, expectedVersion: 3 });
  const otherTenant = await buildCommand({ ...base, tenantId: "t2" });
  const ids = new Set([original.command_id, otherPayload.command_id, otherVersion.command_id, otherTenant.command_id]);
  assert.equal(ids.size, 4);
});

test("the command id does not depend on the actor, so a retry by an equivalent session still dedupes", async () => {
  const base = { tenantId: "t1", actor: ACTOR, doctype: "Sales Order", name: "SO-1", action: "create", expectedVersion: null, document: { customer: "C1" } };
  const one = await buildCommand(base);
  const two = await buildCommand({ ...base, actor: { user_id: "other@example.com", roles: ["Sales User"] } });
  assert.equal(one.command_id, two.command_id);
});

test("the payload hash covers the command actually sent", async () => {
  const command = await buildCommand({ tenantId: "t1", actor: ACTOR, doctype: "Sales Order", name: "SO-1", action: "create", expectedVersion: null, document: { customer: "C1" } });
  assert.match(command.payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(command.actor.user_id, ACTOR.user_id);
});

// ---- server-owned fields ----------------------------------------------------

test("a client cannot smuggle owner, docstatus or workflow state through a document payload", () => {
  const stripped = stripServerOwnedFields({
    customer: "C1",
    owner: "attacker@example.com",
    docstatus: 1,
    modified_by: "attacker@example.com",
    workflow_state: "Approved",
    amended_from: "SO-9999",
    __islocal: 1,
    __unsaved: 1,
  });
  assert.deepEqual(stripped, { customer: "C1" });
});

// ---- document shape ---------------------------------------------------------

test("kernel document becomes a frappe document with framework fields and ordered child rows", () => {
  const doc = toFrappeDoc(document());
  assert.equal(doc.name, "SO-0001");
  assert.equal(doc.doctype, "Sales Order");
  assert.equal(doc.docstatus, 0);
  assert.equal(doc.creation, "2026-07-26 10:00:00.000000");
  assert.equal(doc.modified, toFrappeModified("2026-07-26T10:30:00.250Z", 3));
  assert.equal(doc.customer, "CUST-1");
  // Rows arrive out of order from the store and must be sorted by idx.
  assert.deepEqual(doc.items.map((row) => row.item_code), ["A", "B"]);
  assert.deepEqual(doc.items.map((row) => row.idx), [1, 2]);
  const [first] = doc.items;
  assert.equal(first.name, "ROW-1");
  assert.equal(first.parent, "SO-0001");
  assert.equal(first.parenttype, "Sales Order");
  assert.equal(first.parentfield, "items");
  assert.equal(first.doctype, "Sales Order Item");
});

test("frappe document becomes a kernel payload, keeping real row ids and dropping client-local ones", () => {
  const payload = fromFrappeDoc({
    doctype: "Sales Order",
    name: "SO-0001",
    owner: "attacker@example.com",
    docstatus: 1,
    customer: "CUST-1",
    items: [
      { name: "ROW-1", doctype: "Sales Order Item", parent: "SO-0001", parentfield: "items", idx: 1, item_code: "A" },
      { name: "new-sales-order-item-1", item_code: "B", __islocal: 1 },
    ],
  }, new Set(["items"]));

  assert.deepEqual(Object.keys(payload).sort(), ["customer", "items"]);
  assert.equal(payload.items[0].row_id, "ROW-1");
  assert.equal(payload.items[0].item_code, "A");
  assert.equal(payload.items[1].row_id, undefined, "a locally-created row must not pin a client-chosen row_id");
  assert.equal(payload.items[1].item_code, "B");
});

test("a table field sent as a non-array becomes an empty table rather than corrupt data", () => {
  const payload = fromFrappeDoc({ customer: "C1", items: null }, new Set(["items"]));
  assert.deepEqual(payload.items, []);
});

// ---- metadata shape --------------------------------------------------------

const META = parseDocTypeMeta({
  name: "Sales Order",
  module: "Selling",
  is_submittable: true,
  autoname: "SO-.####",
  title_field: "customer",
  search_fields: ["customer"],
  fields: [
    { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer", required: true, in_list_view: true },
    { fieldname: "secret_margin", label: "Margin", fieldtype: "Currency", permlevel: 2, precision: 2 },
    { fieldname: "items", label: "Items", fieldtype: "Table", options: "Sales Order Item" },
    { fieldname: "notes", label: "Notes", fieldtype: "Small Text", depends_on: "eval:doc.customer", fetch_from: "customer.customer_name" },
  ],
  permissions: [{ role: "Sales User", read: true, write: true, create: true, submit: true }],
  revision: 4,
});

test("metadata uses frappe field names, integer flags and string precision", () => {
  const bundle = toFrappeMetaBundle({ meta: META });
  const [doc] = bundle.docs;
  assert.equal(doc.name, "Sales Order");
  assert.equal(doc.is_submittable, 1, "flags are integers, not booleans");
  assert.equal(doc.issingle, 0, "frappe spells it issingle, not is_single");
  assert.equal(doc.istable, 0, "frappe spells it istable, not is_child");
  assert.equal(doc.search_fields, "customer", "frappe carries search_fields as a comma string");

  const byName = Object.fromEntries(doc.fields.map((field) => [field.fieldname, field]));
  assert.equal(byName.customer.reqd, 1, "frappe spells mandatory as reqd");
  assert.equal(byName.customer.required, undefined);
  assert.equal(byName.secret_margin.precision, "2", "frappe carries precision as a string");
  assert.equal(byName.customer.in_list_view, 1);

  const [perm] = doc.permissions;
  assert.equal(perm.read, 1);
  assert.equal(perm.delete, 1, "delete follows write, since the kernel has no separate delete permission");
  assert.equal(perm.cancel, 0);
});

test("metadata carries depends_on and fetch_from through, which is what makes them live on the client", () => {
  const [doc] = toFrappeMetaBundle({ meta: META }).docs;
  const notes = doc.fields.find((field) => field.fieldname === "notes");
  assert.equal(notes.depends_on, "eval:doc.customer");
  assert.equal(notes.fetch_from, "customer.customer_name");
});

test("the requested doctype is findable by name even when the bundle carries child doctypes", () => {
  const childMeta = parseDocTypeMeta({
    name: "Sales Order Item",
    module: "Selling",
    is_child: true,
    fields: [{ fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item" }],
    permissions: [{ role: "Sales User", read: true }],
    revision: 1,
  });
  const bundle = toFrappeMetaBundle({ meta: childMeta, children: [META] });
  // The client looks the doctype up by name rather than taking docs[0]; both must be present.
  assert.equal(bundle.docs.find((doc) => doc.name === "Sales Order Item").istable, 1);
  assert.ok(bundle.docs.find((doc) => doc.name === "Sales Order"));
});

test("permlevel-redacted fields are reported as masked so the schema stays visible", () => {
  const filtered = { ...META, fields: META.fields.filter((field) => field.fieldname !== "secret_margin") };
  const masked = maskedFieldNames(META, filtered);
  assert.deepEqual(masked, ["secret_margin"]);
  const bundle = toFrappeMetaBundle({ meta: filtered, maskedFields: masked });
  assert.deepEqual(bundle.masked_fields, ["secret_margin"]);
});

test("an active workflow rides along as __workflow_docs in frappe shape", () => {
  const bundle = toFrappeMetaBundle({
    meta: META,
    workflow: {
      name: "SO Approval",
      document_type: "Sales Order",
      state_field: "workflow_state",
      is_active: true,
      states: [{ state: "Draft", docstatus: 0 }, { state: "Approved", docstatus: 1 }],
      transitions: [{ state: "Draft", action: "Approve", next_state: "Approved", allowed_role: "Sales Manager", allow_self_approval: false }],
      revision: 1,
    },
  });
  const [doc] = bundle.docs;
  const [workflow] = doc.__workflow_docs;
  assert.equal(workflow.workflow_state_field, "workflow_state");
  assert.equal(workflow.states[1].doc_status, "1", "frappe carries doc_status as a string");
  assert.equal(workflow.transitions[0].allowed, "Sales Manager", "frappe names the role field `allowed`");
  assert.equal(workflow.transitions[0].allow_self_approval, 0);
});

// ---- filters ----------------------------------------------------------------

test("every frappe filter form translates to the same kernel filter", () => {
  const expected = [{ field: "customer", operator: "eq", value: "CUST-1" }];
  assert.deepEqual(toKernelFilters([["Sales Order", "customer", "=", "CUST-1"]], "Sales Order"), expected);
  assert.deepEqual(toKernelFilters([["customer", "=", "CUST-1"]], "Sales Order"), expected);
  assert.deepEqual(toKernelFilters({ customer: "CUST-1" }, "Sales Order"), expected);
  assert.deepEqual(toKernelFilters({ customer: ["=", "CUST-1"] }, "Sales Order"), expected);
});

test("framework timestamp fields are aliased to kernel column names", () => {
  assert.deepEqual(toKernelFilters({ modified: [">", "2026-01-01"] }, "Sales Order"), [
    { field: "modified_at", operator: "gt", value: "2026-01-01" },
  ]);
  assert.deepEqual(toKernelSort("creation desc"), [{ field: "created_at", direction: "desc" }]);
});

test("numeric-looking filter values from a query string are coerced so typed fields accept them", () => {
  assert.deepEqual(toKernelFilters({ docstatus: "1" }, "Sales Order"), [{ field: "docstatus", operator: "eq", value: 1 }]);
});

test("unsupported filter operators are rejected, never silently dropped", () => {
  // A dropped filter would show the user every row while the UI claims a filter is active.
  for (const operator of ["not like", "not in", "between", "descendants of"]) {
    assert.throws(() => toKernelFilters([["customer", operator, "X"]], "Sales Order"), /not supported/, operator);
  }
  assert.throws(() => toKernelFilters([["Customer", "name", "=", "X"]], "Sales Order"), /related doctype/);
});

test("frappe `is not set` maps to a null check and `is set` is refused rather than approximated", () => {
  assert.deepEqual(toKernelFilters([["notes", "is", "not set"]], "Sales Order"), [{ field: "notes", operator: "is_null" }]);
  assert.throws(() => toKernelFilters([["notes", "is", "set"]], "Sales Order"), /not supported/);
});

test("in-filters accept both an array and a comma string", () => {
  assert.deepEqual(toKernelFilters({ status: ["in", ["Draft", "Submitted"]] }, "Sales Order"),
    [{ field: "status", operator: "in", value: ["Draft", "Submitted"] }]);
  assert.deepEqual(toKernelFilters([["status", "in", "Draft,Submitted"]], "Sales Order"),
    [{ field: "status", operator: "in", value: ["Draft", "Submitted"] }]);
});

test("or_filters becomes a search term only when it really is a search", () => {
  assert.equal(toKernelSearch([["customer", "like", "%acme%"], ["name", "like", "%acme%"]]), "acme");
  assert.equal(toKernelSearch(undefined), undefined);
  assert.throws(() => toKernelSearch([["customer", "=", "acme"]]), /LIKE search/);
  assert.throws(() => toKernelSearch([["customer", "like", "%a%"], ["name", "like", "%b%"]]), /single term/);
});

test("order_by tolerates backtick-qualified fields and multiple clauses", () => {
  assert.deepEqual(toKernelSort("`tabSales Order`.modified desc, name asc"), [
    { field: "modified_at", direction: "desc" },
    { field: "name", direction: "asc" },
  ]);
  assert.deepEqual(toKernelSort("name"), [{ field: "name", direction: "desc" }]);
  assert.deepEqual(toKernelSort(""), []);
});

// ---- kernel list: like + offset (added for frappe compatibility) ------------

const SO_DEFINITION = {
  doctype: "Sales Order",
  table: "documents",
  fields: {
    name: { type: "string", source: { column: "name" } },
    status: { type: "string", source: { column: "status" } },
    docstatus: { type: "int", source: { column: "docstatus" } },
    version: { type: "int", source: { column: "version" } },
    modified_at: { type: "date", source: { column: "modified_at" } },
    customer: { type: "string", source: { json: "$.customer" } },
  },
  defaultFields: ["name", "customer", "status", "docstatus", "version", "modified_at"],
  filterFields: ["name", "customer", "docstatus", "status", "modified_at"],
  searchFields: ["name", "customer"],
  sortFields: ["modified_at", "name"],
  defaultSort: [{ field: "modified_at", direction: "desc" }],
};

test("a like filter compiles with an explicit ESCAPE clause", () => {
  const request = parseDocumentListRequest({ filters: [{ field: "customer", operator: "like", value: "%acme%" }] }, SO_DEFINITION);
  const compiled = new DocumentListCompiler().compileList("t1", request, SO_DEFINITION);
  assert.match(compiled.sql, /LIKE \?\d+ ESCAPE '\\'/);
  assert.ok(compiled.params.includes("%acme%"));
});

test("a like filter is refused on a numeric field", () => {
  assert.throws(() => parseDocumentListRequest({ filters: [{ field: "docstatus", operator: "like", value: "1" }] }, SO_DEFINITION), /numeric field/);
});

test("offset paginates for frappe clients and is bounded", () => {
  const request = parseDocumentListRequest({ offset: 40, limit: 20 }, SO_DEFINITION);
  assert.equal(request.offset, 40);
  const compiled = new DocumentListCompiler().compileList("t1", request, SO_DEFINITION);
  assert.match(compiled.sql, /LIMIT \?\d+ OFFSET \?\d+/);
  assert.equal(compiled.params.at(-1), 40);
  assert.equal(compiled.params.at(-2), 21, "one extra row is still fetched to detect a further page");
  assert.throws(() => parseDocumentListRequest({ offset: 10_001 }, SO_DEFINITION), /offset must be/);
  assert.throws(() => parseDocumentListRequest({ offset: -1 }, SO_DEFINITION), /offset must be/);
});

test("offset and cursor cannot be combined", () => {
  // Honouring one and ignoring the other would return a page nobody asked for.
  assert.throws(() => parseDocumentListRequest({ offset: 20, cursor: "abc" }, SO_DEFINITION), /cannot be combined/);
});

test("offset zero stays on the keyset path", () => {
  const request = parseDocumentListRequest({ offset: 0 }, SO_DEFINITION);
  assert.equal(request.offset, undefined);
  assert.doesNotMatch(new DocumentListCompiler().compileList("t1", request, SO_DEFINITION).sql, /OFFSET/);
});

// ---- envelope / faults ------------------------------------------------------

test("method responses wrap the payload under message", async () => {
  const response = methodResponse({ ok: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: { ok: true } });
});

test("a version conflict surfaces as TimestampMismatchError, the only exception the client reads as a conflict", async () => {
  const response = faultResponse(errors.version(7), "trace-1");
  assert.equal(response.status, 417);
  const body = await response.json();
  assert.equal(body.exc_type, "TimestampMismatchError");
  assert.match(body.exception, /^frappe\.exceptions\.TimestampMismatchError: /);
});

test("faults map onto the exception names the client branches on", async () => {
  const cases = [
    [errors.authentication(), 401, "AuthenticationError"],
    [errors.permission(), 403, "PermissionError"],
    [errors.notFound(), 404, "DoesNotExistError"],
    [errors.validation("bad"), 417, "ValidationError"],
    [errors.reference("bad link"), 417, "LinkValidationError"],
    [errors.exists(), 417, "DuplicateEntryError"],
    [errors.lifecycle("no"), 417, "ValidationError"],
  ];
  for (const [error, status, excType] of cases) {
    const response = faultResponse(error, "trace-1");
    assert.equal(response.status, status, excType);
    assert.equal((await response.json()).exc_type, excType);
  }
});

test("server errors keep their 5xx status and never leak internal detail", async () => {
  const response = faultResponse(new Error("SQLITE_CONSTRAINT: documents.tenant_id"), "trace-1");
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.doesNotMatch(JSON.stringify(body), /SQLITE|tenant_id/);
});

test("_server_messages is doubly-encoded and carries fieldname so the error lands on the control", async () => {
  const response = faultResponse(errors.validation("Customer is required", { fieldname: "customer" }), "trace-1");
  const body = await response.json();
  // The client parses two levels: a JSON string holding an array of JSON strings.
  const outer = JSON.parse(body._server_messages);
  assert.equal(outer.length, 1);
  const inner = JSON.parse(outer[0]);
  assert.equal(inner.message, "Customer is required");
  assert.equal(inner.fieldname, "customer");
});

// ---- argument parsing -------------------------------------------------------

function request(url, init) {
  return new Request(url, init);
}

test("arguments merge query string and body, with the body winning", async () => {
  const url = new URL("https://x/api/method/m?doctype=Item&limit=5");
  const args = await readFrappeArgs(request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 10 }) }), url);
  assert.equal(args.text("doctype"), "Item");
  assert.equal(args.int("limit", 0), 10);
});

test("structured arguments are accepted as JSON strings, the way frappe clients send them", async () => {
  const url = new URL('https://x/api/method/m?filters=[["customer","=","C1"]]&fields=["name"]');
  const args = await readFrappeArgs(request(url), url);
  assert.deepEqual(args.array("filters"), [["customer", "=", "C1"]]);
  assert.deepEqual(args.array("fields"), ["name"]);
});

test("form-encoded bodies are accepted", async () => {
  const url = new URL("https://x/api/method/m");
  const args = await readFrappeArgs(request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "doctype=Item&cmd=x",
  }), url);
  assert.equal(args.text("doctype"), "Item");
});

test("frappe booleans arrive in several forms and all resolve", async () => {
  const url = new URL("https://x/api/method/m?a=1&b=0&c=true&d=");
  const args = await readFrappeArgs(request(url), url);
  assert.equal(args.bool("a"), true);
  assert.equal(args.bool("b"), false);
  assert.equal(args.bool("c"), true);
  assert.equal(args.bool("d", true), true, "an empty value falls back rather than reading as false");
  assert.equal(args.bool("missing", true), true);
});

test("a required argument fails closed and malformed JSON is a validation error", async () => {
  const url = new URL("https://x/api/method/m?filters=not-json");
  const args = await readFrappeArgs(request(url), url);
  assert.throws(() => args.requireText("doctype"), /doctype is required/);
  assert.throws(() => args.array("filters"), /valid JSON/);
});
