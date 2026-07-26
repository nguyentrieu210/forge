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
  "migrations/tenant/0008_erpnext_breadth.sql",
  "packages/clouderp-erpnext/src/suite-controllers.ts",
  "packages/clouderp-erpnext/src/registry.ts",
  "packages/document-kernel/src/d1-store.ts",
  "packages/query/src/index.ts",
  "tests/erpnext-breadth.test.mjs",
  "FEATURE_MATRIX_v0.9.0.md",
  "RELEASE_NOTES_v0.9.0.md",
  "RUNBOOK_ERPNEXT_SUITE_BETA.md",
];
const missing = [];
for (const file of required) if (!await exists(file)) missing.push(file);
const checks = {
  version: /^0\.9\./.test(String(pkg.version)),
  node_regression_minimum: Number(verify.node_tests_passed ?? 0) >= 104,
  strict_build: verify.typescript_strict_build === true,
  worker_source_typecheck: verify.worker_integration_typecheck === true,
  migrations_0001_0008: verify.tenant_migrations_0001_0008 === true,
  frappe_core: verify.frappe_permission_v2 === true && verify.collaboration_access_enforced === true,
  accounting_stock_core: verify.erpnext_core_preview === true && verify.fifo_moving_average_valuation === true,
  production_execution: verify.production_plan_job_card_preview === true && verify.job_card_commit_guard === true,
  asset_lifecycle: verify.asset_lifecycle_preview === true,
  projects: verify.projects_timesheet_profitability_preview === true,
  quality_support: verify.quality_inspection_preview === true && verify.support_sla_preview === true,
  expense_claim: verify.expense_claim_preview === true,
  pos: verify.pos_session_preview === true && verify.pos_session_commit_guards === true,
  reports: verify.erpnext_breadth_reports === true && verify.financial_statement_views_preview === true,
  honest_foundations: verify.bank_reconciliation_foundation === true && verify.regional_integration_foundation === true,
  required_artifacts: missing.length === 0,
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({
  ok,
  release: pkg.version,
  maturity: "ERPNext Suite Beta",
  checks,
  missing,
  scope: "Cloudflare-native ERP suite beta spanning Frappe Core, O2C/P2P/accounting/stock, valuation/tracking/returns/pricing, production execution, asset lifecycle, project time, quality inspection, support SLA, expense claims and cash POS. It is not full ERPNext parity.",
  production_note: "Clean Workerd/Vite execution, pinned ERPNext differential capture for all new modules, staging/load/security, country-specific statutory certification, rollback and tenant restore evidence remain mandatory before commercial promotion.",
}, null, 2));
if (!ok) process.exit(1);
