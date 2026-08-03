#!/usr/bin/env node
/**
 * Verifies a tenant D1 SQL backup without touching Cloudflare.
 *
 * The verifier checks the immutable backup manifest, replays the export into an
 * isolated temporary SQLite database, then fails closed on structural integrity,
 * foreign-key, or cross-tenant core-table violations.
 *
 * `doctype_definitions` is the one deliberate exception to single-tenant rows:
 * migrations keep two reserved provisioning catalog namespaces in every tenant DB.
 * `demo` is the legacy seed catalog and `__standard__` is the canonical standard
 * catalog copied from it. They are metadata only; runtime tenant reads are exact-
 * tenant scoped. Any other foreign tenant id still fails closed.
 *
 * Usage:
 *   node scripts/verify-tenant-backup.mjs --tenant alu --file backups/alu/alu-....sql
 *   node scripts/verify-tenant-backup.mjs --tenant alu --file ... --output /tmp/alu-backup-verify.json
 *   node scripts/verify-tenant-backup.mjs --tenant alu --file ... --allow-unmanifested
 */
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { rewriteOversizedInstalledAppRows } from "./lib/d1-backup-import.mjs";
import {
  assertRestoreVerification,
  inspectTenantBackup,
} from "./lib/tenant-backup-verification.mjs";

const RESERVED_METADATA_TENANTS = ["demo", "__standard__"];

const args = process.argv.slice(2);
const argOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const tenant = argOf("tenant")?.trim();
const input = argOf("file");
const output = argOf("output");
const allowUnmanifested = args.includes("--allow-unmanifested");

if (!tenant || !/^[a-z][a-z0-9-]*$/.test(tenant)) throw new Error("--tenant <id> is required");
if (!input) throw new Error("--file <backup.sql> is required");

const inspected = inspectTenantBackup({ sqlPath: input, tenant, allowUnmanifested });
const importPlan = rewriteOversizedInstalledAppRows(readFileSync(inspected.sqlPath, "utf8"));
const startedAt = performance.now();
const tempDir = mkdtempSync(path.join(os.tmpdir(), "forge-backup-verify-"));
const dbPath = path.join(tempDir, "restore.sqlite");
let database;
try {
  database = new DatabaseSync(dbPath);
  database.exec(importPlan.sql);

  const quickCheckRows = database.prepare("PRAGMA quick_check").all();
  const foreignKeyRows = database.prepare("PRAGMA foreign_key_check").all();
  const tableCount = Number(
    database
      .prepare(`SELECT COUNT(*) AS total FROM sqlite_schema
        WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`)
      .get()?.total ?? 0,
  );
  assertRestoreVerification({ quickCheckRows, foreignKeyRows, tableCount });

  const migrationTable =
    Number(
      database
        .prepare(`SELECT COUNT(*) AS total FROM sqlite_schema
          WHERE type='table' AND name='d1_migrations'`)
        .get()?.total ?? 0,
    ) > 0;
  const migrationCount = migrationTable
    ? Number(database.prepare("SELECT COUNT(*) AS total FROM d1_migrations").get()?.total ?? 0)
    : 0;

  const tenantScopeViolations = {};
  const metadataCatalogRows = {};
  for (const table of ["documents", "doctype_definitions", "installed_apps"]) {
    const exists =
      Number(
        database
          .prepare("SELECT COUNT(*) AS total FROM sqlite_schema WHERE type='table' AND name=?")
          .get(table)?.total ?? 0,
      ) > 0;
    if (!exists) continue;
    const columns = database.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all();
    if (!columns.some((column) => column.name === "tenant_id")) continue;

    if (table === "doctype_definitions") {
      const row = database
        .prepare(`SELECT COUNT(*) AS total FROM "${table}"
          WHERE tenant_id IS NULL
             OR (tenant_id <> ? AND tenant_id NOT IN (?, ?))`)
        .get(tenant, ...RESERVED_METADATA_TENANTS);
      tenantScopeViolations[table] = Number(row?.total ?? 0);

      const catalogRows = database
        .prepare(`SELECT tenant_id, COUNT(*) AS total FROM "${table}"
          WHERE tenant_id IN (?, ?)
          GROUP BY tenant_id ORDER BY tenant_id`)
        .all(...RESERVED_METADATA_TENANTS);
      for (const catalog of catalogRows) {
        metadataCatalogRows[String(catalog.tenant_id)] = Number(catalog.total ?? 0);
      }
      continue;
    }

    const row = database
      .prepare(`SELECT COUNT(*) AS total FROM "${table}" WHERE tenant_id IS NULL OR tenant_id <> ?`)
      .get(tenant);
    tenantScopeViolations[table] = Number(row?.total ?? 0);
  }
  const leaked = Object.entries(tenantScopeViolations).filter(([, count]) => count !== 0);
  if (leaked.length > 0) {
    throw new Error(
      `restored backup contains cross-tenant core rows: ${leaked
        .map(([table, count]) => `${table}=${count}`)
        .join(", ")}`,
    );
  }

  const durationMs = Math.round(performance.now() - startedAt);
  const evidence = {
    format: "forge-backup-verification/v1",
    tenant,
    source_file: path.basename(inspected.sqlPath),
    source_sha256: inspected.sha256,
    source_bytes: inspected.bytes,
    manifest_verified: inspected.manifestVerified,
    source_created_at: inspected.manifest?.created_at ?? null,
    source_database_name: inspected.manifest?.database_name ?? null,
    verified_at: new Date().toISOString(),
    local_restore_duration_ms: durationMs,
    table_count: tableCount,
    migration_count: migrationCount,
    quick_check: "ok",
    foreign_key_violations: 0,
    tenant_scope_violations: tenantScopeViolations,
    metadata_catalog_rows: metadataCatalogRows,
    import_rewrites: {
      oversized_installed_app_rows: importPlan.rewrittenRows,
      generated_statements: importPlan.generatedStatements,
      max_statement_bytes: importPlan.maxGeneratedStatementBytes,
    },
    cloudflare_mutated: false,
  };

  if (output) {
    const outputPath = path.resolve(output);
    writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    console.log(`evidence  ${outputPath}`);
  }
  console.log(
    `backup ok  tenant=${tenant} tables=${tableCount} migrations=${migrationCount} restore_ms=${durationMs}`,
  );
  console.log(`sha256     ${inspected.sha256}`);
  console.log(`manifest   ${inspected.manifestVerified ? "verified" : "legacy override"}`);
} finally {
  try {
    database?.close();
  } catch {}
  rmSync(tempDir, { recursive: true, force: true });
}