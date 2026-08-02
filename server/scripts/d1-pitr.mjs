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

if (!tenant || !/^[a-z][a-z0-9-]*$/.test(tenant)) fail("--tenant <id> is required");
if (Boolean(timestamp) === Boolean(bookmark)) fail("provide exactly one of --timestamp or --bookmark");
if (timestamp) assertTimestamp(timestamp);
if (bookmark && !/^[0-9A-Za-z-]{16,256}$/.test(bookmark)) fail("--bookmark has an unsafe or implausible format");
if (execute && confirm !== tenant) fail(`refusing destructive PITR: add --confirm ${tenant}`);
if (execute && !reason) fail("refusing destructive PITR without --reason <text>");
if (execute && !backupDirArg) fail("refusing destructive PITR without --backup-dir <secure directory>");

const databaseName = `cloudforge-${tenant}`;
const databaseId = findTenantDatabaseId(tenant, wrangler);
if (!databaseId) fail(`no D1 database named ${databaseName}`);

const info = parseJson(wrangler(["d1", "info", databaseName, "--json"]));
const version = findString(info, "version");
if (version !== "production") {
  fail(`${databaseName} reports D1 version=${version ?? "unknown"}; Time Travel requires production storage`);
}

const currentInfo = parseJson(wrangler(["d1", "time-travel", "info", databaseName, "--json"]));
const currentBookmark = requireBookmark(currentInfo, "current");
const targetInfo = bookmark
  ? { bookmark }
  : parseJson(wrangler(["d1", "time-travel", "info", databaseName, "--timestamp", timestamp, "--json"]));
const targetBookmark = requireBookmark(targetInfo, "target");

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
// Keep Wrangler's provider confirmation in addition to Forge's explicit confirm/reason.
// JSON output is used so success is checked from provider fields instead of CLI prose.
const restoreResponse = parseJson(wrangler([
  "d1", "time-travel", "restore", databaseName,
  "--bookmark", targetBookmark,
  "--json",
], { input: "y\n" }));
const restoreDurationMs = Math.round(performance.now() - startedAt);
const providerBookmark = requireBookmark(restoreResponse, "restore response");
const providerPreviousBookmark = findString(restoreResponse, "previous_bookmark");
if (providerBookmark !== targetBookmark) {
  fail(`PITR provider restored ${providerBookmark}, expected target ${targetBookmark}`);
}
if (providerPreviousBookmark && providerPreviousBookmark !== currentBookmark) {
  fail(`PITR provider previous bookmark ${providerPreviousBookmark} != preflight ${currentBookmark}`);
}

const afterInfo = parseJson(wrangler(["d1", "time-travel", "info", databaseName, "--json"]));
const currentBookmarkAfter = requireBookmark(afterInfo, "post-restore");
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

function assertTimestamp(value) {
  if (/^\d{10,13}$/.test(value)) {
    const numeric = Number(value);
    const millis = value.length === 13 ? numeric : numeric * 1000;
    if (!Number.isFinite(millis) || millis <= 0 || millis > Date.now()) fail("--timestamp must be a past Unix timestamp");
    return;
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    fail("RFC3339 --timestamp must include an explicit timezone (Z or +/-HH:MM)");
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || millis > Date.now()) fail("--timestamp must be a valid past RFC3339 timestamp");
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

function findString(value, key) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, key);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  if (typeof value[key] === "string") return value[key];
  for (const item of Object.values(value)) {
    const found = findString(item, key);
    if (found) return found;
  }
  return null;
}

function requireBookmark(value, label) {
  const found = findString(value, "bookmark");
  if (!found) fail(`${label} Time Travel response has no bookmark`);
  return found;
}

function writeEvidence(file, value) {
  const target = path.resolve(file);
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`evidence    ${target}`);
}
