import test from "node:test";
import assert from "node:assert/strict";
import { buildMigrationPlan, executeDurableMigrationPlan } from "../dist/packages/migration/src/public.js";

async function buildPlan() {
  return buildMigrationPlan({
    source_id: "customers",
    source_kind: "erpnext",
    target_doctype: "Customer",
    headers: ["name", "customer_name"],
    rows: [{ name: "C-1", customer_name: "Alpha" }],
    target_fields: ["customer_name"],
    key_field: "name",
    duplicate_policy: "error",
  });
}

function fakeJournal(plan, events, options = {}) {
  const rows = new Map();
  let state = "draft";
  return {
    async ensureRun() { return { run_id: plan.plan_id, state }; },
    async transitionRun(_tenant, _run, next) { state = next; events.push(`run:${next}`); return { run_id: plan.plan_id, state }; },
    async getRow(_tenant, _run, key) { return rows.get(key) ?? null; },
    async reserveRow(_tenant, _run, row, action, targetName) {
      events.push(`reserve:${row.row_key}:${targetName}`);
      const current = rows.get(row.row_key);
      const stored = current ?? {
        row_key: row.row_key, source_row_number: row.row_number, row_fingerprint: row.fingerprint,
        target_doctype: plan.target_doctype, target_name: targetName, intended_action: action,
        status: "reserved", command_id: null, command_payload_hash: null, document: row.document,
        error: null, attempt_count: 0, created_at: "t0", modified_at: "t0", staging_purged_at: null,
      };
      stored.target_name = targetName;
      stored.intended_action = action;
      stored.status = "reserved";
      rows.set(row.row_key, stored);
      return stored;
    },
    async markApplying(_tenant, _run, key, commandId, payloadHash) {
      events.push(`applying:${key}:${commandId}`);
      const row = rows.get(key);
      Object.assign(row, { status: "applying", command_id: commandId, command_payload_hash: payloadHash, attempt_count: row.attempt_count + 1 });
      return row;
    },
    async recordOutcome(_tenant, _run, outcome) {
      events.push(`outcome:${outcome.row_key}:${outcome.status}`);
      const row = rows.get(outcome.row_key);
      Object.assign(row, { status: outcome.status, target_name: outcome.target_name ?? row.target_name, error: outcome.error ?? null });
      return row;
    },
    async recordPreflightFailure(_tenant, _run, row, error) {
      events.push(`preflight:${row.row_key}`);
      const stored = {
        row_key: row.row_key, source_row_number: row.row_number, row_fingerprint: row.fingerprint,
        target_doctype: plan.target_doctype, target_name: null, intended_action: "error",
        status: "failed", command_id: null, command_payload_hash: null, document: row.document,
        error, attempt_count: 0, created_at: "t0", modified_at: "t0", staging_purged_at: null,
      };
      rows.set(row.row_key, stored);
      return stored;
    },
    async recoverApplyingRow(_tenant, _run, key) {
      events.push(`recover:${key}`);
      const row = rows.get(key);
      if (options.receiptCommitted) {
        row.status = row.intended_action === "update" ? "updated" : "imported";
        return { recovered: true, row, receipt: { command_id: row.command_id } };
      }
      return { recovered: false, row };
    },
  };
}

test("durable executor journals target and command before authoritative execute", async () => {
  const plan = await buildPlan();
  const events = [];
  const journal = fakeJournal(plan, events);
  const result = await executeDurableMigrationPlan({
    tenant_id: "demo",
    actor: "Administrator",
    now: () => "2026-08-03T12:00:00Z",
    plan,
    journal,
    port: {
      async lookup() { events.push("lookup"); return { exists: false }; },
      async prepareCreate(_plan, row) {
        events.push("prepare");
        return {
          target_name: row.row_key,
          command_id: "frappe-" + "a".repeat(40),
          payload_hash: "b".repeat(64),
          async execute() { events.push("execute"); },
        };
      },
      async prepareUpdate() { throw new Error("unused"); },
    },
  });
  assert.equal(result.imported, 1);
  assert.deepEqual(events, [
    "run:validated", "run:applying", "lookup", "prepare",
    "reserve:C-1:C-1", `applying:C-1:frappe-${"a".repeat(40)}`,
    "execute", "outcome:C-1:imported", "run:applied",
  ]);
});

test("durable executor recovers lost response from kernel receipt", async () => {
  const plan = await buildPlan();
  const events = [];
  const journal = fakeJournal(plan, events, { receiptCommitted: true });
  const result = await executeDurableMigrationPlan({
    tenant_id: "demo",
    actor: "Administrator",
    now: () => "2026-08-03T12:00:00Z",
    plan,
    journal,
    port: {
      async lookup() { return { exists: false }; },
      async prepareCreate(_plan, row) {
        return {
          target_name: row.row_key,
          command_id: "frappe-" + "c".repeat(40),
          payload_hash: "d".repeat(64),
          async execute() { events.push("execute:response-lost"); throw new Error("network response lost"); },
        };
      },
      async prepareUpdate() { throw new Error("unused"); },
    },
  });
  assert.equal(result.imported, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.recovered_from_receipt, 1);
  assert.equal(events.includes("recover:C-1"), true);
  assert.equal(events.at(-1), "run:applied");
});

test("durable executor marks retryable failure only after receipt lookup says no commit", async () => {
  const plan = await buildPlan();
  const events = [];
  const journal = fakeJournal(plan, events, { receiptCommitted: false });
  const result = await executeDurableMigrationPlan({
    tenant_id: "demo",
    actor: "Administrator",
    now: () => "2026-08-03T12:00:00Z",
    plan,
    journal,
    port: {
      async lookup() { return { exists: false }; },
      async prepareCreate(_plan, row) {
        return {
          target_name: row.row_key,
          command_id: "frappe-" + "e".repeat(40),
          payload_hash: "f".repeat(64),
          async execute() { throw new Error("validation failed before commit"); },
        };
      },
      async prepareUpdate() { throw new Error("unused"); },
    },
  });
  assert.equal(result.imported, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.recovered_from_receipt, 0);
  assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["failed"]);
  assert.equal(events.includes("recover:C-1"), true);
  assert.equal(events.at(-1), "run:failed");
});
