import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { D1MutationStore, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE documents (tenant_id TEXT,doctype TEXT,name TEXT,docstatus INTEGER,payload_json TEXT);
    CREATE TABLE master_records (tenant_id TEXT,record_type TEXT,name TEXT,disabled INTEGER,data_json TEXT);`);
  // Execute the real authority views; copying their SQL here would mask drift.
  for (const [file, view] of [
    ["0170_period_close_account_tombstone.sql", "finance_active_accounts"],
    ["0170_period_close_account_tombstone.sql", "finance_historical_accounts"],
  ]) {
    const sql = readFileSync(new URL(`../migrations/tenant/${file}`, import.meta.url), "utf8");
    const start = sql.indexOf(`CREATE VIEW ${view}`);
    assert.ok(start >= 0);
    db.exec(sql.slice(start, sql.indexOf(";", start) + 1));
  }
  const store = new D1MutationStore({
    prepare(sql) {
      return { bind(tenantId) {
        return { async all() { return { results: db.prepare(sql).all({ "1": tenantId }) }; } };
      } };
    },
  });
  return { db, store };
}

test("D1 and memory historical metadata agree on inactive overlays, classification and tenant scope", async () => {
  const { db, store } = fixture();
  const memory = new InMemoryMutationStore();
  const seedMaster = (tenant, name, data, disabled = 0) => {
    db.prepare("INSERT INTO master_records VALUES (?,'Account',?,?,?)")
      .run(tenant, name, disabled, JSON.stringify(data));
    memory.seedMaster("Account", name, tenant, { ...data, disabled });
  };
  const seedDocument = (tenant, name, data, docstatus = 0) => {
    db.prepare("INSERT INTO documents VALUES (?,'Account',?,?,?)")
      .run(tenant, name, docstatus, JSON.stringify(data));
    memory.seedDocument("Account", name, tenant, data, docstatus);
  };
  const data = { company: "Demo", root_type: "Income", is_group: 0 };
  seedMaster("demo", "Active Master", data);
  seedMaster("demo", "Disabled Master", data, 1);
  for (const [name, disabled, status] of [["Disabled Overlay", "1", 0], ["Cancelled Overlay", 0, 2]]) {
    seedMaster("demo", name, { ...data, root_type: "Asset" });
    seedDocument("demo", name, { ...data, disabled }, status);
  }
  seedDocument("demo", "Active Group", { ...data, is_group: 1 });
  seedDocument("other", "Foreign", data);
  seedDocument("demo", "String Disabled", { ...data, disabled: " TRUE " });
  seedDocument("demo", "String Group", { ...data, is_group: " true " });
  seedMaster("demo", "String Master Group", { ...data, is_group: "true" });
  const rows = await store.listFinanceAccountMetadata("demo");
  assert.deepEqual(rows, await memory.listFinanceAccountMetadata("demo"));
  assert.equal(rows.length, 8);
  assert.equal(rows.find((row) => row.name === "String Disabled").active, false);
  assert.equal(rows.find((row) => row.name === "String Group").is_group, true);
  assert.equal(rows.find((row) => row.name === "String Master Group").is_group, true);
  assert.equal(rows.find((row) => row.name === "Disabled Overlay").active, false);
  assert.equal(rows.find((row) => row.name === "Cancelled Overlay").root_type, "Income");
  assert.equal(rows.find((row) => row.name === "Active Group").is_group, true);
  assert.equal(rows.find((row) => row.name === "Active Master").active, true);
  db.close();
});
