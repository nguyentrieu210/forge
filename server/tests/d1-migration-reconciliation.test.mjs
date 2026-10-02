import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrationContentIdentity, journalSql, reconciliationSql, inspectMigrationJournal, applyJournaledMigration, readReconciliations } from "../scripts/lib/d1-migration-journal.mjs";
import { planReconciliation, executeReconciliation } from "../scripts/lib/d1-migration-reconciliation.mjs";
const sourceSha = "a".repeat(40);
const migration = migrationContentIdentity("0001.sql", Buffer.from("SELECT 1;"));
const database = { id: "db-123", name: "tenant-one" };
const artifact = () => ({
  schema_version: 1, source_sha: sourceSha, database_id: database.id, database_name: database.name,
  approved_by: "operator@example.test", approved_at: "2026-10-02T07:00:00Z",
  approval_ref: "approval://change-123", reason: "verified historical migration execution",
  entries: [{ decision_id: "decision-1", name: migration.name, content_sha256: migration.sha256,
    prior_attempt: "legacy", outcome: "verified_applied",
    evidence: [{ kind: "provider_receipt", reference: "evidence://receipt-1", sha256: "b".repeat(64) }] }],
});
const plan = (approval, overrides = {}) => planReconciliation({ artifactBytes: Buffer.from(JSON.stringify(approval)),
  database, sourceSha, migrations: [migration], appliedNames: [migration.name], receipts: [], decisions: [], ...overrides });
