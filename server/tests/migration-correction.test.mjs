import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMigrationCorrectionDataset,
  buildMigrationPlan,
  renderMigrationCorrectionCsv,
} from "../dist/packages/migration/src/public.js";

test("correction dataset includes confirmed failures only", async () => {
  const plan = await buildMigrationPlan({
    source_id: "items",
    source_kind: "csv",
    target_doctype: "Item",
    headers: ["name", "item_name", "meta"],
    rows: [
      { name: "A", item_name: "Alpha", meta: { source: "old" } },
      { name: "B", item_name: "Beta", meta: { source: "old" } },
    ],
    target_fields: ["item_name", "meta"],
    key_field: "name",
  });
  const dataset = buildMigrationCorrectionDataset(plan, [
    { row_key: "A", fingerprint: plan.rows[0].fingerprint, status: "failed", error: "Item Group missing" },
    { row_key: "B", fingerprint: plan.rows[1].fingerprint, status: "imported", target_name: "B" },
  ]);
  assert.equal(dataset.failed_rows.length, 1);
  assert.equal(dataset.failed_rows[0].__source_row, 2);
  assert.equal(dataset.failed_rows[0].__row_key, "A");
  assert.equal(dataset.failed_rows[0].__error, "Item Group missing");
  assert.equal(dataset.failed_rows[0].item_name, "Alpha");
  const csv = renderMigrationCorrectionCsv(dataset);
  assert.match(csv, /__source_row,__row_key,__error,item_name,meta/);
  assert.match(csv, /Item Group missing/);
  assert.match(csv, /\{\"\"source\"\":\"\"old\"\"\}/);
});

test("correction dataset rejects stale outcome fingerprints", async () => {
  const plan = await buildMigrationPlan({
    source_id: "items",
    source_kind: "csv",
    target_doctype: "Item",
    headers: ["name", "item_name"],
    rows: [{ name: "A", item_name: "Alpha" }],
    target_fields: ["item_name"],
    key_field: "name",
  });
  assert.throws(() => buildMigrationCorrectionDataset(plan, [
    { row_key: "A", fingerprint: "0".repeat(64), status: "failed", error: "old error" },
  ]));
});
