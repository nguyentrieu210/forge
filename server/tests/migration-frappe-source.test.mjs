import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFrappeIncrementalPageRequest,
  frappeIncrementalSearchParams,
  nextFrappeIncrementalCursor,
} from "../dist/packages/migration/src/public.js";

test("Frappe incremental request uses stable modified+name tuple paging", () => {
  const request = buildFrappeIncrementalPageRequest({
    doctype: "Customer",
    fields: ["customer_name", "customer_group"],
    cursor: { modified: "2026-08-03T10:00:00.000Z", name: "CUST-0100" },
    page_length: 250,
  });
  assert.deepEqual(request.fields, ["name", "modified", "customer_name", "customer_group"]);
  assert.deepEqual(request.filters, [["Customer", "modified", ">=", "2026-08-03T10:00:00.000Z"]]);
  assert.deepEqual(request.or_filters, [
    ["Customer", "modified", ">", "2026-08-03T10:00:00.000Z"],
    ["Customer", "name", ">", "CUST-0100"],
  ]);
  assert.equal(request.order_by, "modified asc, name asc");
  const params = frappeIncrementalSearchParams(request);
  assert.equal(params.get("limit_page_length"), "250");
  assert.match(params.get("or_filters"), /CUST-0100/);
});

test("next Frappe cursor is taken from the exact last ordered row", () => {
  const cursor = nextFrappeIncrementalCursor([
    { name: "CUST-0101", modified: "2026-08-03T10:00:00.000Z" },
    { name: "CUST-0102", modified: "2026-08-03T10:00:00.000Z" },
  ]);
  assert.deepEqual(cursor, { name: "CUST-0102", modified: "2026-08-03T10:00:00.000Z" });
  assert.equal(nextFrappeIncrementalCursor([]), null);
});

test("Frappe cursor rejects malformed datetime and excessive page size", () => {
  assert.throws(() => buildFrappeIncrementalPageRequest({
    doctype: "Item", fields: ["item_name"], cursor: { modified: "not-a-date", name: "ITEM-1" },
  }));
  assert.throws(() => buildFrappeIncrementalPageRequest({ doctype: "Item", fields: [], page_length: 5000 }));
});
