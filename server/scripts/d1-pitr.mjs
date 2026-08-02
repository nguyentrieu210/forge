#!/usr/bin/env node
/**
 * Plans or executes a tenant D1 Time Travel restore.
 *
 * Dry-run is the default and resolves both current + target bookmarks remotely without
 * mutating D1. Execute is deliberately noisy and double-guarded: exact tenant confirm,
 * mandatory reason, fresh SQL export + offline replay verification, then Time Travel.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { assertPitrRequest, findString, requireBookmark } from "./lib/pitr-guard.mjs";
import { fail, serverRoot, wrangler } from "./wrangler-cli.mjs";
import { findTenantDatabaseId } from "./tenant-wrangler.mjs";

const args = process.argv.slice(2);
const argOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const tenant = argOf("tenant")?.trim();
const timestamp = argOf("timestamp")?.trim();
const bookmark = argOf("bookmark")?.trim();
const execute = args.includes("--execute");
const confirm = argOf("confirm")?.trim();
const reason = argOf("reason")?.trim();
const backupDirArg = argOf("backup-dir")?.trim();
const outputArg = argOf("output")?.trim();

try {
  assertPitrRequest({
    tenant,
    timestamp,
    bookmark,
    execute,
    confirm,
    reason,
    backupDir: backupDirArg,
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const databaseName = `cloudforge-${tenant}`;
const databaseId = findTenantDatabaseId(tenant, wrangler);
if (!databaseId) fail(`no D1 database named ${databaseName}`);

const info = parseJson(wrangler(["d1", "info", databaseName, "--json"]));
const version = findString(info, "version");
if (version !== "production") {
  fail(`${databaseName} reports D1 version=${version ?? "unknown"}; Time Travel requires production storage`);
}

const currentInfo = parseJson(wrangler(["d1", "time-travel", "info", databaseName, "--json"]));
let currentBookmark;
try {
  currentBookmark = requireBookmark(currentInfo, "current");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const targetInfo = bookmark
  ? { bookmark }
  : parseJson(wrangler(["d1", "time-travel", "info", databaseName, "--timestamp", timestamp, "--json"]));
let targetBookmark;
try {
  targetBookmark = requireBookmark(targetInfo, "target");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const baseEvidence = {
  format: "forge-d1-pitr/v1",
  tenant,
  database_name: databaseName,
  d1_version: version,
  planned_at: new Date().toISOString(),
  reason: reason ?? null,
  requested_timestamp: timestamp ?? null,
  requested_bookmark: bookmark ?? null,
  current_bookmark_before: currentBookmark,
  target_bookmark: targetBookmark,
  destructive: execute,
};

console.log(`tenant      ${tenant}`);
console.log(`database    ${databaseName}`);
console.log(`d1 version  ${version}`);
console.log(`current     ${currentBookmark}`);
console.log(`target      ${targetBookmark}${timestamp ? ` (${timestamp})` : ""}`);
console.log(`mode        ${execute ? "DESTRUCTIVE PITR" : "plan/read-only"}`);

if (!execute) {
  if (outputArg) writeEvidence(outputArg, { ...baseEvidence, executed: false });
  console.log("\nPlan only. No restore was executed.");
  console.log(`To execute: add --execute --confirm ${tenant} --reason <text> --backup-dir <secure-dir>`);
  process.exit(0);
}

const backupDir = path.resolve(backupDirArg);
mkdirSync(backupDir, { recursive: true });
const before = new Set(readdirSync(backupDir));
runNode("backup-tenant.mjs", ["--tenant", tenant, "--execute", "--output-dir", backupDir]);
const createdSql = readdirSync(backupDir)
  .filter((name) => name.endsWith(".sql") && !before.has(name))
  .map((name) => path.join(backupDir, name));
if (createdSql.length !== 1) fail(`expected one fresh pre-PITR SQL backup, found ${createdSql.length}`);
const backupFile = createdSql[0];
const backupVerifyEvidence = `${backupFile}.verify.json`;
runNode("verify-tenant-backup.mjs", [
  "--tenant", tenant,
  "--file", backupFile,
  "--output", backupVerifyEvidence,
]);

const startedAt = performance.now();
const restoreResponse = parseJson(wrangler([
  "d1", "time-travel", "restore", databaseName,
  "--bookmark", targetBookmark,
  "--json",
], { input: "y\n" }));
const restoreDurationMs = Math.round(performance.now() - startedAt);
let providerBookmark;
try {
  providerBookmark = requireBookmark(restoreResponse, "restore response");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const providerPreviousBookmark = findString(restoreResponse, "previous_bookmark");
if (providerBookmark !== targetBookmark) {
  fail(`PITR provider restored ${providerBookmark}, expected target ${targetBookmark}`);
}
if (providerPreviousBookmark && providerPreviousBookmark !== currentBookmark) {
  fail(`PITR provider previous bookmark ${providerPreviousBookmark} != preflight ${currentBookmark}`);
}

const afterInfo = parseJson(wrangler(["d1", "time-travel", "info", databaseName, "--json"]));
let currentBookmarkAfter;
try {
  currentBookmarkAfter = requireBookmark(afterInfo, "post-restore");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
if (currentBookmarkAfter !== targetBookmark) {
  fail(`PITR provider returned but current bookmark ${currentBookmarkAfter} != target ${targetBookmark}`);
}

const undoBookmark = providerPreviousBookmark ?? currentBookmark;
const evidence = {
  ...baseEvidence,
  executed: true,
  restored_at: new Date().toISOString(),
  restore_duration_ms: restoreDurationMs,
  provider_bookmark: providerBookmark,
  provider_previous_bookmark: providerPreviousBookmark ?? null,
  current_bookmark_after: currentBookmarkAfter,
  undo_bookmark: undoBookmark,
  pre_restore_backup_file: path.basename(backupFile),
  pre_restore_backup_verification: path.basename(backupVerifyEvidence),
};
const output = outputArg ?? path.join(backupDir, `${tenant}-${Date.now()}.pitr.json`);
writeEvidence(output, evidence);
console.log(`\nPITR complete. Undo bookmark: ${undoBookmark}`);
console.log(`evidence    ${path.resolve(output)}`);

function runNode(script, scriptArgs) {
  const result = spawnSync(process.execPath, [path.join(serverRoot, "scripts", script), ...scriptArgs], {
    cwd: serverRoot,
    encoding: "utf8",
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) fail(`${script} could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${script} exited ${result.status ?? "unknown"}`);
}

function parseJson(text) {
  const source = String(text ?? "").trim();
  const starts = [source.indexOf("{"), source.indexOf("[")].filter((index) => index >= 0);
  if (starts.length === 0) fail(`could not find JSON in Wrangler output: ${source.slice(0, 300)}`);
  const start = Math.min(...starts);
  try {
    return JSON.parse(source.slice(start));
  } catch (error) {
    fail(`could not parse Wrangler JSON: ${error.message}`);
  }
}

function writeEvidence(file, value) {
  const target = path.resolve(file);
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`evidence    ${target}`);
}
