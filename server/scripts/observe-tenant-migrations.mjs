#!/usr/bin/env node
/**
 * Observes one tenant's remote D1 migration state without mutating the database.
 *
 * The output binds provider-observed applied filenames to the exact current source
 * SHA-256 of each migration file. Historical D1 bookkeeping stores filenames, not
 * content hashes, so this evidence never claims an applied-time checksum that D1 did
 * not record. Unknown applied filenames or pending expected migrations fail the
 * reconciliation status closed.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { readAppliedMigrationNames } from "./lib/d1-migration-bookkeeping.mjs";
import { findTenantDatabaseId, removeTenantConfig, writeTenantConfig } from "./tenant-wrangler.mjs";
import { d1Query, fail, serverRoot, wrangler } from "./wrangler-cli.mjs";

const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const tenant = valueOf("tenant")?.trim();
const output = valueOf("output")?.trim();
if (!tenant || !/^[a-z][a-z0-9-]*$/.test(tenant)) fail("--tenant <id> is required");

const databaseId = findTenantDatabaseId(tenant, wrangler);
if (!databaseId) fail(`no D1 database named cloudforge-${tenant}`);

const { configPath, relativeConfig } = writeTenantConfig({ tenant, databaseId });
try {
  const database = {
    name: `cloudforge-${tenant}`,
    id: databaseId,
    configArg: relativeConfig,
  };
  const observed = readAppliedMigrationNames({ database, dryRun: true, query: d1Query });
  const migrationDir = path.join(serverRoot, "migrations", "tenant");
  const expected = readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const bytes = readFileSync(path.join(migrationDir, name));
      return {
        name,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
      };
    });
  const sourceByName = new Map(expected.map((entry) => [entry.name, entry]));
  const applied = observed.names.map((name) => ({
    name,
    sha256: sourceByName.get(name)?.sha256 ?? null,
    source_present: sourceByName.has(name),
  }));
  const appliedSet = new Set(observed.names);
  const pending = expected.filter((entry) => !appliedSet.has(entry.name)).map((entry) => entry.name);
  const unknownApplied = applied.filter((entry) => !entry.source_present).map((entry) => entry.name);
  const checksumBound = applied.filter((entry) => entry.sha256 !== null).length;

  const evidence = {
    format: "forge-r6-applied-migration-observation/v1",
    tenant,
    database_name: database.name,
    database_id: databaseId,
    observed_at: new Date().toISOString(),
    migration_dir: "server/migrations/tenant",
    tracking_table_present: observed.trackingTablePresent,
    tracking_table_created: observed.trackingTableCreated,
    expected_count: expected.length,
    applied_count: applied.length,
    checksum_bound_count: checksumBound,
    expected,
    applied,
    pending,
    unknown_applied: unknownApplied,
    reconciled:
      observed.trackingTablePresent &&
      pending.length === 0 &&
      unknownApplied.length === 0 &&
      checksumBound === applied.length,
    checksum_semantics:
      "D1 d1_migrations records filenames only. sha256 values bind each provider-observed filename to the exact source file observed during this certification run; they are not fabricated applied-time hashes.",
    cloudflare_mutated: false,
  };

  if (output) {
    const target = path.resolve(output);
    writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    console.log(`evidence    ${target}`);
  }
  console.log(
    `migration observation ${evidence.reconciled ? "PASS" : "BLOCKED"}: expected=${expected.length} applied=${applied.length} pending=${pending.length} unknown=${unknownApplied.length}`,
  );
  console.log("mutation    NONE");
  if (!evidence.reconciled) process.exitCode = 2;
} finally {
  removeTenantConfig(configPath);
}
