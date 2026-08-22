import assert from "node:assert/strict";
import test from "node:test";

import { readableSubmittedSupplierOrders } from "../dist/apps/tenant-worker/src/supplier-price-history-access.js";

function order(name, supplier, docstatus = 1) {
  return {
    tenant_id: "demo", doctype: "Purchase Order", name, owner: "buyer@example.com",
    docstatus, status: docstatus === 1 ? "Submitted" : "Draft", version: 1,
    created_at: "2026-08-01T00:00:00Z", modified_at: "2026-08-01T00:00:00Z",
    data: { supplier, company: "ALUMDOOR", currency: "VND", transaction_date: "2026-08-01", items: [] },
    children: [],
  };
}

test("supplier price history filters document-level permissions before aggregation", async () => {
  const checked = [];
  const result = await readableSubmittedSupplierOrders([
    order("PO-VISIBLE", "NCC A"),
    order("PO-HIDDEN", "NCC A"),
    order("PO-DRAFT", "NCC A", 0),
    order("PO-OTHER", "NCC B"),
  ], "NCC A", async (row) => {
    checked.push(row.name);
    return row.name === "PO-VISIBLE";
  });
  assert.deepEqual(checked, ["PO-VISIBLE", "PO-HIDDEN"]);
  assert.deepEqual(result.map((row) => row.name), ["PO-VISIBLE"]);
});
