import test from "node:test";
import assert from "node:assert/strict";
import {
  DocumentListCompiler,
  DocumentListService,
  DOCUMENT_LIST_DEFINITIONS,
  parseDocumentListRequest,
  resolveDefinition,
  encodeCursor,
  decodeCursor,
} from "../dist/packages/document-kernel/src/index.js";
import { PermissionService } from "../dist/packages/policy/src/index.js";

const compiler = new DocumentListCompiler();
const soDef = DOCUMENT_LIST_DEFINITIONS["Sales Order"];

function parse(body) {
  return parseDocumentListRequest(body, resolveDefinition(body));
}
function compileList(body, tenant = "demo") {
  return compiler.compileList(tenant, parse(body), resolveDefinition(body));
}

test("list always binds the SERVER tenant as ?1 and doctype as ?2 (body tenant is ignored)", () => {
  const compiled = compileList({ doctype: "Sales Order", tenant_id: "attacker", actor: "root" });
  assert.equal(compiled.params[0], "demo");
  assert.equal(compiled.params[1], "Sales Order");
  assert.match(compiled.sql, /FROM documents WHERE tenant_id=\?1 AND doctype=\?2/);
});

test("unsupported doctype is rejected", () => {
  assert.throws(() => resolveDefinition({ doctype: "User" }), (e) => e.code === "VALIDATION_ERROR");
  assert.throws(() => resolveDefinition({}), (e) => e.code === "VALIDATION_ERROR");
});

test("a field outside the whitelist is rejected", () => {
  assert.throws(() => parse({ doctype: "Sales Order", fields: ["name", "payload_json"] }), (e) => e.code === "VALIDATION_ERROR");
  assert.throws(() => parse({ doctype: "Sales Order", filters: [{ field: "owner_secret", operator: "eq", value: "x" }] }), (e) => e.code === "VALIDATION_ERROR");
});

test("a sort field outside the whitelist is rejected", () => {
  assert.throws(() => parse({ doctype: "Sales Order", sort: [{ field: "payload_json", direction: "asc" }] }), (e) => e.code === "VALIDATION_ERROR");
  // grand_total is projectable but NOT a sort field
  assert.throws(() => parse({ doctype: "Sales Order", sort: [{ field: "grand_total", direction: "asc" }] }), (e) => e.code === "VALIDATION_ERROR");
});

test("an operator outside the whitelist is rejected", () => {
  assert.throws(() => parse({ doctype: "Sales Order", filters: [{ field: "docstatus", operator: "regex", value: 1 }] }), (e) => e.code === "VALIDATION_ERROR");
  assert.throws(() => parse({ doctype: "Sales Order", filters: [{ field: "customer", operator: "glob", value: "x" }] }), (e) => e.code === "VALIDATION_ERROR");
});

test("like is allowed on text fields only, and never widens the whitelist", () => {
  // `like` was added for the Frappe list protocol, which has no equivalent of the
  // server-owned `search` term. It stays inside the same field whitelist, and a
  // LIKE against a numeric column is refused because SQLite would coerce every
  // row and return results the caller cannot predict.
  const request = parse({ doctype: "Sales Order", filters: [{ field: "customer", operator: "like", value: "%acme%" }] });
  assert.deepEqual(request.filters, [{ field: "customer", operator: "like", value: "%acme%" }]);
  assert.throws(() => parse({ doctype: "Sales Order", filters: [{ field: "docstatus", operator: "like", value: "1" }] }), (e) => e.code === "VALIDATION_ERROR");
  assert.throws(() => parse({ doctype: "Sales Order", filters: [{ field: "not_a_field", operator: "like", value: "x" }] }), (e) => e.code === "VALIDATION_ERROR");
});

test("limit and filter budgets are enforced", () => {
  assert.throws(() => parse({ doctype: "Sales Order", limit: 1000 }), (e) => e.code === "VALIDATION_ERROR");
  assert.throws(() => parse({ doctype: "Sales Order", limit: 0 }), (e) => e.code === "VALIDATION_ERROR");
  const tooMany = Array.from({ length: 21 }, () => ({ field: "docstatus", operator: "eq", value: 1 }));
  assert.throws(() => parse({ doctype: "Sales Order", filters: tooMany }), (e) => e.code === "VALIDATION_ERROR");
});

