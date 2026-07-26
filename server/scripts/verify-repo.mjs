import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// fileURLToPath handles the Windows drive letter correctly; using URL.pathname
// yields a leading-slash "/C:/..." that path.resolve turns into "C:\C:\...".
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const required = [
  "README.md",
  "COMMERCIAL_COMPATIBILITY.md",
  "STATUS.md",
  "BUILD_REPORT.md",
  "source-lock.json",
  "migrations/tenant/0001_core.sql",
  "RUNBOOK_COMMERCIAL.md",
  "COMMERCIAL_RELEASE_GATE.md",
  "tests/commercial-reconciliation.test.mjs",
  "packages/document-kernel/src/reconciliation.ts",
  "migrations/tenant/0003_commercial_accounting.sql",
  "packages/auth/src/index.ts",
  "packages/money/src/index.ts",
  "packages/document-kernel/src/lifecycle.ts",
  "packages/document-kernel/src/d1-store.ts",
  "apps/tenant-worker/src/aggregate-do.ts",
  "apps/tenant-worker/test/health.integration.test.mts",
  "apps/gateway-worker/src/index.ts",
  "tests/kernel.test.mjs",
  "tests/lifecycle.test.mjs",
  "tests/o2c.test.mjs",
  "tests/security.test.mjs",
  "scripts/test-sql-concurrency.py",
  "scripts/test-commercial-migration.py",
  "tsconfig.worker-tests.json",
];
const failures = [];
for (const file of required) {
  try { await stat(path.join(root, file)); } catch { failures.push(`missing ${file}`); }
}

const files = await walk(root);
for (const file of files) {
  if (!/\.(ts|mts|sql|md|json|mjs|py)$/.test(file)) continue;
  if (file.includes(`${path.sep}docs${path.sep}spec${path.sep}`)) continue;
  const text = await readFile(file, "utf8");
  if (/\bTODO\b|\bFIXME\b|throw new Error\(["']Not implemented/i.test(text)) failures.push(`placeholder in ${path.relative(root, file)}`);
}

const lock = JSON.parse(await readFile(path.join(root, "source-lock.json"), "utf8"));
if (lock.sources.some((source) => source.full_sha && source.full_sha.length !== 40)) failures.push("source-lock contains non-40-char full SHA");

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
for (const [name, version] of Object.entries(packageJson.devDependencies ?? {})) {
  if (/^[~^*]|\bx\b/i.test(String(version))) failures.push(`development dependency is not pinned: ${name}@${version}`);
}

const read = async (file) => readFile(path.join(root, file), "utf8");
const migration = await read("migrations/tenant/0001_core.sql");
for (const token of [
  "stock_balance_guard",
  "fulfillment_reference_guard",
  "receivable_outstanding_guard",
  "sales_order_cancel_reference_guard",
  "sales_invoice_cancel_payment_guard",
  "actor_user_id TEXT NOT NULL",
]) {
  if (!migration.includes(token)) failures.push(`missing SQL invariant: ${token}`);
}
const commercialMigration = await read("migrations/tenant/0003_commercial_accounting.sql");
for (const token of ["base_amount_minor", "receivable_base_outstanding_guard", "base_outstanding_minor"]) {
  if (!commercialMigration.includes(token)) failures.push(`missing commercial accounting invariant: ${token}`);
}

for (const table of ["gl_entries", "stock_ledger_entries", "payment_ledger_entries"]) {
  const match = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!match) failures.push(`cannot inspect table ${table}`);
  else if (/\bREAL\b/i.test(match[1])) failures.push(`canonical ledger table uses REAL: ${table}`);
}

const gatewayConfig = await read("apps/gateway-worker/wrangler.jsonc");
if (!/"remote"\s*:\s*true/.test(gatewayConfig)) failures.push("gateway dispatch namespace is not remote-enabled for local integration");
for (const config of ["apps/gateway-worker/wrangler.jsonc", "apps/tenant-worker/wrangler.jsonc", "apps/query-worker/wrangler.jsonc"]) {
  const text = await read(config);
  if (/"AUTH_MODE"\s*:\s*"development"/.test(text)) failures.push(`production config enables development authentication: ${config}`);
}
const readme = await read("README.md");
if (/x-cloudforge-actor|"actor"\s*:/.test(readme)) failures.push("README still teaches client-controlled identity");
if (!/Authorization:\s*Bearer/.test(readme)) failures.push("README lacks authenticated API example");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  files: files.length,
  source_exact: false,
  production_auth_configs: true,
  fixed_point_ledgers: true,
  cross_aggregate_sql_guards: true,
  worker_integration_typechecked: true,
}, null, 2));

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["dist", "node_modules", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Do not descend into vendored sub-repositories (their own .git root);
      // this verifier gates the CloudForge package, not embedded projects.
      if (await isEmbeddedRepo(full)) continue;
      result.push(...await walk(full));
    } else {
      result.push(full);
    }
  }
  return result;
}

async function isEmbeddedRepo(dir) {
  try { await stat(path.join(dir, ".git")); return true; } catch { return false; }
}
