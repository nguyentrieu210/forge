import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const exists = async (file) => { try { await stat(path.join(root, file)); return true; } catch { return false; } };
const pkg = await readJson("package.json");
const verify = await readJson("VERIFY.json");
const required = [
  "migrations/tenant/0007_erpnext_core.sql",
  "packages/clouderp-stock/src/valuation.ts",
  "packages/clouderp-stock/src/tracking.ts",
  "packages/clouderp-stock/src/controllers.ts",
  "packages/clouderp-pricing/src/index.ts",
  "packages/clouderp-erpnext/src/controllers.ts",
  "packages/clouderp-erpnext/src/registry.ts",
  "tests/erpnext-core.test.mjs",
  "FEATURE_MATRIX_v0.8.0.md",
  "RELEASE_NOTES_v0.8.0.md",
  "RUNBOOK_ERPNEXT_CORE_PREVIEW.md",
];
const missing = [];
for (const file of required) if (!await exists(file)) missing.push(file);
const checks = {
  version: /^0\.8\./.test(String(pkg.version)),
  node_regression_minimum: Number(verify.node_tests_passed ?? 0) >= 97,
  strict_build: verify.typescript_strict_build === true,
  worker_source_typecheck: verify.worker_integration_typecheck === true,
  migrations_0001_0007: verify.tenant_migrations_0001_0007 === true,
  frappe_core_beta_regression: verify.frappe_permission_v2 === true && verify.collaboration_access_enforced === true,
  fifo_moving_average: verify.fifo_moving_average_valuation === true,
  valuation_repost: verify.repost_valuation_preview === true,
  serial_batch: verify.serial_batch_traceability === true && verify.reversible_bundle_usage === true,
  returns: verify.returns_preview === true,
  pricing: verify.server_pricing_rules === true,
  manufacturing: verify.manufacturing_preview === true,
  assets: verify.assets_depreciation_preview === true,
  reports: verify.erpnext_core_reports === true,
  period_lock: verify.period_lock_all_posting_controllers === true,
  static_permissions: verify.erpnext_core_static_permissions === true,
  required_artifacts: missing.length === 0,
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({
  ok,
  release: pkg.version,
  maturity: "ERPNext Core Preview",
  checks,
  missing,
  scope: "Cloudflare-native ERP core preview with server-valued stock, serial/batch traceability, bounded repost adjustment, returns, pricing, BOM/Work Order manufacture and asset depreciation; not full ERPNext parity.",
  production_note: "Clean Workerd/Vite execution, pinned ERPNext differential capture, staging, reconciliation, load/security, rollback and tenant restore evidence remain mandatory before commercial promotion of the new v0.8 modules.",
}, null, 2));
if (!ok) process.exit(1);
