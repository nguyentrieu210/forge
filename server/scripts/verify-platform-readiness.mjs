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
  "migrations/tenant/0004_frappe_platform.sql",
  "migrations/tenant/0005_erp_core.sql",
  "packages/frappe-model/src/generic-controller.ts",
  "packages/frappe-model/src/permission.ts",
  "packages/frappe-model/src/services.ts",
  "packages/clouderp-core/src/controllers.ts",
  "apps/web/src/features/Desk.tsx",
  "tests/frappe-platform.test.mjs",
  "tests/erp-core.test.mjs",
  "FEATURE_MATRIX_v0.6.0.md",
  "RELEASE_NOTES_v0.6.0.md",
];
const missing = [];
for (const file of required) if (!await exists(file)) missing.push(file);

const checks = {
  platform_version: /^0\.6\./.test(String(pkg.version)),
  node_regression_minimum: Number(verify.node_tests_passed ?? 0) >= 80,
  strict_build: verify.typescript_strict_build === true,
  worker_typecheck: verify.worker_integration_typecheck === true,
  sql_guards: verify.sqlite_schema_and_invariant_validation === true,
  migrations_0001_0005: verify.tenant_migrations_0001_0005 === true,
  metadata_runtime: verify.frappe_minimum_platform === true,
  erp_core_preview: verify.erp_core_preview === true,
  required_artifacts: missing.length === 0,
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({
  ok,
  release: pkg.version,
  maturity: "ERP Platform Alpha",
  checks,
  missing,
  scope: "Metadata-driven document foundation plus O2C, P2P, Journal Entry and Stock Entry preview; not full Frappe or ERPNext parity",
  production_note: "Only the previously documented O2C Limited GA subset may enter the commercial promotion process. New v0.6 platform/core modules remain preview until separate oracle, Workerd, migration, load and staging gates pass."
}, null, 2));
if (!ok) process.exit(1);
