import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { AppRevisionStore } from "../dist/packages/app-registry/src/index.js";

class StatementAdapter {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  parameters() {
    if (!/\?\d+/.test(this.sql)) return this.args;
    return Object.fromEntries(this.args.map((value, index) => [String(index + 1), value]));
  }
  async first() {
    const parameters = this.parameters();
    return (Array.isArray(parameters) ? this.db.prepare(this.sql).get(...parameters) : this.db.prepare(this.sql).get(parameters)) ?? null;
  }
  async all() {
    const parameters = this.parameters();
    return { results: Array.isArray(parameters) ? this.db.prepare(this.sql).all(...parameters) : this.db.prepare(this.sql).all(parameters) };
  }
  async run() {
    const parameters = this.parameters();
    const result = Array.isArray(parameters) ? this.db.prepare(this.sql).run(...parameters) : this.db.prepare(this.sql).run(parameters);
    return { meta: { changes: Number(result.changes ?? 0) } };
  }
}

class D1Adapter {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec(`
      CREATE TABLE installed_apps (
        tenant_id TEXT NOT NULL, app_id TEXT NOT NULL, app_name TEXT NOT NULL, version TEXT NOT NULL,
        content_hash TEXT NOT NULL CHECK(length(content_hash)=64), manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
        installed_by TEXT NOT NULL, installed_at TEXT NOT NULL, modified_at TEXT NOT NULL,
        PRIMARY KEY(tenant_id,app_id)
      );
    `);
  }
  prepare(sql) { return new StatementAdapter(this.db, sql); }
  withSession() { return this; }
}

function pkg(version, label = "Thing") {
  return {
    id: "demo",
    name: "Demo",
    version,
    roles: [{ role: "Demo User" }],
    doctypes: [{
      name: "Thing", module: "Demo",
      fields: [{ fieldname: "title", label: "Title", fieldtype: "Data", required: true }],
      permissions: [{ role: "Demo User", read: true, write: true, create: true }], revision: 1,
    }],
    nav: [{ key: "Thing", label, kind: "doctype" }],
  };
}

function insertActive(db, version, manifest, hash, modifiedAt) {
  db.db.prepare(`INSERT INTO installed_apps(
    tenant_id,app_id,app_name,version,content_hash,manifest_json,installed_by,installed_at,modified_at
  ) VALUES(?,?,?,?,?,?,?,?,?)`).run("t", "demo", "Demo", version, hash, JSON.stringify(manifest), "admin", "2026-01-01T00:00:00Z", modifiedAt);
}

test("0049 seeds the active package and atomically records later package views", async () => {
  const db = new D1Adapter();
  insertActive(db, "1.0.0", pkg("1.0.0"), "a".repeat(64), "2026-01-01T00:00:00Z");
  db.db.exec(readFileSync(new URL("../migrations/tenant/0049_app_revision_history.sql", import.meta.url), "utf8"));

  assert.deepEqual(db.db.prepare("SELECT revision_no,version FROM app_revisions ORDER BY revision_no").all(), [
    { revision_no: 1, version: "1.0.0" },
  ]);

  db.db.prepare(`UPDATE installed_apps SET version=?,content_hash=?,manifest_json=?,modified_at=?
    WHERE tenant_id=? AND app_id=?`).run("2.0.0", "b".repeat(64), JSON.stringify(pkg("2.0.0", "Thing v2")), "2026-02-01T00:00:00Z", "t", "demo");
  assert.deepEqual(db.db.prepare("SELECT revision_no,version FROM app_revisions ORDER BY revision_no").all(), [
    { revision_no: 1, version: "1.0.0" },
    { revision_no: 2, version: "2.0.0" },
  ]);

  // Unrelated installed_apps edits do not manufacture package revisions.
  db.db.prepare("UPDATE installed_apps SET app_name='Demo renamed' WHERE tenant_id='t' AND app_id='demo'").run();
  assert.equal(db.db.prepare("SELECT count(*) AS n FROM app_revisions").get().n, 2);
});

test("AppRevisionStore lists active history and plans a safe presentation-only rollback", async () => {
  const db = new D1Adapter();
  insertActive(db, "1.0.0", pkg("1.0.0"), "a".repeat(64), "2026-01-01T00:00:00Z");
  db.db.exec(readFileSync(new URL("../migrations/tenant/0049_app_revision_history.sql", import.meta.url), "utf8"));
  db.db.prepare(`UPDATE installed_apps SET version=?,content_hash=?,manifest_json=?,modified_at=?
    WHERE tenant_id=? AND app_id=?`).run("2.0.0", "b".repeat(64), JSON.stringify(pkg("2.0.0", "Thing v2")), "2026-02-01T00:00:00Z", "t", "demo");

  const store = new AppRevisionStore(db);
  const history = await store.list("t", "demo");
  assert.deepEqual(history.map((entry) => [entry.revision_no, entry.version, entry.active]), [
    [2, "2.0.0", true],
    [1, "1.0.0", false],
  ]);
  assert.equal((await store.active("t", "demo")).revision_no, 2);
  assert.equal((await store.get("t", "demo", 1)).version, "1.0.0");

  const plan = await store.planRollback("t", "demo", 1);
  assert.equal(plan.active_revision_no, 2);
  assert.equal(plan.target_revision_no, 1);
  assert.equal(plan.automatable, true);
});

test("revision history records parser-materialization changes even at the same source hash/version", () => {
  const db = new D1Adapter();
  insertActive(db, "1.0.0", pkg("1.0.0"), "a".repeat(64), "2026-01-01T00:00:00Z");
  db.db.exec(readFileSync(new URL("../migrations/tenant/0049_app_revision_history.sql", import.meta.url), "utf8"));
  const reParsed = { ...pkg("1.0.0"), client: { home: { doctype: "Thing" } } };
  db.db.prepare(`UPDATE installed_apps SET manifest_json=?,modified_at=? WHERE tenant_id=? AND app_id=?`)
    .run(JSON.stringify(reParsed), "2026-01-02T00:00:00Z", "t", "demo");
  assert.equal(db.db.prepare("SELECT count(*) AS n FROM app_revisions").get().n, 2);
});
