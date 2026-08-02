import test from "node:test";
import assert from "node:assert/strict";
import { buildMigrationPlan, executeMigrationPlan } from "../dist/packages/migration/src/public.js";

async function plan(policy = "error") {
  return buildMigrationPlan({
    source_id: "customers",
    source_kind: "erpnext",
    target_doctype: "Customer",
    headers: ["name", "customer_name"],
    rows: [
      { name: "C-1", customer_name: "Alpha" },
      { name: "C-2", customer_name: "Beta" },
      { name: "C-3", customer_name: "Gamma" },
    ],
    target_fields: ["customer_name"],
    key_field: "name",
    duplicate_policy: policy,
  });
}

test("orchestrator records partial success row by row", async () => {
  const migration = await plan("error");
  const persisted = [];
  const result = await executeMigrationPlan(migration, {
    async lookup(_plan, row) { return { exists: row.row_key === "C-2", ...(row.row_key === "C-2" ? { target_name: "C-2" } : {}) }; },
    async create(_plan, row) { return { target_name: row.row_key }; },
    async update() { throw new Error("should not update under error policy"); },
  }, {
    async record(_plan, outcome) { persisted.push(outcome); },
  });
  assert.equal(result.imported, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.processed, 3);
  assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["imported", "failed", "imported"]);
  assert.deepEqual(persisted.map((outcome) => outcome.row_key), ["C-1", "C-2", "C-3"]);
});

test("orchestrator applies explicit update duplicate policy", async () => {
  const migration = await plan("update");
  const calls = [];
  const result = await executeMigrationPlan(migration, {
    async lookup(_plan, row) { return { exists: row.row_key === "C-2", ...(row.row_key === "C-2" ? { target_name: "EXISTING-C-2" } : {}) }; },
    async create(_plan, row) { calls.push(`create:${row.row_key}`); return { target_name: row.row_key }; },
    async update(_plan, row, targetName) { calls.push(`update:${row.row_key}:${targetName}`); return { target_name: targetName }; },
  }, {
    async record() {},
  });
  assert.equal(result.imported, 2);
  assert.equal(result.updated, 1);
  assert.deepEqual(calls, ["create:C-1", "update:C-2:EXISTING-C-2", "create:C-3"]);
});

test("outcome sink failure stops immediately after uncertain side effect", async () => {
  const migration = await plan("error");
  const writes = [];
  await assert.rejects(() => executeMigrationPlan(migration, {
    async lookup() { return { exists: false }; },
    async create(_plan, row) { writes.push(row.row_key); return { target_name: row.row_key }; },
    async update() { throw new Error("unused"); },
  }, {
    async record(_plan, outcome) {
      if (outcome.row_key === "C-2") throw new Error("D1 unavailable");
    },
  }), /reconcile before retry/i);
  assert.deepEqual(writes, ["C-1", "C-2"]);
});

test("stop_on_error persists the failure then stops", async () => {
  const migration = await plan("error");
  const persisted = [];
  const result = await executeMigrationPlan(migration, {
    async lookup(_plan, row) { return row.row_key === "C-2" ? { exists: true, target_name: "C-2" } : { exists: false }; },
    async create(_plan, row) { return { target_name: row.row_key }; },
    async update() { throw new Error("unused"); },
  }, {
    async record(_plan, outcome) { persisted.push(outcome.row_key); },
  }, { stop_on_error: true });
  assert.equal(result.stopped_early, true);
  assert.equal(result.processed, 2);
  assert.deepEqual(persisted, ["C-1", "C-2"]);
});
