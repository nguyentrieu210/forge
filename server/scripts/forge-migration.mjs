#!/usr/bin/env node
/**
 * Read-only implementation/migration tooling.
 *
 * Commands intentionally stop before authoritative writes:
 *   node scripts/forge-migration.mjs validate --manifest migration.json
 *   node scripts/forge-migration.mjs reconcile --spec metrics.json --source source.json --target target.json
 *
 * `cloudforge` must be built first because the canonical migration package is TypeScript.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import {
  assertReconciled,
  computeReconciliationMetrics,
  orderMigrationTargets,
  parseMigrationManifest,
  reconcileExactMetrics,
} from "../dist/packages/migration/src/public.js";

const [command, ...argv] = process.argv.slice(2);
const arg = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};

try {
  if (command === "validate") {
    const manifestPath = requiredArg("manifest");
    const manifest = parseMigrationManifest(readJson(manifestPath));
    const ordered = orderMigrationTargets(manifest);
    print({
      status: "valid",
      manifest_id: manifest.id,
      sources: manifest.sources.map((source) => ({ id: source.id, kind: source.kind, adapter: source.adapter })),
      ordered_targets: ordered.map((target, index) => ({
        order: index + 1,
        id: target.id,
        phase: target.phase,
        source_id: target.source_id,
        target_doctype: target.target_doctype,
        depends_on: target.depends_on,
        duplicate_policy: target.duplicate_policy,
      })),
    });
    process.exit(0);
  }

  if (command === "reconcile") {
    const specPath = requiredArg("spec");
    const sourcePath = requiredArg("source");
    const targetPath = requiredArg("target");
    const specs = readJson(specPath);
    const sourceRows = readJson(sourcePath);
    const targetRows = readJson(targetPath);
    if (!Array.isArray(specs)) fail("metric spec must be a JSON array", 2);
    if (!Array.isArray(sourceRows) || !sourceRows.every(isObject)) fail("source must be a JSON array of objects", 2);
    if (!Array.isArray(targetRows) || !targetRows.every(isObject)) fail("target must be a JSON array of objects", 2);
    const expected = computeReconciliationMetrics(sourceRows, specs);
    const actual = computeReconciliationMetrics(targetRows, specs);
    const metrics = reconcileExactMetrics(expected, actual);
    let status = "reconciled";
    try { assertReconciled(metrics); } catch { status = "mismatch"; }
    print({ status, expected, actual, metrics });
    process.exit(status === "reconciled" ? 0 : 3);
  }

  usage();
  process.exit(2);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), 2);
}

function requiredArg(name) {
  const value = arg(name);
  if (!value) fail(`--${name} is required`, 2);
  return value;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { fail(`cannot read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`, 2); }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message, code) {
  process.stderr.write(`forge-migration: ${message}\n`);
  process.exit(code);
}

function usage() {
  process.stderr.write([
    "Usage:",
    "  forge-migration validate --manifest <manifest.json>",
    "  forge-migration reconcile --spec <metrics.json> --source <source.json> --target <target.json>",
    "",
    "This tool is read-only. It does not apply tenant data.",
  ].join("\n") + "\n");
}
