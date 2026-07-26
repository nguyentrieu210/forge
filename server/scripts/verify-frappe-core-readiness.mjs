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
  "migrations/tenant/0006_frappe_core_beta.sql",
  "packages/frappe-model/src/permission.ts",
  "packages/frappe-model/src/services.ts",
  "packages/frappe-model/src/generic-controller.ts",
  "packages/document-kernel/src/document-list.ts",
  "apps/tenant-worker/test/platform.integration.test.mts",
  "apps/web/src/features/Desk.tsx",
  "tests/permission-v2.test.mjs",
  "FEATURE_MATRIX_v0.7.0.md",
  "RELEASE_NOTES_v0.7.0.md",
  "RUNBOOK_FRAPPE_CORE_BETA.md",
];
const missing = [];
for (const file of required) if (!await exists(file)) missing.push(file);
const checks = {
  version: /^0\.7\./.test(String(pkg.version)),
  node_regression_minimum: Number(verify.node_tests_passed ?? 0) >= 88,
  strict_build: verify.typescript_strict_build === true,
  worker_source_typecheck: verify.worker_integration_typecheck === true,
  migrations_0001_0006: verify.tenant_migrations_0001_0006 === true,
  permission_v2: verify.frappe_permission_v2 === true,
  collaboration_security: verify.collaboration_access_enforced === true,
  import_export: verify.csv_import_apply_and_export === true,
  version_history: verify.document_version_history === true,
  required_artifacts: missing.length === 0,
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({
  ok,
  release: pkg.version,
  maturity: "Frappe Core Beta",
  checks,
  missing,
  scope: "Metadata document runtime with document-scoped permissions, collaboration, versioning and bounded import/export; not full Frappe or ERPNext parity.",
  production_note: "Workerd, Vite production build, R2 attachment smoke, load/security tests and staging evidence remain mandatory before external production use of beta features.",
}, null, 2));
if (!ok) process.exit(1);
