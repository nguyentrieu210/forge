#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pilotRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pilotRoot, "../../..");
const contract = JSON.parse(readFileSync(path.join(pilotRoot, "PILOT_03_SYNTHETIC_PARALLEL_V1.json"), "utf8"));
const p02 = JSON.parse(readFileSync(path.join(pilotRoot, "PILOT_02_STATUS.json"), "utf8"));

assert.equal(contract.format, "forge-alumdoor-pilot-03-synthetic-parallel/v1");
assert.equal(contract.synthetic, true);
assert.equal(contract.contains_real_customer_data, false);
assert.equal(contract.production_write_authorized, false);
assert.equal(contract.production_data_mutated, false);
assert.equal(contract.satisfies_real_pilot_01_readiness, false);
assert.equal(contract.satisfies_real_pilot_03_acceptance, false);
assert.equal(contract.execution_surface.production_environment_used, false);
assert.equal(contract.execution_surface.production_origin_called, false);
assert.equal(contract.execution_surface.cloudflare_production_secrets_used, false);
assert.equal(contract.execution_surface.remote_database_used, false);
assert.equal(contract.execution_surface.deploy_or_migration, false);
assert.equal(contract.parallel_window.business_days, 3);
assert.equal(contract.parallel_window.default_tolerance, 0);
assert.equal(contract.parallel_window.currency, "VND");
assert.equal(contract.parallel_window.currency_scale, 0);
assert.equal(contract.parallel_window.cash_bank_in_scope, true);
assert.equal(contract.daily_source_model.length, 3);
assert.equal(contract.expected_daily_closing.length, 3);
assert.equal(p02.synthetic_pilot_02.status, "SYNTHETIC_DRY_RUN_PASS");
assert.equal(p02.synthetic_pilot_02.segments_passed, 9);

const expectedAxes = new Set([
  "stock_quantity", "stock_value", "ar", "ap", "cash_bank", "revenue", "cogs",
  "manufacturing_progress", "wip_closing_quantity", "gl_debit_credit_balance",
  "document_count_status", "idempotent_payment_retry",
]);
assert.deepEqual(new Set(contract.reconciliation_axes), expectedAxes);

const requiredFiles = [
  ".github/workflows/pilot-03-synthetic-parallel.yml",
  "server/apps/tenant-worker/test/pilot-03-synthetic-parallel.integration.test.mts",
  "server/scripts/rc4-cross-ledger-reconciliation.py",
  "server/scripts/test-finance-ar-reconciliation.py",
  "server/scripts/test-finance-ap-reconciliation.py",
];
for (const relative of requiredFiles) assert.ok(existsSync(path.join(repoRoot, relative)), `missing ${relative}`);

for (const day of contract.expected_daily_closing) {
  assert.equal(Number.isInteger(day.day), true);
  for (const [key, value] of Object.entries(day)) {
    if (key === "day") continue;
    assert.equal(typeof value, "number", `${key} must be numeric`);
    assert.ok(value >= 0, `${key} must be non-negative`);
  }
}

assert.equal(contract.acceptance.all_three_daily_checkpoints_reconciled, true);
assert.equal(contract.acceptance.all_axis_variances_zero, true);
assert.equal(contract.acceptance.gl_balanced_each_day, true);
assert.equal(contract.acceptance.wip_residual_zero_each_day, true);
assert.equal(contract.acceptance.document_state_exact_each_day, true);
assert.equal(contract.acceptance.retry_does_not_duplicate_gl, true);
assert.equal(contract.acceptance.canonical_authority_only, true);
assert.equal(contract.acceptance.no_shadow_stock_or_finance, true);
assert.equal(contract.acceptance.no_production_mutation, true);
assert.equal(contract.acceptance.real_pilot_transition_allowed, false);

console.log("PILOT_03_SYNTHETIC_CONTRACT_PASS days=3 tolerance=0 production_write_authorized=false");
