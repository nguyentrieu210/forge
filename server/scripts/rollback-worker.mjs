#!/usr/bin/env node
/**
 * Plans or executes a Cloudflare Worker code/config rollback by exact version id.
 *
 * Worker versions do NOT roll back D1/KV/R2 state. Use D1 PITR separately when data
 * state must move backwards, and never assume code rollback makes a migrated schema old.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { assertWorkerRollbackRequest, containsString } from "./lib/worker-rollback-guard.mjs";
import { fail, wrangler } from "./wrangler-cli.mjs";

const args = process.argv.slice(2);
const argOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const worker = argOf("worker")?.trim();
const versionId = argOf("version")?.trim();
const execute = args.includes("--execute");
const confirm = argOf("confirm")?.trim();
const reason = argOf("reason")?.trim();
const output = argOf("output")?.trim();

try {
  assertWorkerRollbackRequest({ worker, versionId, execute, confirm, reason });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const target = parseJson(wrangler(["versions", "view", versionId, "--name", worker, "--json"]));
if (!containsString(target, versionId)) fail(`Wrangler did not return requested version ${versionId} for ${worker}`);
const before = parseJson(wrangler(["deployments", "status", "--name", worker, "--json"]));

const evidence = {
  format: "forge-worker-rollback/v1",
  worker,
  target_version_id: versionId,
  planned_at: new Date().toISOString(),
  reason: reason ?? null,
  executed: false,
  storage_rollback_included: false,
  deployment_before: before,
};

console.log(`worker   ${worker}`);
console.log(`target   ${versionId}`);
console.log(`mode     ${execute ? "ROLLBACK PRODUCTION WORKER" : "plan/read-only"}`);
console.log("storage  unchanged (D1/KV/R2 are outside Worker versions)");

if (!execute) {
  if (output) writeEvidence(output, evidence);
  console.log(`\nPlan only. To execute add --execute --confirm ${worker} --reason <text>`);
  process.exit(0);
}

const startedAt = performance.now();
wrangler([
  "rollback", versionId,
  "--name", worker,
  "--message", `Forge rollback: ${reason}`,
], { capture: false });
const rollbackDurationMs = Math.round(performance.now() - startedAt);

const after = parseJson(wrangler(["deployments", "status", "--name", worker, "--json"]));
if (!containsString(after, versionId)) {
  fail(`rollback command returned but active deployment does not contain target version ${versionId}`);
}

const completed = {
  ...evidence,
  executed: true,
  rolled_back_at: new Date().toISOString(),
  rollback_duration_ms: rollbackDurationMs,
  deployment_after: after,
};
if (output) writeEvidence(output, completed);
console.log(`\nROLLBACK_OK worker=${worker} version=${versionId} duration_ms=${rollbackDurationMs}`);

function parseJson(text) {
  const source = String(text ?? "").trim();
  const starts = [source.indexOf("{"), source.indexOf("[")].filter((index) => index >= 0);
  if (starts.length === 0) fail(`could not find JSON in Wrangler output: ${source.slice(0, 300)}`);
  try {
    return JSON.parse(source.slice(Math.min(...starts)));
  } catch (error) {
    fail(`could not parse Wrangler JSON: ${error.message}`);
  }
}

function writeEvidence(file, value) {
  const targetPath = path.resolve(file);
  writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`evidence ${targetPath}`);
}