test("legacy adoption needs explicit approval and historical exact-content evidence", () => {
  assert.equal(plan(artifact())[0].entry.outcome, "verified_applied");
  for (const change of [
    (a) => { a.source_sha = "c".repeat(40); },
    (a) => { a.database_id = "other-db"; },
    (a) => { a.entries[0].content_sha256 = "d".repeat(64); },
    (a) => { a.entries[0].evidence = []; },
    (a) => { delete a.approval_ref; },
    (a) => { a.entries[0].outcome = "assumed_applied"; },
  ]) { const a = artifact(); change(a); assert.throws(() => plan(a)); }
  assert.throws(() => plan(artifact(), { appliedNames: [] }), /existing provider bookkeeping/);
});
test("not-applied recovery requires no partial effects and targets exact failed attempt", () => {
  const a = artifact();
  Object.assign(a.entries[0], { prior_attempt: "initial", outcome: "verified_not_applied", no_partial_effects: true });
  const receipt = { name: migration.name, content_sha256: migration.sha256, state: "reserved" };
  assert.equal(plan(a, { receipts: [receipt], appliedNames: [] }).length, 1);
  assert.throws(() => plan(a, { receipts: [receipt] }), /conflicts/);
  delete a.entries[0].no_partial_effects;
  assert.throws(() => plan(a, { receipts: [receipt], appliedNames: [] }), /partial SQL effects/);
  a.entries[0].no_partial_effects = true;
  assert.throws(() => plan(a, { receipts: [receipt], appliedNames: [], decisions: [{ name: migration.name, consumed_by: "attempt-2" }] }), /prior-attempt/);
});
test("decision IDs bind immutable approval bytes and duplicate entries fail", () => {
  const a = artifact();
  const p = plan(a)[0];
  const decisions = [{ decision_id: "decision-1", name: migration.name, artifact_sha256: p.artifactHash }];
  assert.equal(plan(a, { decisions })[0].alreadyRecorded, true);
  a.reason = "different approval";
  assert.throws(() => plan(a, { decisions }), /different approval/);
  const duplicate = artifact(); duplicate.entries.push({ ...duplicate.entries[0] });
  assert.throws(() => plan(duplicate), /Duplicate/);
});
test("SQLite permits only one consumption and preserves all recovery evidence", () => {
  const result = spawnSync("python3", ["-c", `
import json, sqlite3, sys
c=sqlite3.connect(':memory:')
c.executescript(json.load(sys.stdin)['schema'])
c.execute("CREATE TABLE d1_migrations(name TEXT UNIQUE)")
c.execute("INSERT INTO forge_d1_migration_journal(name,content_sha256,state) VALUES ('one.sql',?,'reserved')",('a'*64,))
c.execute("INSERT INTO forge_d1_migration_reconciliations(decision_id,name,content_sha256,prior_attempt,outcome,artifact_sha256,evidence_json) VALUES ('d','one.sql',?,'initial','verified_not_applied',?,'{}')",('a'*64,'b'*64))
def refused(sql):
    try:c.execute(sql)
    except sqlite3.IntegrityError:return
    raise AssertionError(sql)
refused("UPDATE forge_d1_migration_reconciliations SET outcome='verified_applied'")
refused("DELETE FROM forge_d1_migration_reconciliations")
c.execute("UPDATE forge_d1_migration_reconciliations SET consumed_by='attempt-1' WHERE consumed_by IS NULL")
assert c.execute("UPDATE forge_d1_migration_reconciliations SET consumed_by='attempt-2' WHERE consumed_by IS NULL").rowcount == 0
refused("UPDATE forge_d1_migration_reconciliations SET consumed_by='attempt-2'")
refused("UPDATE forge_d1_migration_reconciliations SET evidence_json='[]'")
`], { input: JSON.stringify({ schema: journalSql.create + reconciliationSql.create }), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("SQLite full reconciliation adopts legacy and permits exactly one verified retry", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "forge-reconciliation-test-"));
  try {
    const file = path.join(dir, "test.sqlite");
    const query = (_db, sql) => {
      const result = spawnSync("python3", ["-c", `
import sqlite3, json, sys
data=json.load(sys.stdin)
c=sqlite3.connect(data['file']); c.row_factory=sqlite3.Row
if data['sql'].lstrip().upper().startswith('SELECT'):
    rows=[dict(r) for r in c.execute(data['sql']).fetchall()]
else:
    c.executescript(data['sql']); rows=[]
c.commit(); print(json.dumps(rows))
`], { input: JSON.stringify({ file, sql }), encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr);
      return JSON.parse(result.stdout);
    };
    query(database, "CREATE TABLE d1_migrations(name TEXT UNIQUE);");
    query(database, "INSERT INTO d1_migrations(name) VALUES ('0001.sql')");
    executeReconciliation({ database, query, plan: plan(artifact()) });
    assert.deepEqual(inspectMigrationJournal({ database, query, migrations: [migration], appliedNames: [migration.name] }).pending, []);

    const retry = migrationContentIdentity("0002.sql", Buffer.from("CREATE TABLE retried_business(id INTEGER);"));
    query(database, `INSERT INTO forge_d1_migration_journal(name,content_sha256,state) VALUES ('0002.sql','${retry.sha256}','reserved')`);
    const a = artifact();
    Object.assign(a.entries[0], { name: retry.name, content_sha256: retry.sha256, decision_id: "recovery-1",
      prior_attempt: "initial", outcome: "verified_not_applied", no_partial_effects: true });
    const recovery = plan(a, { migrations: [retry], receipts: query(database, journalSql.read), appliedNames: [] });
    executeReconciliation({ database, query, plan: recovery });
    const staleApproval = JSON.parse(JSON.stringify(a));
    staleApproval.entries[0].decision_id = "stale-recovery";
    const stalePlan = plan(staleApproval, { migrations: [retry], receipts: query(database, journalSql.read),
      appliedNames: [], decisions: readReconciliations({ database, query }) });
    const inspected = inspectMigrationJournal({ database, query, migrations: [migration, retry], appliedNames: [migration.name] });
    assert.deepEqual(inspected.pending.map((row) => row.name), [retry.name]);
    // Lose the transport response after business SQL succeeds. A retry approval
    // cannot be reused; another explicit decision must bind the recorded attempt.
    assert.throws(() => applyJournaledMigration({ database, query, migration: retry,
      execute: () => { query(database, retry.content.toString()); throw new Error("lost response"); } }), /lost response/);
    assert.throws(() => inspectMigrationJournal({ database, query, migrations: [migration, retry], appliedNames: [migration.name] }), /uncertain/);
    assert.throws(() => applyJournaledMigration({ database, query, migration: retry, execute: () => assert.fail("must not replay") }), /replay refused/);
    const consumed = readReconciliations({ database, query }).find((row) => row.decision_id === "recovery-1");
    assert.ok(consumed.consumed_by);
    assert.throws(() => executeReconciliation({ database, query, plan: stalePlan }), /prior attempt changed/);
    Object.assign(a.entries[0], { decision_id: "recovery-2", prior_attempt: consumed.consumed_by, outcome: "verified_applied" });
    const appliedPlan = plan(a, { migrations: [retry], receipts: query(database, journalSql.read),
      appliedNames: [migration.name], decisions: readReconciliations({ database, query }) });
    executeReconciliation({ database, query, plan: appliedPlan });
    assert.deepEqual(inspectMigrationJournal({ database, query, migrations: [migration, retry], appliedNames: [migration.name, retry.name] }).pending, []);
    assert.equal(query(database, "SELECT COUNT(*) AS count FROM retried_business")[0].count, 0);
    assert.equal(readReconciliations({ database, query }).length, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
