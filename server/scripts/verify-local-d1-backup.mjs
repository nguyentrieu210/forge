#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const file = valueOf("file");
const expectedSha = valueOf("expected-sha256")?.toUpperCase();
const tenant = valueOf("tenant") ?? "demo";

if (!file) throw new Error("usage: verify-local-d1-backup.mjs --file <sqlite> [--expected-sha256 <sha>] [--tenant demo]");
const databasePath = resolve(file);
if (!existsSync(databasePath) || statSync(databasePath).size <= 0) throw new Error(`SQLite backup does not exist or is empty: ${databasePath}`);

const sha256 = createHash("sha256").update(readFileSync(databasePath)).digest("hex").toUpperCase();
if (expectedSha && sha256 !== expectedSha) throw new Error(`SHA-256 mismatch: expected ${expectedSha}, got ${sha256}`);

const database = new DatabaseSync(databasePath, { readOnly: true });
try {
  const quickRows = database.prepare("PRAGMA quick_check").all();
  const quickCheck = quickRows.map((row) => Object.values(row)[0]);
  if (quickCheck.length !== 1 || quickCheck[0] !== "ok") throw new Error(`PRAGMA quick_check failed: ${JSON.stringify(quickCheck)}`);
  const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeys.length) throw new Error(`PRAGMA foreign_key_check found ${foreignKeys.length} violation(s)`);
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const names = new Set(tables.map((row) => row.name));
  for (const required of ["documents", "master_records"]) if (!names.has(required)) throw new Error(`Required table is missing: ${required}`);
  const count = (table, where = "", values = []) => database.prepare(`SELECT COUNT(*) AS count FROM ${table}${where}`).get(...values).count;
  const evidence = {
    format: "forge-local-d1-backup-verification/v1",
    file: databasePath,
    bytes: statSync(databasePath).size,
    sha256,
    tenant,
    quick_check: "ok",
    foreign_key_violations: 0,
    application_tables: tables.length,
    counts: {
      documents: count("documents", " WHERE tenant_id=?", [tenant]),
      master_records: count("master_records", " WHERE tenant_id=?", [tenant]),
      items_in_documents: count("documents", " WHERE tenant_id=? AND doctype='Item'", [tenant]),
    },
  };
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`LOCAL_D1_BACKUP_VERIFY_PASS sha256=${sha256} quick_check=ok foreign_keys=0`);
} finally {
  database.close();
}
