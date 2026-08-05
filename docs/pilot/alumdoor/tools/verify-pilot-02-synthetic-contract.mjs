#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pilotRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pilotRoot, "../../..");
const contract = JSON.parse(readFileSync(path.join(pilotRoot, "PILOT_02_SYNTHETIC_DRY_RUN_V1.json"), "utf8"));
const fixture = JSON.parse(readFileSync(path.join(pilotRoot, "PILOT_01_SYNTHETIC_FIXTURE_V1.json"), "utf8"));

assert.equal(contract.format, "forge-alumdoor-pilot-02-synthetic-dry-run/v1");
assert.equal(contract.synthetic, true);
assert.equal(contract.contains_real_customer_data, false);
assert.equal(contract.production_write_authorized, false);
assert.equal(contract.production_data_mutated, false);
assert.equal(contract.satisfies_real_pilot_01_readiness, false);
assert.equal(contract.satisfies_real_pilot_02_acceptance, false);
assert.equal(contract.execution_surface.production_environment_used, false);
assert.equal(contract.execution_surface.cloudflare_production_secrets_used, false);
assert.equal(contract.execution_surface.production_origin_called, false);
assert.equal(contract.execution_surface.direct_d1_write, false);
assert.equal(contract.execution_surface.deploy_or_migration, false);

assert.equal(fixture.synthetic, true);
assert.equal(fixture.contains_real_customer_data, false);
assert.equal(fixture.production_write_authorized, false);
assert.equal(contract.precondition.required_dataset_count, 12);
assert.equal(Object.keys(fixture.dataset_counts).length, 12);
assert.equal(fixture.coverage.all_12_required_datasets, true);
assert.equal(fixture.coverage.all_six_frozen_personas, true);
assert.equal(fixture.coverage.exactly_one_active_giam_doc, true);
assert.equal(fixture.coverage.zero_unexplained_reconciliation_variance, true);

const expectedSegments = new Set([
  "pilot_01_fixture_handoff",
  "sales_o2c",
  "procurement_p2p",
  "stock_and_fulfillment",
  "manufacturing",
  "finance_settlement",
  "correction_return_negative_paths",
  "warranty_service",
  "idempotency",
]);
const actualSegments = new Set(contract.representative_segments.map((entry) => entry.segment));
assert.deepEqual(actualSegments, expectedSegments);
assert.equal(contract.representative_segments.length, expectedSegments.size);

const requiredEvidenceFiles = [
  "docs/pilot/alumdoor/tools/generate-pilot-01-synthetic-batch.mjs",
  "server/apps/tenant-worker/test/r6-golden-flow.integration.test.mts",
  "server/tests/transaction-closure-sales-o2c.test.mjs",
  "server/tests/o2c.test.mjs",
  "server/tests/procurement-p2p-closure.test.mjs",
  "server/tests/procurement-p2p-correction-boundary.test.mjs",
  "server/tests/manufacturing-transaction-closure.test.mjs",
  "server/tests/alumdoor-manufacturing-lifecycle.test.mjs",
  "server/tests/rc4-kernel-gl-aggregate.test.mjs",
  "server/scripts/rc4-cross-ledger-reconciliation.py",
  "server/tests/maintenance-field-service.test.mjs",
  "server/tests/transaction-closure-warranty-service.test.mjs",
  "server/tests/transaction-closure-warranty-linkage.test.mjs",
  "server/tests/alumdoor-golden-order-readonly.test.mjs",
  ".github/workflows/pilot-02-synthetic-dry-run.yml",
];
for (const relative of requiredEvidenceFiles) {
  assert.ok(existsSync(path.join(repoRoot, relative)), `missing Pilot-02 evidence file: ${relative}`);
}

assert.equal(contract.acceptance.synthetic_preview_pass, true);
assert.equal(contract.acceptance.zero_unexplained_variance, true);
assert.equal(contract.acceptance.canonical_authority_only, true);
assert.equal(contract.acceptance.no_shadow_stock_or_finance, true);
assert.equal(contract.acceptance.no_production_mutation, true);
assert.equal(contract.acceptance.real_pilot_transition_allowed, false);

console.log(`PILOT_02_SYNTHETIC_CONTRACT_PASS segments=${actualSegments.size} production_write_authorized=false real_transition=false`);
