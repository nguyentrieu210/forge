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
  "migrations/tenant/0009_business_suite.sql",
  "packages/clouderp-erpnext/src/enterprise-controllers.ts",
  "packages/clouderp-erpnext/src/enterprise-types.ts",
  "packages/document-kernel/src/d1-store.ts",
  "packages/query/src/index.ts",
  "tests/enterprise-suite.test.mjs",
  "scripts/test-business-suite-migration.py",
  "FEATURE_MATRIX_v1.0.0.md",
  "RELEASE_NOTES_v1.0.0.md",
  "RUNBOOK_BUSINESS_SUITE_RC.md",
];
const missing = [];
for (const file of required) if (!await exists(file)) missing.push(file);
const checks = {
  version: /^1\.0\./.test(String(pkg.version)),
  node_regression_minimum: Number(verify.node_tests_passed ?? 0) >= 109,
  strict_build: verify.typescript_strict_build === true,
  worker_source_typecheck: verify.worker_integration_typecheck === true,
  migrations_0001_0009: verify.tenant_migrations_0001_0009 === true,
  frappe_core: verify.frappe_permission_v2 === true && verify.collaboration_access_enforced === true,
  accounting_stock_suite: verify.erpnext_core_preview === true && verify.financial_statement_views_preview === true,
  business_breadth: verify.production_plan_job_card_preview === true && verify.asset_lifecycle_preview === true && verify.pos_session_preview === true,
  bank_reconciliation: verify.bank_reconciliation_engine === true && verify.bank_reconciliation_commit_guard === true,
  payroll: verify.payroll_core_preview === true && verify.payroll_duplicate_guard === true,
  subscriptions: verify.subscription_schedule_engine === true,
  regional_queue: verify.e_invoice_provider_queue === true && verify.e_invoice_source_uniqueness_guard === true,
  honest_foundations: verify.crm_foundation === true && verify.portal_foundation === true,
  reports: verify.business_suite_reports === true,
  required_artifacts: missing.length === 0,
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({
  ok,
  release: pkg.version,
  maturity: "ERPNext Business Suite RC",
  checks,
  missing,
  scope: "Cloudflare-native ERP business-suite release candidate spanning Frappe Core, selling/buying/accounting/stock, production, assets, projects, quality/support, POS, bounded bank reconciliation, payroll posting, subscription scheduling and provider-safe e-invoice queueing.",
  boundary: "Not drop-in ERPNext/Frappe parity. Python app compatibility, complete statutory packs/certification, full HR lifecycle, customer portal, complete automatic subscription billing, full MRP/subcontracting and consolidated accounting remain outside this artifact.",
  production_note: "Clean Workerd/Vite execution, pinned differential capture, staging/load/security, legal review, rollback and tenant restore evidence remain mandatory before commercial promotion.",
}, null, 2));
if (!ok) process.exit(1);
