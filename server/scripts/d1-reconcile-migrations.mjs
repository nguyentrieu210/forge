#!/usr/bin/env node
/**
 * Explicit evidence-backed bookkeeping reconciliation. Never executes migration SQL.
 * Default: remote read-only plan. Write requires --execute --confirm <database-id>.
 * Approval artifact binds exact git HEAD, database id/name and per-migration hashes,
 * historical receipt evidence and an explicit verified outcome.
 */
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { d1BindingOf, d1Query, serverRoot, fail } from "./wrangler-cli.mjs";
import { readAppliedMigrationNames } from "./lib/d1-migration-bookkeeping.mjs";
import { migrationContentIdentity, journalSql, readReconciliations } from "./lib/d1-migration-journal.mjs";
import { planReconciliation, executeReconciliation } from "./lib/d1-migration-reconciliation.mjs";
const args = process.argv.slice(2);
const value = (key) => { const i = args.indexOf("--" + key); return i < 0 ? undefined : args[i + 1]; };
if (!value("config") || !value("approval")) fail("--config and --approval <artifact.json> are required");
const database = d1BindingOf(path.resolve(serverRoot, value("config")));
if (!database.migrationsDir) fail("Database has no migrations directory");
const execute = args.includes("--execute");
if (execute && value("confirm") !== database.id) fail("Write requires --confirm <exact database-id>");
const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: serverRoot, encoding: "utf8" });
if (git.status !== 0) fail("Cannot determine exact source SHA");
const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: serverRoot, encoding: "utf8" });
if (status.status !== 0 || status.stdout.trim()) fail("Reconciliation requires a committed clean source");
const applied = readAppliedMigrationNames({ database, query: d1Query, dryRun: true });
const present = Number(d1Query(database, journalSql.exists)?.[0]?.total ?? 0) > 0;
const migrations = readdirSync(database.migrationsDir).filter((name) => name.endsWith(".sql")).sort()
  .map((name) => migrationContentIdentity(name, readFileSync(path.join(database.migrationsDir, name))));
const plan = planReconciliation({
  artifactBytes: readFileSync(path.resolve(value("approval"))), database, sourceSha: git.stdout.trim(), migrations,
  appliedNames: applied.names, receipts: present ? d1Query(database, journalSql.read) : [],
  decisions: readReconciliations({ database, query: d1Query }),
});
console.log(JSON.stringify({ database: database.name, source_sha: git.stdout.trim(), execute,
  decisions: plan.map(({ entry, artifactHash, alreadyRecorded }) => ({ ...entry, artifact_sha256: artifactHash, alreadyRecorded })) }, null, 2));
if (execute) {
  readAppliedMigrationNames({ database, query: d1Query, dryRun: false });
  executeReconciliation({ database, query: d1Query, plan });
  console.log("Evidence-backed reconciliation recorded. No migration SQL was executed.");
}
