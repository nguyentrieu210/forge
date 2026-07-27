#!/usr/bin/env node
/**
 * Restores a backup into a NEW drill database and verifies it without touching routes.
 * Production database names are rejected by construction.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { d1Query, fail, serverRoot, wrangler } from "./wrangler-cli.mjs";
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

if (!tenant || !/^[a-z][a-z0-9-]*$/.test(tenant)) fail("--tenant <id> is required");
if (!target || !/^cloudforge-(?:drill|restore)-[a-z0-9-]+$/.test(target)) {
  fail("--target must start with cloudforge-drill- or cloudforge-restore-");
}
if (target === `cloudforge-${tenant}`) fail("the live tenant database can never be a restore-drill target");
if (!input) fail("--file <backup.sql> is required");
const sqlPath = path.resolve(serverRoot, input);
if (!existsSync(sqlPath) || !statSync(sqlPath).isFile()) fail(`backup file not found: ${sqlPath}`);

const databases = JSON.parse(wrangler(["d1", "list", "--json"]));
const database = databases.find((entry) => entry.name === target);
if (!database?.uuid) fail(`target D1 ${target} does not exist; create a new empty database first`);

const actualHash = createHash("sha256").update(readFileSync(sqlPath)).digest("hex");
const backupManifestPath = `${sqlPath}.json`;
if (existsSync(backupManifestPath)) {
  const manifest = JSON.parse(readFileSync(backupManifestPath, "utf8"));
  if (manifest.tenant !== tenant) fail(`backup belongs to tenant ${manifest.tenant}, not ${tenant}`);
  if (manifest.sha256 !== actualHash) fail("backup checksum does not match its manifest");
}

console.log(`source    ${sqlPath}`);
console.log(`sha256    ${actualHash}`);
console.log(`target    ${target} (${database.uuid})`);
console.log(`mode      ${execute ? "RESTORE DRILL" : "dry run"}`);
if (!execute) {
  console.log(`\nDry run only. To restore, add --execute --confirm ${target}`);
  process.exit(0);
}
if (confirm !== target) fail(`refusing restore: pass --confirm ${target}`);

const { configPath, relativeConfig } = writeTenantConfig({ tenant: `drill-${tenant}`, databaseId: database.uuid, databaseName: target });
try {
  const binding = { name: target, id: database.uuid, configArg: relativeConfig };
  const existing = d1Query(binding, `SELECT COUNT(*) AS total FROM sqlite_schema
    WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`)[0];
  if (Number(existing?.total ?? 0) !== 0) fail(`target ${target} is not empty; create a fresh drill database`);

  wrangler(["d1", "execute", target, "--config", relativeConfig, "--remote", "--file", sqlPath], { capture: false });
  const integrity = d1Query(binding, "PRAGMA quick_check");
  const tables = d1Query(binding, `SELECT COUNT(*) AS total FROM sqlite_schema
    WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`)[0];
  const evidence = {
    format: "forge-restore-drill/v1",
    tenant,
    source_file: path.basename(sqlPath),
    source_sha256: actualHash,
    target_database_name: target,
    target_database_id: database.uuid,
    restored_at: new Date().toISOString(),
    table_count: Number(tables?.total ?? 0),
    integrity,
    routes_changed: false,
  };
  const evidencePath = `${sqlPath}.${target}.restore.json`;
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`\nrestore drill ok  ${evidence.table_count} application tables`);
  console.log(`evidence          ${evidencePath}`);
  console.log("routes            unchanged");
} finally {
  removeTenantConfig(configPath);
}
