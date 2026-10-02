#!/usr/bin/env node
/**
 * Applies D1 migrations to a REMOTE database, one file at a time.
 *
 * WHY THIS EXISTS — `wrangler d1 migrations apply --remote` cannot apply this
 * project's migrations at all.
 *
 * That command POSTs each migration file to the D1 HTTP API as a single `sql`
 * string and lets the SERVER split it into statements. D1's server-side splitter
 * tracks `BEGIN … END` for trigger bodies but treats a nested `CASE … END;` as the
 * end of the block, so a trigger like
 *
 *     CREATE TRIGGER g BEFORE INSERT ON t
 *     BEGIN
 *       SELECT CASE WHEN … THEN RAISE(ABORT,'…') END;   <-- cut here
 *     END;                                              <-- orphaned fragment
 *
 * arrives truncated and the API answers `incomplete input: SQLITE_ERROR [7500]`.
 * Ten of the fifteen tenant migrations use that shape — it is the only way to raise
 * a chosen error per condition in SQLite — so the documented command dies on 0005
 * and never reaches 0006.
 *
 * `wrangler d1 execute --remote --file` does NOT have the problem: it splits
 * client-side with wrangler's own splitter, which handles the nested CASE, and sends
 * the statements individually. So this script drives that path and keeps the
 * `d1_migrations` bookkeeping itself, which is all `migrations apply` was doing for
 * us. `wrangler d1 migrations list` stays truthful afterwards. The Forge journal
 * additionally requires exact-content evidence: name-only legacy receipts or
 * migrations applied outside this runner require explicit operator reconciliation.
 * A reserved outcome is never automatically retried, because file import and the
 * receipt are not proven to share an atomic remote transaction.
 *
 * Dry-run is a hard read-only contract: it may inspect sqlite_schema and the existing
 * d1_migrations rows, but it must never create the bookkeeping table or apply SQL.
 *
 * Usage:
 *   node scripts/d1-migrate-remote.mjs --config apps/tenant-worker/wrangler.jsonc
 *   node scripts/d1-migrate-remote.mjs --config … --dry-run
 */
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { readAppliedMigrationNames } from "./lib/d1-migration-bookkeeping.mjs";
import { migrationContentIdentity, inspectMigrationJournal, applyJournaledMigration } from "./lib/d1-migration-journal.mjs";
import { d1BindingOf, d1Query, fail, serverRoot, wrangler } from "./wrangler-cli.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const configIndex = args.indexOf("--config");
if (configIndex === -1 || !args[configIndex + 1]) {
  fail("d1-migrate-remote: --config <path to wrangler.jsonc> is required");
}

const database = d1BindingOf(path.resolve(serverRoot, args[configIndex + 1]));
if (!database.migrationsDir) fail(`${database.configArg} declares no migrations_dir for ${database.name}`);

console.log(`database   ${database.name} (${database.id ?? "id not pinned"})`);
console.log(`migrations ${path.relative(serverRoot, database.migrationsDir)}`);
console.log(`mode       ${dryRun ? "dry run (read-only)" : "APPLY (remote)"}\n`);

// Inspect before creating any table, even in live mode.
const migrationState = readAppliedMigrationNames({ database, dryRun: true, query: d1Query });
const applied = new Set(migrationState.names);
if (dryRun && !migrationState.trackingTablePresent) {
  console.log("tracking  d1_migrations is absent; read-only dry run treats the applied set as empty");
}

const files = readdirSync(database.migrationsDir).filter((name) => name.endsWith(".sql")).sort();
if (files.length === 0) fail(`no .sql files in ${path.relative(serverRoot, database.migrationsDir)}`);

const migrations = files.map((name) => migrationContentIdentity(name, readFileSync(path.join(database.migrationsDir, name))));
const { pending } = inspectMigrationJournal({ database, query: d1Query, migrations, appliedNames: [...applied] });
if (pending.length === 0) {
  console.log(`nothing to do — all ${files.length} migrations are recorded as applied.`);
  process.exit(0);
}

console.log(`${applied.size} applied, ${pending.length} pending:`);
for (const migration of pending) console.log(`  · ${migration.name} sha256=${migration.sha256}`);
console.log();

if (dryRun) {
  console.log("dry run — read-only inspection complete; no SQL or bookkeeping mutation was sent.");
  process.exit(0);
}

readAppliedMigrationNames({ database, dryRun: false, query: d1Query });
for (const migration of pending) {
  const { name } = migration;
  process.stdout.write(`applying ${name} … `);
  const scratch = mkdtempSync(path.join(os.tmpdir(), "forge-d1-migration-"));
  try {
    // Execute the bytes hashed during preflight, not a file that may have changed.
    const capturedFile = path.join(scratch, name);
    writeFileSync(capturedFile, migration.content, { mode: 0o600 });
    applyJournaledMigration({
      database, query: d1Query, migration,
      execute: () => wrangler([
        "d1", "execute", database.name, "--config", database.configArg,
        "--remote", "--file", capturedFile,
      ]),
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log("ok");
}

console.log(`\napplied ${pending.length} migration(s) to ${database.name}.`);
