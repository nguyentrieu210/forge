#!/usr/bin/env node
/**
 * Safely applies pending tenant migrations by tenant id.
 *
 * This wrapper creates the same generated Wrangler config as deploy-tenant.mjs,
 * resolving the D1 id by the cloudforge-<tenant> naming convention. Operators no
 * longer need to copy a generated config path from a deploy refusal and risk using
 * another tenant's binding.
 *
 * Dry-run:
 *   node scripts/migrate-tenant.mjs --tenant alu
 *
 * Live:
 *   node scripts/migrate-tenant.mjs --tenant alu --execute --confirm alu
 */
import { spawnSync } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findTenantDatabaseId,
  findTenantOrigin,
  removeTenantConfig,
  writeTenantConfig,
} from "./tenant-wrangler.mjs";
import { fail, serverRoot, wrangler } from "./wrangler-cli.mjs";

const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const tenant = valueOf("tenant")?.trim();
const execute = args.includes("--execute");
const confirm = valueOf("confirm")?.trim();
const allowDirty = args.includes("--allow-dirty");

if (!tenant) fail("migrate-tenant: --tenant <id> is required");
if (!/^[a-z0-9][a-z0-9-]*$/i.test(tenant)) fail("migrate-tenant: tenant id contains unsafe characters");
if (execute && confirm !== tenant) {
  fail(`refusing remote migration: add --confirm ${tenant}`);
}

if (execute && !allowDirty) {
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: path.resolve(serverRoot, ".."),
    encoding: "utf8",
  });
  if (status.status !== 0) fail("could not inspect git worktree before migration");
  if (status.stdout.trim()) {
    fail("worktree is dirty; commit the verified release or pass --allow-dirty with an explicit risk decision");
  }
}

const databaseId = findTenantDatabaseId(tenant, wrangler);
if (!databaseId) fail(`no D1 database named cloudforge-${tenant}`);
const publicOrigin = findTenantOrigin(tenant, wrangler);
const { configPath, relativeConfig } = writeTenantConfig({
  tenant,
  databaseId,
  ...(publicOrigin ? { publicOrigin } : {}),
});

const migrateScript = fileURLToPath(new URL("./d1-migrate-remote.mjs", import.meta.url));
const migrateArgs = [migrateScript, "--config", relativeConfig, ...(execute ? [] : ["--dry-run"])];

console.log(`tenant    ${tenant}`);
console.log(`database  cloudforge-${tenant} (${databaseId})`);
console.log(`mode      ${execute ? "APPLY REMOTE MIGRATIONS" : "dry run"}`);
console.log(`config    ${relativeConfig}\n`);

try {
  const result = spawnSync(process.execPath, migrateArgs, {
    cwd: serverRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) fail(`migration command failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`migration command exited with code ${result.status ?? "unknown"}`);
} finally {
  removeTenantConfig(configPath);
}

if (execute) {
  console.log(`\n${tenant} migrations applied. Run deploy-tenant.mjs dry-run before the live Worker deployment.`);
} else {
  console.log(`\nDry run completed. After a fresh backup, rerun with --execute --confirm ${tenant}.`);
}
