#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_PILOT_01_DATASETS } from "./validate-pilot-batch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const lock = JSON.parse(readFileSync(path.join(root, "PILOT_00_LOCK.json"), "utf8"));
const mapping = JSON.parse(readFileSync(path.join(root, "PILOT_DATA_MAPPING_V1.json"), "utf8"));
const template = JSON.parse(readFileSync(path.join(root, "PILOT_01_BATCH_MANIFEST_TEMPLATE.json"), "utf8"));

assert.equal(lock.status, "PILOT-00-LOCKED");
assert.equal(lock.production_data_mutated_by_pilot_00, false);
assert.equal(mapping.status, "FROZEN_SCHEMA");
assert.equal(mapping.tenant, lock.pilot.tenant);
assert.equal(mapping.target_release_sha, lock.certified_release.source_sha);
assert.equal(template.tenant, lock.pilot.tenant);
assert.equal(template.target_release_sha, lock.certified_release.source_sha);
assert.equal(template.mapping_version, mapping.version);
assert.equal(template.local_display_timezone, "Asia/Ho_Chi_Minh");
assert.equal(template.status, "TEMPLATE_NOT_EVIDENCE");
assert.equal(mapping.preview_acceptance.production_write_authorized, false);

const mappingIds = new Set(mapping.datasets.map((dataset) => dataset.id));
const templateIds = new Set(template.files.map((file) => file.dataset_id));
for (const dataset of REQUIRED_PILOT_01_DATASETS) {
  assert.ok(mappingIds.has(dataset), `mapping missing required Pilot-01 dataset ${dataset}`);
  assert.ok(templateIds.has(dataset), `manifest template missing required Pilot-01 dataset ${dataset}`);
}
assert.equal(template.scope.opening_cash_bank, false);
assert.ok(!templateIds.has("opening_cash_bank"));

const personas = new Set(mapping.datasets.find((dataset) => dataset.id === "pilot_users").allowed_personas);
assert.ok(personas.has("Giám đốc"));
assert.equal(lock.business_governance.cutover_approver_role, "Giám đốc");
assert.equal(lock.business_governance.single_accountable_approver, true);
assert.equal(lock.reconciliation_policy.default_variance_tolerance, 0);

console.log(`PILOT_01_CONTRACT_PASS release=${mapping.target_release_sha} mapping=v${mapping.version} datasets=${REQUIRED_PILOT_01_DATASETS.length} write_authorized=false`);
