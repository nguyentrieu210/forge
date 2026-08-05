import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSyntheticPilotBatch, syntheticPilotData } from "./generate-pilot-01-synthetic-batch.mjs";

const REQUIRED_DATASETS = [
  "customers",
  "contacts",
  "suppliers",
  "items",
  "boms",
  "work_centers",
  "warehouses",
  "opening_stock",
  "opening_ar",
  "opening_ap",
  "employees",
  "pilot_users",
];

test("synthetic Pilot-01 fixture is complete, zero-variance and PREVIEW_PASS", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "forge-pilot-01-synthetic-"));
  try {
    const result = buildSyntheticPilotBatch(dir);
    assert.equal(result.preview.status, "PREVIEW_PASS");
    assert.equal(result.preview.counts.errors, 0);
    assert.equal(result.preview.acceptance.required_datasets_present, true);
    assert.equal(result.preview.acceptance.references_resolved, true);
    assert.equal(result.preview.acceptance.unexplained_reconciliation_variance, 0);
    assert.equal(result.preview.acceptance.named_cutover_approver_account, true);
    assert.equal(result.preview.acceptance.production_write_authorized, false);
    assert.equal(result.preview.production_data_mutated, false);
    assert.deepEqual(result.manifest.files.map((entry) => entry.dataset_id).sort(), [...REQUIRED_DATASETS].sort());
    assert.equal(result.manifest.files.find((entry) => entry.dataset_id === "opening_stock").source_totals.stock_value_total, "89500000");
    assert.equal(result.manifest.files.find((entry) => entry.dataset_id === "opening_ar").source_totals.total_amount_vnd, "22750000");
    assert.equal(result.manifest.files.find((entry) => entry.dataset_id === "opening_ap").source_totals.total_amount_vnd, "13000000");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("synthetic fixture is visibly non-customer data and has exactly one active Giám đốc", () => {
  const data = syntheticPilotData();
  for (const [dataset, rows] of Object.entries(data)) {
    for (const row of rows) {
      if (row.source_key) assert.match(row.source_key, /^SYN-/i, `${dataset} source_key must remain synthetic`);
    }
  }
  for (const row of data.pilot_users) assert.match(row.account, /\.invalid$/);
  const directors = data.pilot_users.filter((row) => row.active && row.persona === "Giám đốc");
  assert.equal(directors.length, 1);
});

test("synthetic fixture covers all six frozen pilot personas", () => {
  const personas = new Set(syntheticPilotData().pilot_users.map((row) => row.persona));
  assert.deepEqual(personas, new Set(["Giám đốc", "Chủ xưởng", "Kinh doanh", "Thủ kho", "Kế toán", "Sản xuất"]));
});