test("int filters reject non-integer values; string filters keep the raw string as a value", () => {
  assert.throws(() => parse({ doctype: "Sales Order", filters: [{ field: "docstatus", operator: "eq", value: "1 OR 1=1" }] }), (e) => e.code === "VALIDATION_ERROR");
  const req = parse({ doctype: "Sales Order", filters: [{ field: "customer", operator: "eq", value: "CUST-1" }] });
  assert.equal(req.filters[0].value, "CUST-1");
});

test("search is bounded to the definition's searchFields only, as a LIKE parameter", () => {
  const compiled = compileList({ doctype: "Sales Order", search: "CUST" });
  assert.match(compiled.sql, /json_extract\(payload_json, '\$\.customer'\) LIKE \?\d+ ESCAPE/);
  assert.match(compiled.sql, /"name" LIKE \?\d+ ESCAPE/);
  assert.ok(compiled.params.includes("%CUST%"));
  // company is a real field but NOT a search field
  assert.doesNotMatch(compiled.sql, /'\$\.company'\) LIKE/);
});

test("LIKE wildcards in the search term are escaped so they match literally", () => {
  const compiled = compileList({ doctype: "Sales Order", search: "50%_x" });
  assert.ok(compiled.params.includes("%50\\%\\_x%"));
});

test("default sort appends a unique name tie-breaker and fetches limit+1", () => {
  const compiled = compileList({ doctype: "Sales Order" });
  assert.equal(compiled.effectiveSort.length, 2);
  assert.deepEqual(compiled.effectiveSort[1], { field: "name", direction: "desc" });
  assert.match(compiled.sql, /ORDER BY "modified_at" DESC, "name" DESC/);
  assert.equal(compiled.params[compiled.params.length - 1], 26);
});

test("a SQL-injection string is bound as a value, never concatenated into SQL", () => {
  const evil = "'; DROP TABLE documents;--";
  const compiled = compileList({ doctype: "Sales Order", filters: [{ field: "customer", operator: "eq", value: evil }] });
  assert.ok(compiled.params.includes(evil));
  assert.doesNotMatch(compiled.sql, /DROP TABLE/);
  assert.match(compiled.sql, /json_extract\(payload_json, '\$\.customer'\) = \?\d+/);
});

test("count uses the same selection predicate as list, without cursor/order/limit", () => {
  const body = { doctype: "Sales Order", filters: [{ field: "docstatus", operator: "eq", value: 1 }], search: "AC" };
  const req = parse(body);
  const count = compiler.compileCount("demo", req, soDef);
  assert.match(count.sql, /^SELECT COUNT\(\*\) AS count FROM documents WHERE tenant_id=\?1 AND doctype=\?2/);
  assert.doesNotMatch(count.sql, /ORDER BY|LIMIT/);
  assert.match(count.sql, /"docstatus" = \?\d+/);
  assert.match(count.sql, / LIKE \?\d+ ESCAPE/);
  assert.equal(count.params[0], "demo");
});

test("cursor round-trips, is sort-scoped, and builds a lexicographic keyset predicate", () => {
  const sort = [{ field: "modified_at", direction: "desc" }, { field: "name", direction: "desc" }];
  const cursor = encodeCursor(sort, { modified_at: "2026-07-24T00:00:00.000Z", name: "SO-9" });
  assert.deepEqual(decodeCursor(cursor, sort), ["2026-07-24T00:00:00.000Z", "SO-9"]);
  // a cursor issued for one sort is invalid for another
  assert.throws(() => decodeCursor(cursor, [{ field: "name", direction: "asc" }]), (e) => e.code === "VALIDATION_ERROR");
  // garbage is rejected, not crashed
  assert.throws(() => decodeCursor("!!not-base64!!", sort), (e) => e.code === "VALIDATION_ERROR");
  const compiled = compileList({ doctype: "Sales Order", cursor });
  assert.match(compiled.sql, /\("modified_at" < \?\d+\) OR \("modified_at" = \?\d+ AND "name" < \?\d+\)/);
});

