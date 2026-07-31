import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(testsDir, "..");
const script = path.join(serverRoot, "scripts", "backfill-purchase-receipt-allocations.mjs");

function run(args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function outputOf(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function emptyFixture(directory) {
  const fixture = path.join(directory, "fixture.json");
  writeFileSync(fixture, JSON.stringify({
    documents: [],
    children: [],
    progress_entries: [],
  }), "utf8");
  return fixture;
}

test("write mode requires an approved checksum before reading or mutating tenant data", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "forge-purchase-checksum-required-"));
  const result = run([
    "--tenant", "staging-demo",
    "--execute",
    "--confirm", "staging-demo",
    "--input", path.join(directory, "does-not-need-to-exist.json"),
  ], directory);

  assert.notEqual(result.status, 0);
  assert.match(outputOf(result), /write mode requires --expected-checksum/);
  assert.doesNotMatch(outputOf(result), /ENOENT/);
});

test("write mode rejects a plan that differs from the reviewed checksum", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "forge-purchase-checksum-mismatch-"));
  const fixture = emptyFixture(directory);
  const report = path.join(directory, "report.json");
  const approved = "0".repeat(64);
  const result = run([
    "--tenant", "staging-demo",
    "--input", fixture,
    "--output", report,
    "--execute",
    "--confirm", "staging-demo",
    "--expected-checksum", approved,
  ], directory);

  assert.notEqual(result.status, 0);
  assert.match(outputOf(result), /differs from approved/);
  assert.doesNotMatch(outputOf(result), /--execute is unavailable with --input/);

  const generated = JSON.parse(readFileSync(report, "utf8"));
  assert.match(generated.checksum, /^[a-f0-9]{64}$/);
  assert.notEqual(generated.checksum, approved);
});

test("matching checksum passes the approval gate before fixture write protection stops execution", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "forge-purchase-checksum-match-"));
  const fixture = emptyFixture(directory);
  const dryRunReport = path.join(directory, "dry-run.json");
  const dryRun = run([
    "--tenant", "staging-demo",
    "--input", fixture,
    "--output", dryRunReport,
  ], directory);

  assert.equal(dryRun.status, 0, outputOf(dryRun));
  const approved = JSON.parse(readFileSync(dryRunReport, "utf8")).checksum;

  const executeReport = path.join(directory, "execute.json");
  const execute = run([
    "--tenant", "staging-demo",
    "--input", fixture,
    "--output", executeReport,
    "--execute",
    "--confirm", "staging-demo",
    "--expected-checksum", approved,
  ], directory);

  assert.notEqual(execute.status, 0);
  assert.match(outputOf(execute), /--execute is unavailable with --input/);
  assert.doesNotMatch(outputOf(execute), /differs from approved/);
});
