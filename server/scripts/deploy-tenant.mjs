#!/usr/bin/env node
/**
 * Redeploys an EXISTING tenant's Worker with the current platform code.
 *
 *   node scripts/deploy-tenant.mjs --tenant hrm [--namespace cloudforge-production]
 *   node scripts/deploy-tenant.mjs --all
 *
 * Separate from `provision-tenant.mjs`, which also runs migrations, rotates secrets and
 * reissues the administrator password. Rolling out a platform change does not want any of
 * that — reissuing the password on every deploy would log the customer out for a code
 * change they did not ask about.
 *
 * The D1 id is looked up by convention rather than passed, because passing it is where
 * the tenant-binding mistake comes from: `--name cloudforge-tenant-hrm` with the demo
 * config deploys hrm's Worker bound to demo's DATABASE, and it then accepts demo's
 * passwords on hrm's hostname. That is not a theoretical risk; it happened.
 */
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fail, wrangler } from "./wrangler-cli.mjs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { meaningfulGitStatus } from "./git-worktree.mjs";
import { findTenantDatabaseId, findTenantOrigin, removeTenantConfig, tenantScriptName, writeTenantConfig } from "./tenant-wrangler.mjs";
import { d1BindingOf, d1Query, serverRoot } from "./wrangler-cli.mjs";

/**
 * Migrations a tenant is missing.
 *
 * Checked BEFORE the code goes out, because the reverse order took a live tenant down:
 * the platform gained login rate limiting, whose table arrives in migration 0018, and a
 * tenant provisioned at 0017 answered every login with `500 Internal error`. The code was
 * correct and the database was correct; only the ORDER was wrong.
 *
 * Reported as a refusal rather than auto-applied — a schema change on a customer's data is
 * not something a deploy command should do without being asked.
 */
function pendingMigrations(configPath) {
  const files = readdirSync(path.join(serverRoot, "migrations", "tenant"))
    .filter((name) => name.endsWith(".sql")).sort();
  let applied;
  try {
    applied = new Set(d1Query(d1BindingOf(configPath), "SELECT name FROM d1_migrations").map((row) => row.name));
  } catch {
    // No bookkeeping table at all means nothing has ever been applied here.
    return files;
  }
  return files.filter((name) => !applied.has(name));
}

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const namespace = argOf("namespace", "cloudforge-production");
const all = args.includes("--all");
const single = argOf("tenant");
const execute = args.includes("--execute");
const confirm = argOf("confirm");
const allowDirty = args.includes("--allow-dirty");
if (!all && !single) fail("--tenant <id> or --all is required");
if (all && single) fail("choose --tenant <id> or --all, not both");
if (execute && confirm !== (all ? "ALL" : single)) {
  fail(`refusing live deployment: add --confirm ${all ? "ALL" : single}`);
}

if (execute && !allowDirty) {
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  if (status.status !== 0) fail("could not inspect git worktree before deployment");
  if (meaningfulGitStatus(status.stdout)) {
    fail("worktree is dirty; commit the verified release or pass --allow-dirty with an explicit risk decision");
  }
}

const databases = JSON.parse(wrangler(["d1", "list", "--json"]));
const tenants = all
  ? databases.filter((entry) => /^cloudforge-(?!control$|jobs$)/.test(entry.name)).map((entry) => entry.name.replace(/^cloudforge-/, ""))
  : [single];

let failures = 0;
console.log(`mode      ${execute ? "LIVE DEPLOY" : "dry-run compile"}`);
console.log(`namespace ${namespace}`);
console.log(`tenants   ${tenants.length}\n`);
for (const tenant of tenants) {
  const databaseId = findTenantDatabaseId(tenant, wrangler);
  if (!databaseId) { console.log(`${tenant.padEnd(12)} SKIP  no D1 database named cloudforge-${tenant}`); failures += 1; continue; }
  const publicOrigin = findTenantOrigin(tenant, wrangler);
  const { configPath, relativeConfig } = writeTenantConfig({ tenant, databaseId, ...(publicOrigin ? { publicOrigin } : {}) });
  const behind = execute ? pendingMigrations(configPath) : [];
  if (behind.length) {
    removeTenantConfig(configPath);
    console.log(`${tenant.padEnd(12)} REFUSED  ${behind.length} migration(s) not applied: ${behind.join(", ")}`);
    console.log(`${" ".repeat(12)}          run first: node scripts/migrate-tenant.mjs --tenant ${tenant}`);
    console.log(`${" ".repeat(12)}          deploying code ahead of its schema is how login broke on 2026-07-27.`);
    failures += 1;
    continue;
  }
  try {
    wrangler([
      "deploy", "--config", relativeConfig, "--name", tenantScriptName(tenant),
      "--dispatch-namespace", namespace, "--strict",
      ...(execute ? [] : ["--dry-run"]),
    ]);
    console.log(`${tenant.padEnd(12)} ok    ${execute ? "deployed" : "compiled"} ${tenantScriptName(tenant)} (db ${databaseId})`);
  } catch (error) {
    console.log(`${tenant.padEnd(12)} FAIL  ${String(error.message).split("\n")[0]}`);
    failures += 1;
  } finally {
    removeTenantConfig(configPath);
  }
}

if (failures) fail(`${failures} of ${tenants.length} tenant ${execute ? "deploys" : "preflights"} failed`);
if (execute) console.log(`\n${tenants.length} tenant Worker(s) now run the current platform code.`);
else console.log(`\nDry run passed for ${tenants.length} tenant(s). Re-run with --execute --confirm ${all ? "ALL" : single} after backup and health approval.`);
