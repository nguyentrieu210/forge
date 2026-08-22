import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { D1MutationStore } from "../dist/packages/document-kernel/src/d1-store.js";
import { D1DocumentListStore } from "../dist/packages/document-kernel/src/document-list.js";

class StatementAdapter {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  parameters() {
    if (!/\?\d+/.test(this.sql)) return this.args;
    return Object.fromEntries(this.args.map((value, index) => [String(index + 1), value]));
  }
  async first() {
    const values = this.parameters();
    return (Array.isArray(values) ? this.db.prepare(this.sql).get(...values) : this.db.prepare(this.sql).get(values)) ?? null;
  }
  async all() {
    const values = this.parameters();
    return { results: Array.isArray(values) ? this.db.prepare(this.sql).all(...values) : this.db.prepare(this.sql).all(values) };
  }
  async run() { throw new Error("read-only test"); }
}

class D1Adapter {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec(`
      CREATE TABLE documents (
        tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, doctype TEXT NOT NULL, name TEXT NOT NULL,
        owner TEXT NOT NULL, docstatus INTEGER NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL,
        created_at TEXT NOT NULL, modified_at TEXT NOT NULL, modified_by TEXT, amended_from TEXT,
        payload_json TEXT NOT NULL);
      CREATE TABLE document_children (
        tenant_id TEXT NOT NULL, parent_key TEXT NOT NULL, fieldname TEXT NOT NULL,
        child_doctype TEXT NOT NULL, row_id TEXT NOT NULL, idx INTEGER NOT NULL,
        payload_json TEXT NOT NULL);
      CREATE TABLE master_records (
        tenant_id TEXT NOT NULL, record_type TEXT NOT NULL, name TEXT NOT NULL,
        data_json TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, modified_at TEXT NOT NULL);
      CREATE TABLE roles (tenant_id TEXT, role TEXT, disabled INTEGER);
      CREATE TABLE users (tenant_id TEXT, user_id TEXT, full_name TEXT, email TEXT, enabled INTEGER);
      CREATE TABLE doctype_definitions (tenant_id TEXT, doctype TEXT, metadata_json TEXT, disabled INTEGER);
    `);
  }
  prepare(sql) { return new StatementAdapter(this.db, sql); }
  withSession() { return this; }
}

function seedDocument(adapter, name, data, docstatus = 0) {
  adapter.db.prepare("INSERT INTO documents VALUES ('demo',?,'Item',?,'operator',?,'Draft',1,'2026-08-22T00:00:00.000Z','2026-08-22T00:00:00.000Z','operator',NULL,?)")
    .run(`Item:${name}`, name, docstatus, JSON.stringify(data));
}

function seedMaster(adapter, name, data) {
  adapter.db.prepare("INSERT INTO master_records VALUES ('demo','Item',?,?,0,'2026-08-22T00:00:00.000Z')")
    .run(name, JSON.stringify(data));
}

function fixture() {
  const adapter = new D1Adapter();
  seedMaster(adapter, "OVERLAP", { item_name: "bản master cũ", marker: "master" });
  seedDocument(adapter, "OVERLAP", { item_name: "bản document mới", marker: "document" });
  seedMaster(adapter, "DISABLED-TOMBSTONE", { item_name: "không được hồi sinh" });
  seedDocument(adapter, "DISABLED-TOMBSTONE", { item_name: "đã ngừng", disabled: 1 });
  seedMaster(adapter, "CANCELLED-TOMBSTONE", { item_name: "không được hồi sinh" });
  seedDocument(adapter, "CANCELLED-TOMBSTONE", { item_name: "đã hủy" }, 2);
  seedMaster(adapter, "MASTER-ONLY", { item_name: "chỉ có master", marker: "master-only" });
  return new D1MutationStore(adapter);
}

test("documents thắng master_records và document ngừng/hủy là tombstone", async () => {
  const store = fixture();

  assert.equal((await store.getMasterRecordData("demo", "Item", "OVERLAP"))?.marker, "document");
  assert.equal(await store.hasMasterRecord("demo", "Item", "DISABLED-TOMBSTONE"), false);
  assert.equal(await store.getMasterRecordData("demo", "Item", "DISABLED-TOMBSTONE"), null);
  assert.equal(await store.hasMasterRecord("demo", "Item", "CANCELLED-TOMBSTONE"), false);
  assert.equal(await store.getMasterRecordData("demo", "Item", "CANCELLED-TOMBSTONE"), null);
  assert.equal((await store.getMasterRecordData("demo", "Item", "MASTER-ONLY"))?.marker, "master-only");

  const rows = await store.listMasterRecordData("demo", "Item");
  assert.deepEqual(rows.map((row) => row.name), ["MASTER-ONLY", "OVERLAP"]);
  assert.equal(rows.find((row) => row.name === "OVERLAP")?.data.marker, "document");

  const picker = await store.listMasterRecords("demo", "Item");
  assert.deepEqual(picker.map((row) => row.name), ["MASTER-ONLY", "OVERLAP"]);
  assert.equal(picker.find((row) => row.name === "OVERLAP")?.label, "bản document mới");
});

test("read API opens a master-only fixture as a canonical document while command lookup stays empty", async () => {
  const store = fixture();

  assert.equal(await store.getDocument("demo", "Item", "MASTER-ONLY"), null,
    "the command side must still see no document so the first edit can create an overlay");
  const readable = await store.getReadableDocument("demo", "Item", "MASTER-ONLY");
  assert.equal(readable?.name, "MASTER-ONLY");
  assert.equal(readable?.owner, "Administrator");
  assert.equal(readable?.version, 1);
  assert.equal(readable?.data.marker, "master-only");
  assert.deepEqual(readable?.children, []);
});

test("generic list/count expose the same union and keep document precedence", async () => {
  const adapter = new D1Adapter();
  seedMaster(adapter, "MASTER-ONLY", { item_name: "chỉ master" });
  seedMaster(adapter, "OVERLAP", { item_name: "master cũ" });
  seedDocument(adapter, "OVERLAP", { item_name: "document mới" });
  const store = new D1DocumentListStore(adapter);
  const definition = {
    doctype: "Item",
    table: "documents",
    fields: {
      name: { type: "string", source: { column: "name" } },
      docstatus: { type: "int", source: { column: "docstatus" } },
      version: { type: "int", source: { column: "version" } },
      modified_at: { type: "date", source: { column: "modified_at" } },
      item_name: { type: "string", source: { json: "$.item_name" } },
    },
    defaultFields: ["name", "item_name"],
    searchFields: ["name", "item_name"],
    filterFields: ["name", "item_name"],
    sortFields: ["name"],
    defaultSort: [{ field: "name", direction: "asc" }],
  };
  const request = { doctype: "Item", fields: ["name", "item_name"], limit: 20 };

  const page = await store.list("demo", request, definition);
  assert.deepEqual(page.rows.map((row) => [row.name, row.item_name]), [
    ["MASTER-ONLY", "chỉ master"],
    ["OVERLAP", "document mới"],
  ]);
  assert.equal(await store.count("demo", request, definition), 2);
});
