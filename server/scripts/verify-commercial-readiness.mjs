import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const requirePromotion = process.argv.includes("--require-promotion");
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const exists = async (file) => { try { await stat(path.join(root, file)); return true; } catch { return false; } };

const pkg = await readJson("package.json");
const verify = await readJson("VERIFY.json");
const required = [
  "migrations/tenant/0003_commercial_accounting.sql",
  "packages/document-kernel/src/reconciliation.ts",
  "COMMERCIAL_RELEASE_GATE.md",
  "RUNBOOK_COMMERCIAL.md",
  "PROMOTION_EVIDENCE.example.json",
  "COMMERCIAL_COMPATIBILITY.md",
  "scripts/test-commercial-migration.py",
];
const missing = [];
for (const file of required) if (!await exists(file)) missing.push(file);

const codeChecks = {
  commercial_version: /^(?:0\.(?:[5-9]|[1-9][0-9]+)|[1-9][0-9]*\.[0-9]+)\./.test(String(pkg.version)),
  node_regression_minimum: Number(verify.node_tests_passed ?? 0) >= 80,
  strict_build: verify.typescript_strict_build === true,
  worker_typecheck: verify.worker_integration_typecheck === true,
  web_typecheck: verify.web_typescript_typecheck === true,
  sql_guards: verify.sqlite_schema_and_invariant_validation === true,
  fixed_point: verify.fixed_point_ledgers === true,
  required_artifacts: missing.length === 0,
};
const codeReady = Object.values(codeChecks).every(Boolean);

let promotionEvidence = null;
try { promotionEvidence = await readJson("PROMOTION_EVIDENCE.json"); } catch {}
const promotionCheckNames = [
  "clean_linux_install", "check_full_pass", "workerd_pass", "web_build_pass",
  "migration_dry_run_pass", "reconciliation_ok", "staging_smoke_pass",
  "rollback_drill_pass", "backup_restore_drill_pass", "erpnext_oracle_pass",
  "load_security_pass", "tenant_isolation_pass", "regional_scope_review",
];
const promotionChecks = promotionEvidence ? {
  version_matches: promotionEvidence.version === pkg.version,
  release_sha256_present: /^[a-f0-9]{64}$/i.test(String(promotionEvidence.release_sha256 ?? "")),
  environment_named: typeof promotionEvidence.environment === "string" && promotionEvidence.environment.length > 0,
  ...Object.fromEntries(promotionCheckNames.map((name) => {
    const record = promotionEvidence.checks?.[name];
    return [name, record?.passed === true && typeof record?.evidence === "string" && record.evidence.trim().length > 0];
  })),
} : { evidence_present: false };
const promotionReady = codeReady && Object.values(promotionChecks).every(Boolean);

const output = {
  ok: requirePromotion ? promotionReady : codeReady,
  release: pkg.version,
  code_ready: codeReady,
  promotion_ready: promotionReady,
  code_checks: codeChecks,
  promotion_checks: promotionChecks,
  missing,
  scope: "Production promotion gate for the exact v1.0 ERPNext Business Suite RC artifact; every promoted module remains bounded by COMMERCIAL_COMPATIBILITY.md and country-specific review.",
};
console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exit(1);
