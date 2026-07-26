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
 * us. `wrangler d1 migrations list` stays truthful afterwards, and the two commands
 * remain interchangeable.
 *
 * Usage:
 *   node scripts/d1-migrate-remote.mjs --config apps/tenant-worker/wrangler.jsonc
 *   node scripts/d1-migrate-remote.mjs --config … --dry-run
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
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
console.log(`mode       ${dryRun ? "dry run" : "APPLY (remote)"}\n`);

// Same shape wrangler creates, so either command can pick up where the other left off.
d1Query(database, `CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`);

const applied = new Set(d1Query(database, "SELECT name FROM d1_migrations").map((row) => row.name));
const files = readdirSync(database.migrationsDir).filter((name) => name.endsWith(".sql")).sort();
if (files.length === 0) fail(`no .sql files in ${path.relative(serverRoot, database.migrationsDir)}`);

const pending = files.filter((name) => !applied.has(name));
if (pending.length === 0) {
  console.log(`nothing to do — all ${files.length} migrations are recorded as applied.`);
  process.exit(0);
}

console.log(`${applied.size} applied, ${pending.length} pending:`);
for (const name of pending) console.log(`  · ${name}`);
console.log();

if (dryRun) {
  console.log("dry run — nothing was sent.");
  process.exit(0);
}

for (const name of pending) {
  // A migration filename reaches SQL as a literal, so anything exotic is refused
  // rather than quoted-and-hoped-for.
  if (!/^[0-9A-Za-z._-]+$/.test(name)) fail(`migration filename is not safe to record: ${name}`);
  process.stdout.write(`applying ${name} … `);
  wrangler([
    "d1", "execute", database.name,
    "--config", database.configArg,
    "--remote", "--file", path.relative(serverRoot, path.join(database.migrationsDir, name)),
  ]);
  // Recorded only after the file applied cleanly: a crash between the two leaves the
  // migration unrecorded, so a rerun retries it. Recording first would skip it
  // forever and leave the schema silently short.
  d1Query(database, `INSERT INTO d1_migrations (name) VALUES ('${name}')`);
  console.log("ok");
}

console.log(`\napplied ${pending.length} migration(s) to ${database.name}.`);
