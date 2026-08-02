import test from "node:test";
import assert from "node:assert/strict";
import {
  addExactDecimal,
  computeReconciliationMetrics,
  orderMigrationTargets,
  parseMigrationManifest,
} from "../dist/packages/migration/src/public.js";

test("migration manifest orders master -> opening -> transaction by dependencies", () => {
  const manifest = parseMigrationManifest({
    schema_version: 1,
    id: "erpnext-cutover-2026-08",
    sources: [
      { id: "erpnext", kind: "erpnext", adapter: "erpnext-rest-v1", options: { base_url_ref: "ERP_SOURCE_URL" } },
    ],
    targets: [
      {
        id: "sales-invoices", source_id: "erpnext", target_doctype: "Sales Invoice", phase: "transaction",
        depends_on: ["customers", "opening-ar"], mapping: {}, duplicate_policy: "error", key_field: "name",
        reconciliation_metrics: ["invoice_count", "grand_total"],
      },
      {
        id: "opening-ar", source_id: "erpnext", target_doctype: "Journal Entry", phase: "opening",
        depends_on: ["customers"], mapping: {}, duplicate_policy: "error", key_field: "name",
        reconciliation_metrics: ["ar_balance"],
      },
      {
        id: "customers", source_id: "erpnext", target_doctype: "Customer", phase: "master",
        depends_on: [], mapping: {}, duplicate_policy: "update", key_field: "name",
        reconciliation_metrics: ["customer_count"],
      },
    ],
  });
  assert.deepEqual(orderMigrationTargets(manifest).map((target) => target.id), ["customers", "opening-ar", "sales-invoices"]);
});

test("migration manifest rejects embedded credentials", () => {
  assert.throws(() => parseMigrationManifest({
    schema_version: 1,
    id: "bad-secrets",
    sources: [{ id: "erpnext", kind: "erpnext", adapter: "erpnext-rest-v1", options: { api_token: "do-not-commit-this" } }],
    targets: [{
      id: "customers", source_id: "erpnext", target_doctype: "Customer", phase: "master",
      depends_on: [], mapping: {}, reconciliation_metrics: [],
    }],
  }), /must not contain secret field/i);
});

test("migration manifest rejects reverse phase dependencies and cycles", () => {
  assert.throws(() => parseMigrationManifest({
    schema_version: 1,
    id: "reverse-phase",
    sources: [{ id: "file", kind: "csv", adapter: "csv-v1" }],
    targets: [
      { id: "opening", source_id: "file", target_doctype: "Journal Entry", phase: "opening", depends_on: [], mapping: {}, reconciliation_metrics: [] },
      { id: "master", source_id: "file", target_doctype: "Customer", phase: "master", depends_on: ["opening"], mapping: {}, reconciliation_metrics: [] },
    ],
  }), /later phase/i);

  assert.throws(() => parseMigrationManifest({
    schema_version: 1,
    id: "cycle",
    sources: [{ id: "file", kind: "csv", adapter: "csv-v1" }],
    targets: [
      { id: "a", source_id: "file", target_doctype: "A", phase: "master", depends_on: ["b"], mapping: {}, reconciliation_metrics: [] },
      { id: "b", source_id: "file", target_doctype: "B", phase: "master", depends_on: ["a"], mapping: {}, reconciliation_metrics: [] },
    ],
  }), /cycle/i);
});

test("reconciliation metrics aggregate nested decimal values exactly", () => {
  const rows = [
    { name: "PR-1", supplier: "S1", items: [{ item_code: "AL71", qty: "0.1", amount: "1000.25" }, { item_code: "AL72", qty: "0.2", amount: "2000.10" }] },
    { name: "PR-2", supplier: "S1", items: [{ item_code: "AL71", qty: "1.234500", amount: "99.65" }] },
  ];
  const metrics = computeReconciliationMetrics(rows, [
    { name: "document_count", kind: "count" },
    { name: "line_count", kind: "count", path: "items[]" },
    { name: "supplier_count", kind: "count_distinct", path: "supplier" },
    { name: "item_count", kind: "count_distinct", path: "items[].item_code" },
    { name: "qty_total", kind: "sum_decimal", path: "items[].qty" },
    { name: "amount_total", kind: "sum_decimal", path: "items[].amount" },
  ]);
  assert.deepEqual(metrics, {
    document_count: "2",
    line_count: "3",
    supplier_count: "1",
    item_count: "2",
    qty_total: "1.5345",
    amount_total: "3100",
  });
  assert.equal(addExactDecimal("999999999999999999.99", "0.01"), "1000000000000000000");
});
