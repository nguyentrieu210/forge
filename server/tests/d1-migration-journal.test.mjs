import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { migrationContentIdentity, inspectMigrationJournal, applyJournaledMigration, journalSql, reconciliationSql } from "../scripts/lib/d1-migration-journal.mjs";

const migration = migrationContentIdentity("0001_test.sql", Buffer.from("CREATE TABLE business(id INTEGER);\n"));
function harness({ legacy = [], receipts = [], failLedger = false } = {}) {
  let present = receipts.length > 0;
  const rows = receipts.map((row) => ({ ...row }));
  const calls = [];
  const query = (_db, sql) => {
    calls.push(sql);
    if (sql === journalSql.exists) return [{ total: present ? 1 : 0 }];
    if (sql === reconciliationSql.exists) return [{ total: 0 }];
    if (sql === journalSql.read) return rows.map((row) => ({ ...row }));
    if (sql === journalSql.create) { present = true; return []; }
    if (sql.startsWith("INSERT INTO forge_d1")) {
      if (rows.some((row) => row.name === migration.name)) throw new Error("UNIQUE constraint");
      rows.push({ name: migration.name, content_sha256: migration.sha256, state: "reserved" });
      return [];
    }
    if (sql.startsWith("INSERT INTO d1_migrations")) {
      if (failLedger) throw new Error("lost receipt response");
      legacy.push(migration.name);
      return [];
    }
    if (sql.startsWith("UPDATE forge_d1")) { rows[0].state = "applied"; return []; }
    throw new Error("Unexpected SQL: " + sql);
  };
  return { query, calls, rows, inspect: (migrations = [migration]) => inspectMigrationJournal({ query, migrations, appliedNames: legacy }) };
}

test("empty dry-run inspection issues only a read", () => {
  const h = harness();
  assert.deepEqual(h.inspect().pending, [migration]);
  assert.deepEqual(h.calls, [journalSql.exists]);
});
test("legacy name-only receipts are never assigned today's checksum", () => {
  const h = harness({ legacy: [migration.name] });
  assert.throws(() => h.inspect(), /Legacy migration lacks exact-content/);
  assert.deepEqual(h.calls, [journalSql.exists]);
});
test("successful apply retains exact bytes and verified receipt", () => {
  const h = harness();
  let executions = 0;
  applyJournaledMigration({ query: h.query, migration, execute: (value) => {
    executions++;
    assert.equal(value.content.toString(), "CREATE TABLE business(id INTEGER);\n");
    assert.equal(h.rows[0].state, "reserved");
  } });
  assert.equal(executions, 1);
  assert.equal(h.rows[0].state, "applied");
  assert.deepEqual(h.inspect().pending, []);
});
test("modified or missing applied source fails before any write", () => {
  const receipt = { name: migration.name, content_sha256: migration.sha256, state: "applied" };
  for (const sources of [[], [migrationContentIdentity(migration.name, Buffer.from("different"))]]) {
    const h = harness({ receipts: [receipt] });
    assert.throws(() => h.inspect(sources), /missing|identity mismatch/);
    assert.deepEqual(h.calls, [journalSql.exists, journalSql.read]);
  }
});
test("SQL error, response loss and receipt failure refuse automatic replay", () => {
  for (const failure of ["sql", "transport", "receipt"]) {
    const h = harness({ failLedger: failure === "receipt" });
    assert.throws(() => applyJournaledMigration({
      query: h.query, migration,
      execute: () => { if (failure !== "receipt") throw new Error(failure); },
    }));
    assert.equal(h.rows[0].state, "reserved");
    assert.throws(() => h.inspect(), /outcome is uncertain/);
  }
});
test("concurrent reservation cannot execute migration twice", () => {
  const h = harness({ receipts: [{ name: migration.name, content_sha256: migration.sha256, state: "reserved" }] });
  let executed = false;
  assert.throws(() => applyJournaledMigration({ query: h.query, migration, execute: () => { executed = true; } }), /reserved|UNIQUE/);
  assert.equal(executed, false);
});
test("SQLite enforces immutable identity, append-only receipts and one-way completion", () => {
  const python = `
import sqlite3, json, sys
c = sqlite3.connect(':memory:')
c.executescript(json.load(sys.stdin)['schema'])
c.execute("INSERT INTO forge_d1_migration_journal(name,content_sha256,state) VALUES ('one.sql',?,'reserved')", ('a'*64,))
def refused(sql):
    try: c.execute(sql)
    except sqlite3.IntegrityError: return
    raise AssertionError(sql)
refused("UPDATE forge_d1_migration_journal SET content_sha256='" + 'b'*64 + "'")
refused("DELETE FROM forge_d1_migration_journal")
refused("UPDATE forge_d1_migration_journal SET state='reserved'")
c.execute("UPDATE forge_d1_migration_journal SET state='applied', applied_at=CURRENT_TIMESTAMP")
refused("UPDATE forge_d1_migration_journal SET state='reserved', applied_at=NULL")
refused("UPDATE forge_d1_migration_journal SET applied_at='changed'")
refused("DELETE FROM forge_d1_migration_journal")
`;
  const result = spawnSync("python3", ["-c", python], { input: JSON.stringify({ schema: journalSql.create }), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
