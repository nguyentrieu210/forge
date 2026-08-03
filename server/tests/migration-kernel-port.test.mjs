import test from "node:test";
import assert from "node:assert/strict";
import { KernelMigrationApplyPort } from "../dist/packages/migration/src/public.js";

const plan = { target_doctype: "Customer" };
const row = { row_key: "C-1" };

function command(overrides = {}) {
  return {
    schema_version: 1,
    command_id: "frappe-" + "a".repeat(40),
    tenant_id: "demo",
    aggregate: { doctype: "Customer", name: "C-1" },
    action: "create",
    expected_version: null,
    payload_hash: "b".repeat(64),
    document: { customer_name: "Alpha" },
    actor: { user_id: "Administrator", roles: ["System Manager"] },
    ...overrides,
  };
}

test("kernel migration port prepares without executing and validates receipt identity", async () => {
  const events = [];
  const preparedCommand = command();
  const port = new KernelMigrationApplyPort({
    async lookup() { return { exists: false }; },
    async prepareCreate() { events.push("prepare"); return preparedCommand; },
    async prepareUpdate() { throw new Error("unused"); },
    async runCommand(input) {
      events.push("run");
      return {
        command_id: input.command_id,
        tenant_id: input.tenant_id,
        actor_user_id: input.actor.user_id,
        aggregate: input.aggregate,
        aggregate_version: 1,
        payload_hash: input.payload_hash,
        committed_at: "2026-08-03T12:00:00Z",
        result: { name: input.aggregate.name },
      };
    },
  });
  const prepared = await port.prepareCreate(plan, row);
  assert.deepEqual(events, ["prepare"]);
  assert.equal(prepared.target_name, "C-1");
  await prepared.execute();
  assert.deepEqual(events, ["prepare", "run"]);
});

test("kernel migration port refuses update command without OCC version", async () => {
  const port = new KernelMigrationApplyPort({
    async lookup() { return { exists: true, target_name: "C-1" }; },
    async prepareCreate() { throw new Error("unused"); },
    async prepareUpdate() { return command({ action: "save", expected_version: null }); },
    async runCommand() { throw new Error("unused"); },
  });
  await assert.rejects(() => port.prepareUpdate(plan, row, "C-1"), /expected_version/);
});

test("kernel migration port rejects mismatched command receipts", async () => {
  const preparedCommand = command();
  const port = new KernelMigrationApplyPort({
    async lookup() { return { exists: false }; },
    async prepareCreate() { return preparedCommand; },
    async prepareUpdate() { throw new Error("unused"); },
    async runCommand(input) {
      return {
        command_id: input.command_id,
        tenant_id: input.tenant_id,
        actor_user_id: input.actor.user_id,
        aggregate: { doctype: "Customer", name: "WRONG" },
        aggregate_version: 1,
        payload_hash: input.payload_hash,
        committed_at: "2026-08-03T12:00:00Z",
        result: {},
      };
    },
  });
  const prepared = await port.prepareCreate(plan, row);
  await assert.rejects(() => prepared.execute(), /does not match prepared command target/);
});
