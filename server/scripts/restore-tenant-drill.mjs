#!/usr/bin/env node
/**
 * Restores a backup into a NEW drill database and verifies it without touching routes.
 * Production database names are rejected by construction.
 */
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { rewriteOversizedInstalledAppRows } from "./lib/d1-backup-import.mjs";
import {
  assertRestoreVerification,
  inspectTenantBackup,
} from "./lib/tenant-backup-verification.mjs";
import { d1Query, fail, quote, serverRoot, wrangler } from "./wrangler-cli.mjs";
import { removeTenantConfig, writeTenantConfig } from "./tenant-wrangler.mjs";

const args = process.argv.slice(2);
const argOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const tenant = argOf("tenant");
const target = argOf("target");
const input = argOf("file");
const execute = args.includes("--execute");
const confirm = argOf("confirm");
const allowUnmanifested = args.includes("--allow-unmanifested");

if (!tenant || !/^[a-z][a-z0-9-]*$/.test(tenant)) fail("--tenant <id> is required");
if (!target || !/^cloudforge-(?:drill|restore)-[a-z0-9-]+$/.test(target)) {
  fail("--target must start with cloudforge-drill- or cloudforge-restore-");
}
if (target === `cloudforge-${tenant}`) fail("the live tenant database can never be a restore-drill target");
if (!input) fail("--file <backup.sql> is required");
const sqlPath = path.resolve(serverRoot, input);
if (!existsSync(sqlPath) || !statSync(sqlPath).isFile()) fail(`backup file not found: ${sqlPath}`);

let inspected;
try {
  inspected = inspectTenantBackup({ sqlPath, tenant, allowUnmanifested });
} catch (error) {
  fail(error.message);
}
const importPlan = rewriteOversizedInstalledAppRows(readFileSync(sqlPath, "utf8"));

const databases = JSON.parse(wrangler(["d1", "list", "--json"]));
const database = databases.find((entry) => entry.name === target);
if (!database?.uuid) fail(`target D1 ${target} does not exist; create a new empty database first`);

console.log(`source    ${sqlPath}`);
console.log(`sha256    ${inspected.sha256}`);
console.log(`manifest  ${inspected.manifestVerified ? "verified" : "legacy override"}`);
console.log(`target    ${target} (${database.uuid})`);
console.log(`mode      ${execute ? "RESTORE DRILL" : "dry run"}`);
if (importPlan.rewrittenRows > 0) {
  console.log(
    `D1 import ${importPlan.rewrittenRows} oversized app row -> ${importPlan.generatedStatements} safe statements (max ${importPlan.maxGeneratedStatementBytes} bytes)`,
  );
}
if (!execute) {
  console.log(`\nDry run only. To restore, add --execute --confirm ${target}`);
  process.exit(0);
}
if (confirm !== target) fail(`refusing restore: pass --confirm ${target}`);

const { configPath, relativeConfig } = writeTenantConfig({
  tenant: `drill-${tenant}`,
  databaseId: database.uuid,
  databaseName: target,
});
const importPath = importPlan.rewrittenRows > 0 ? `${sqlPath}.d1-safe-${process.pid}.sql` : sqlPath;
try {
  if (importPath !== sqlPath) writeFileSync(importPath, importPlan.sql, { encoding: "utf8", flag: "wx" });
  const binding = { name: target, id: database.uuid, configArg: relativeConfig };
  const existing = d1Query(
    binding,
    `SELECT COUNT(*) AS total FROM sqlite_schema
      WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`,
  )[0];
  if (Number(existing?.total ?? 0) !== 0) fail(`target ${target} is not empty; create a fresh drill database`);

  const startedAt = performance.now();
  wrangler(
    ["d1", "execute", target, "--config", relativeConfig, "--remote", "--file", importPath],
    { capture: false },
  );
  const integrity = d1Query(binding, "PRAGMA quick_check");
  const foreignKeys = d1Query(binding, "PRAGMA foreign_key_check");
  const tables = d1Query(
    binding,
    `SELECT COUNT(*) AS total FROM sqlite_schema
      WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`,
  )[0];
  const tableCount = Number(tables?.total ?? 0);
  try {
    assertRestoreVerification({
      quickCheckRows: integrity,
      foreignKeyRows: foreignKeys,
      tableCount,
    });
  } catch (error) {
    fail(error.message);
  }

  const coreTables = d1Query(
    binding,
    `SELECT name FROM sqlite_schema
      WHERE type='table' AND name IN ('documents','doctype_definitions','installed_apps','d1_migrations')`,
  );
  const present = new Set(coreTables.map((row) => row.name));
  const tenantScopeViolations = {};
  for (const table of ["documents", "doctype_definitions", "installed_apps"]) {
    if (!present.has(table)) continue;
    const columns = d1Query(binding, `PRAGMA table_info("${table}")`);
    if (!columns.some((column) => column.name === "tenant_id")) continue;
    const row = d1Query(
      binding,
      `SELECT COUNT(*) AS total FROM "${table}" WHERE tenant_id IS NULL OR tenant_id <> '${quote(tenant)}'`,
    )[0];
    tenantScopeViolations[table] = Number(row?.total ?? 0);
  }
  const leaked = Object.entries(tenantScopeViolations).filter(([, count]) => count !== 0);
  if (leaked.length > 0) {
    fail(
      `restore drill contains cross-tenant core rows: ${leaked
        .map(([table, count]) => `${table}=${count}`)
        .join(", ")}`,
    );
  }

  const migrationCount = present.has("d1_migrations")
    ? Number(d1Query(binding, "SELECT COUNT(*) AS total FROM d1_migrations")[0]?.total ?? 0)
    : 0;
  const durationMs = Math.round(performance.now() - startedAt);
  const evidence = {
    format: "forge-restore-drill/v1",
    tenant,
    source_file: path.basename(sqlPath),
    source_sha256: inspected.sha256,
    source_bytes: inspected.bytes,
    backup_manifest_verified: inspected.manifestVerified,
    source_created_at: inspected.manifest?.created_at ?? null,
    target_database_name: target,
    target_database_id: database.uuid,
    restored_at: new Date().toISOString(),
    restore_duration_ms: durationMs,
    table_count: tableCount,
    migration_count: migrationCount,
    integrity,
    foreign_key_violations: 0,
    tenant_scope_violations: tenantScopeViolations,
    import_rewrites: {
      oversized_installed_app_rows: importPlan.rewrittenRows,
      generated_statements: importPlan.generatedStatements,
      max_statement_bytes: importPlan.maxGeneratedStatementBytes,
    },
    routes_changed: false,
  };
  const evidencePath = `${sqlPath}.${target}.restore.json`;
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`\nrestore drill ok  ${evidence.table_count} application tables`);
  console.log(`migrations        ${evidence.migration_count}`);
  console.log(`duration          ${durationMs} ms`);
  console.log(`evidence          ${evidencePath}`);
  console.log("routes            unchanged");
} finally {
  if (importPath !== sqlPath && existsSync(importPath)) unlinkSync(importPath);
  removeTenantConfig(configPath);
}
