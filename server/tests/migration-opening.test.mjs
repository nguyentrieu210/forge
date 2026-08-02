import test from "node:test";
import assert from "node:assert/strict";
import {
  executeOpeningMigration,
  normalizeOpeningDataset,
  previewOpeningMigration,
} from "../dist/packages/migration/src/public.js";

const dataset = {
  source_id: "opening-ar-2026",
  domain: "finance",
  company: "ACME",
  as_of_date: "2026-01-01",
  records: [
    { source_key: "CUST-1", payload: { party: "CUST-1", amount: "1000.25" } },
    { source_key: "CUST-2", payload: { party: "CUST-2", amount: "500" } },
  ],
};

test("opening preview validates without authoritative apply", async () => {
  let applied = false;
  const provider = {
    domain: "finance",
    async validate() { return { valid: true, errors: [], warnings: [], expected_metrics: { ar_total: "1500.25" } }; },
    async apply() { applied = true; return { target_refs: [], applied_metrics: {} }; },
    async reconcile() { return { ar_total: "1500.25" }; },
  };
  const preview = await previewOpeningMigration(dataset, provider);
  assert.match(preview.dataset_id, /^opening-/);
  assert.equal(preview.validation.valid, true);
  assert.equal(applied, false);
});

test("opening execute delegates posting then compares exact domain metrics", async () => {
  const events = [];
  const provider = {
    domain: "finance",
    async validate() { events.push("validate"); return { valid: true, errors: [], warnings: [], expected_metrics: { ar_total: "1500.25" } }; },
    async apply() { events.push("apply"); return { target_refs: ["Journal Entry:OPEN-1"], applied_metrics: { ar_total: "1500.25" } }; },
    async reconcile() { events.push("reconcile"); return { ar_total: "1500.25" }; },
  };
  const result = await executeOpeningMigration(dataset, provider);
  assert.deepEqual(events, ["validate", "apply", "reconcile"]);
  assert.equal(result.reconciled, true);
  assert.deepEqual(result.target_refs, ["Journal Entry:OPEN-1"]);
  assert.deepEqual(result.metrics, [{ metric: "ar_total", expected: "1500.25", actual: "1500.25", matches: true }]);
});

test("opening execute refuses invalid preview before provider apply", async () => {
  let applied = false;
  const provider = {
    domain: "stock",
    async validate() { return { valid: false, errors: ["warehouse missing"], warnings: [], expected_metrics: {} }; },
    async apply() { applied = true; return { target_refs: [], applied_metrics: {} }; },
    async reconcile() { return {}; },
  };
  await assert.rejects(() => executeOpeningMigration({ ...dataset, domain: "stock" }, provider), /validation failed/i);
  assert.equal(applied, false);
});

test("opening dataset rejects duplicate source identities", () => {
  assert.throws(() => normalizeOpeningDataset({
    ...dataset,
    records: [dataset.records[0], dataset.records[0]],
  }), /Duplicate opening source_key/);
});

test("opening dataset rejects impossible calendar dates", () => {
  assert.throws(() => normalizeOpeningDataset({ ...dataset, as_of_date: "2026-02-30" }), /real YYYY-MM-DD date/);
  assert.throws(() => normalizeOpeningDataset({ ...dataset, as_of_date: "2025-02-29" }), /real YYYY-MM-DD date/);
  assert.equal(normalizeOpeningDataset({ ...dataset, as_of_date: "2024-02-29" }).as_of_date, "2024-02-29");
});
