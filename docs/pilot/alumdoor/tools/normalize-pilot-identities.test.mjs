import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeCustomersByExactName,
  normalizeDuplicateItemCodes,
  normalizePilotIdentities,
} from "./normalize-pilot-identities.mjs";

test("duplicate item codes keep the first code and suffix later collisions with 01, 02", () => {
  const result = normalizeDuplicateItemCodes([
    { source_key: "i1", item_code: "AL548", item_name: "A" },
    { source_key: "i2", item_code: "AL548", item_name: "B" },
    { source_key: "i3", item_code: "AL54801", item_name: "Existing 01" },
    { source_key: "i4", item_code: "AL548", item_name: "C" },
  ]);
  assert.deepEqual(result.rows.map((row) => row.item_code), ["AL548", "AL54802", "AL54801", "AL54803"]);
  assert.equal(result.rows[1].source_code_original, "AL548");
  assert.equal(result.rows[3].source_code_original, "AL548");
  assert.equal(result.collisions.length, 2);
});

test("duplicate customers keep one canonical record by source order", () => {
  const result = dedupeCustomersByExactName([
    { source_key: "c1", customer_name: "Công ty Sáu Hồng", phone: "111" },
    { source_key: "c2", customer_name: "  CÔNG TY   SÁU HỒNG ", phone: "222" },
    { source_key: "c3", customer_name: "Khách khác" },
  ]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].source_key, "c1");
  assert.equal(result.rows[0].phone, "111");
  assert.equal(result.aliasBySourceKey.get("c2"), "c1");
  assert.equal(result.duplicates.length, 1);
});

test("customer references are remapped to the retained customer", () => {
  const result = normalizePilotIdentities({
    items: [],
    customers: [
      { source_key: "c1", customer_name: "A" },
      { source_key: "c2", customer_name: "a" },
    ],
    contacts: [{ source_key: "ct1", customer_source_key: "c2", full_name: "Nguyen A" }],
    opening_ar: [{ source_key: "ar1", customer_source_key: "c2", reference: "INV-1", posting_date: "2026-06-30", due_date: "2026-07-30", amount_vnd: "1000" }],
  });
  assert.equal(result.customers.length, 1);
  assert.equal(result.contacts[0].customer_source_key, "c1");
  assert.equal(result.contacts[0].customer_source_key_original, "c2");
  assert.equal(result.opening_ar[0].customer_source_key, "c1");
  assert.equal(result.evidence.production_data_mutated, false);
});