test("service denies an unauthorized doctype BEFORE any store access (no existence oracle)", async () => {
  let touched = false;
  const spyStore = {
    list: async () => { touched = true; return { rows: [], next_cursor: null, has_more: false }; },
    count: async () => { touched = true; return 0; },
  };
  const service = new DocumentListService(spyStore, new PermissionService());
  const salesActor = { user_id: "u1", roles: ["Sales User"] };
  await assert.rejects(service.list(salesActor, "demo", { doctype: "Payment Entry" }), (e) => e.code === "PERMISSION_DENIED");
  assert.equal(touched, false, "store must not be touched when permission is denied");
  await service.list(salesActor, "demo", { doctype: "Sales Order" });
  assert.equal(touched, true, "authorized reads reach the store");
});

// --- fixes from the adversarial security review ---

test("sorting by a nullable json field COALESCEs to '' so NULLs cannot break the keyset (no silent skip)", () => {
  const compiled = compileList({ doctype: "Sales Order", sort: [{ field: "transaction_date", direction: "desc" }] });
  assert.match(compiled.sql, /ORDER BY COALESCE\(json_extract\(payload_json, '\$\.transaction_date'\), ''\) DESC/);
  const cursor = encodeCursor(compiled.effectiveSort, { transaction_date: null, name: "X" });
  const withCursor = compileList({ doctype: "Sales Order", sort: [{ field: "transaction_date", direction: "desc" }], cursor });
  assert.match(withCursor.sql, /COALESCE\(json_extract\(payload_json, '\$\.transaction_date'\), ''\) </);
});

test("encodeCursor coalesces a null sort value to '' to match the SQL COALESCE", () => {
  const sort = [{ field: "transaction_date", direction: "desc" }, { field: "name", direction: "desc" }];
  assert.deepEqual(decodeCursor(encodeCursor(sort, { transaction_date: null, name: "Z" }), sort), ["", "Z"]);
});

test("decodeCursor rejects a forged cursor whose key values are not scalars (422, not a 500)", () => {
  const sort = [{ field: "name", direction: "desc" }];
  const forged = Buffer.from(JSON.stringify({ v: 1, s: "name:desc", k: [{}] })).toString("base64url");
  assert.throws(() => decodeCursor(forged, sort), (e) => e.code === "VALIDATION_ERROR");
  const forgedArr = Buffer.from(JSON.stringify({ v: 1, s: "name:desc", k: [[1, 2]] })).toString("base64url");
  assert.throws(() => decodeCursor(forgedArr, sort), (e) => e.code === "VALIDATION_ERROR");
});

test("the total bound-parameter budget rejects an over-cap IN combination before D1 would 500", () => {
  const values = Array.from({ length: 50 }, (_, i) => `v${i}`);
  const req = parse({ doctype: "Sales Order", filters: [
    { field: "customer", operator: "in", value: values },
    { field: "company", operator: "in", value: values },
  ] });
  assert.throws(() => compiler.compileList("demo", req, soDef), (e) => e.code === "VALIDATION_ERROR");
  assert.throws(() => compiler.compileCount("demo", req, soDef), (e) => e.code === "VALIDATION_ERROR");
});

test("an inherited object key cannot pass the field whitelist (prototype-pollution hardening)", () => {
  assert.throws(() => parse({ doctype: "Sales Order", fields: ["constructor"] }), (e) => e.code === "VALIDATION_ERROR");
  assert.throws(() => parse({ doctype: "Sales Order", fields: ["__proto__"] }), (e) => e.code === "VALIDATION_ERROR");
  assert.throws(() => parse({ doctype: "Sales Order", fields: ["toString"] }), (e) => e.code === "VALIDATION_ERROR");
});

test("service forwards the SERVER tenant to the store regardless of the request body", async () => {
  let seenTenant = null;
  const spyStore = {
    list: async (tenantId) => { seenTenant = tenantId; return { rows: [], next_cursor: null, has_more: false }; },
    count: async () => 0,
  };
  const service = new DocumentListService(spyStore, new PermissionService());
  await service.list({ user_id: "Administrator", roles: ["System Manager"] }, "demo", { doctype: "Sales Order", tenant_id: "other" });
  assert.equal(seenTenant, "demo");
});
