#!/usr/bin/env node
/**
 * Exports one tenant D1 database and records an immutable checksum manifest.
 *
 * Usage:
 *   node scripts/backup-tenant.mjs --tenant center
 *   node scripts/backup-tenant.mjs --tenant center --execute
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fail, serverRoot, wrangler } from "./wrangler-cli.mjs";
import { findTenantDatabaseId, removeTenantConfig, writeTenantConfig } from "./tenant-wrangler.mjs";

const args = process.argv.slice(2);
const argOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const tenant = argOf("tenant");
const execute = args.includes("--execute");
if (!tenant || !/^[a-z][a-z0-9-]*$/.test(tenant)) fail("--tenant <id> is required (lowercase, starting with a letter)");

const databaseId = findTenantDatabaseId(tenant, wrangler);
if (!databaseId) fail(`no D1 database named cloudforge-${tenant}`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.resolve(argOf("output-dir") ?? path.join(serverRoot, "backups", tenant));
const sqlPath = path.join(outputDir, `${tenant}-${stamp}.sql`);
const partialPath = `${sqlPath}.partial`;
const manifestPath = `${sqlPath}.json`;

console.log(`tenant    ${tenant}`);
console.log(`database  cloudforge-${tenant} (${databaseId})`);
console.log(`output    ${sqlPath}`);
console.log(`mode      ${execute ? "EXPORT REMOTE" : "dry run"}`);
if (!execute) {
  console.log("\nDry run only. Add --execute to create the export.");
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });
const { configPath, relativeConfig } = writeTenantConfig({ tenant, databaseId });
try {
  wrangler([
    "d1", "export", `cloudforge-${tenant}`,
    "--config", relativeConfig,
    "--remote", "--skip-confirmation", "--output", partialPath,
  ], { capture: false });
  renameSync(partialPath, sqlPath);
} finally {
  removeTenantConfig(configPath);
}

const sha256 = createHash("sha256").update(readFileSync(sqlPath)).digest("hex");
const manifest = {
  format: "forge-d1-backup/v1",
  tenant,
  database_name: `cloudforge-${tenant}`,
  database_id: databaseId,
  created_at: new Date().toISOString(),
  sql_file: path.basename(sqlPath),
  bytes: statSync(sqlPath).size,
  sha256,
  encrypted: false,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`\nbackup ok  ${manifest.bytes} bytes`);
console.log(`sha256    ${sha256}`);
console.log(`manifest  ${manifestPath}`);
console.log("warning   SQL export is plaintext; move it to encrypted off-account storage.");
