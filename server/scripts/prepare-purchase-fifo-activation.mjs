#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const repositoryRoot = path.resolve(serverRoot, "..");

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

function main() {
  const args = parseReadinessArgs(process.argv.slice(2));
  const evidenceDir = resolveEvidenceDirectory(args.outputDir);
  mkdirSync(evidenceDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeTenant = safe(args.tenant);
  const reportPath = path.join(evidenceDir, `purchase-fifo-backfill-${safeTenant}-${stamp}.json`);
  const summaryPath = path.join(evidenceDir, `purchase-fifo-readiness-${safeTenant}-${stamp}.json`);
  const commandArgs = buildBackfillArgs(args, reportPath);

  const result = spawnSync(process.execPath, commandArgs, {
    cwd: serverRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (!existsSync(reportPath)) {
    throw new Error(`backfill dry-run did not create report: ${reportPath}`);
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const unresolvedCount = Number(report?.counts?.unresolved ?? report?.unresolved?.length ?? -1);
  const checksum = String(report?.checksum ?? "");
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error("backfill report did not contain a valid lowercase SHA-256 checksum");
  }
  if (!Number.isInteger(unresolvedCount) || unresolvedCount < 0) {
    throw new Error("backfill report did not contain a valid unresolved count");
  }

  const summary = {
    tenant: args.tenant,
    generated_at: new Date().toISOString(),
    mode: "read-only-dry-run",
    checksum,
    unresolved_count: unresolvedCount,
    counts: report.counts ?? null,
    report_path: reportPath,
    activation_allowed: false,
    next_gate: unresolvedCount === 0
      ? "review checksum and run controlled staging execute"
      : "resolve every ambiguous legacy row and rerun dry-run",
  };
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...summary, summary_path: summaryPath }, null, 2));

  if (result.status !== 0 && result.status !== 2) {
    process.exitCode = result.status ?? 1;
    return;
  }
  process.exitCode = unresolvedCount === 0 ? 0 : 2;
}

export function parseReadinessArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tenant") result.tenant = argv[++index];
    else if (arg === "--input") result.input = argv[++index];
    else if (arg === "--output-dir") result.outputDir = argv[++index];
    else if (arg === "--execute" || arg === "--activate" || arg === "--confirm"
      || arg === "--actor" || arg === "--expected-checksum") {
      throw new Error(`${arg} is forbidden in the read-only readiness command`);
    } else {
      throw new Error(`unknown argument ${arg}`);
    }
  }
  if (!result.tenant) {
    throw new Error("usage: node scripts/prepare-purchase-fifo-activation.mjs --tenant <id> [--input fixture.json] [--output-dir absolute-path-outside-repository]");
  }
  if (result.input && !String(result.input).trim()) throw new Error("--input requires a file path");
  if (result.outputDir && !String(result.outputDir).trim()) throw new Error("--output-dir requires a directory path");
  return result;
}

export function resolveEvidenceDirectory(outputDir, options = {}) {
  const repo = resolvePhysicalPath(options.repositoryRoot ?? repositoryRoot);
  const requested = outputDir
    ? path.resolve(options.cwd ?? process.cwd(), outputDir)
    : path.join(options.tempRoot ?? os.tmpdir(), "forge-purchase-fifo-readiness");
  const resolved = resolvePhysicalPath(requested);
  const relative = path.relative(repo, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(`evidence directory must be outside repository: ${resolved}`);
  }
  return resolved;
}

export function resolvePhysicalPath(targetPath) {
  let cursor = path.resolve(targetPath);
  const missingSegments = [];
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missingSegments.unshift(path.basename(cursor));
    cursor = parent;
  }
  const physicalBase = existsSync(cursor) ? realpathSync(cursor) : cursor;
  return path.resolve(physicalBase, ...missingSegments);
}

export function buildBackfillArgs(args, reportPath) {
  const commandArgs = [
    path.join("scripts", "backfill-purchase-receipt-allocations.mjs"),
    "--tenant", args.tenant,
    "--output", reportPath,
  ];
  if (args.input) commandArgs.push("--input", args.input);
  return commandArgs;
}

function safe(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]/g, "_");
}
