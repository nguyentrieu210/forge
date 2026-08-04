import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  APP_FACTORY_APPROVAL_PROCESS_DOCTYPE,
  AppFactoryApprovalRuntime,
} from "../dist/packages/app-registry/src/index.js";

class StatementAdapter {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  parameters() {
    if (!/\?\d+/.test(this.sql)) return this.args;
    return Object.fromEntries(this.args.map((value, index) => [String(index + 1), value]));
  }
  async first() {
    const params = this.parameters();
    return (Array.isArray(params) ? this.db.prepare(this.sql).get(...params) : this.db.prepare(this.sql).get(params)) ?? null;
  }
  async all() {
    const params = this.parameters();
    return { results: Array.isArray(params) ? this.db.prepare(this.sql).all(...params) : this.db.prepare(this.sql).all(params) };
  }
  async run() {
    const params = this.parameters();
    const result = Array.isArray(params) ? this.db.prepare(this.sql).run(...params) : this.db.prepare(this.sql).run(params);
    return { meta: { changes: Number(result.changes ?? 0) } };
  }
}

class D1Adapter {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys=ON");
    this.db.exec(readFileSync(new URL("../migrations/tenant/0114_app_factory_approval_runtime.sql", import.meta.url), "utf8"));
  }
  prepare(sql) { return new StatementAdapter(this.db, sql); }
  withSession() { return this; }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

const target = {
  tenant_id: "t1",
  doctype: "Expense Claim",
  name: "EXP-1",
  owner: "requester@example.com",
  docstatus: 0,
  status: "Draft",
  version: 4,
  created_at: "2026-08-04T00:00:00.000Z",
  modified_at: "2026-08-04T00:00:00.000Z",
  data: { company: "ACME", total: 100 },
  children: [],
};

const definition = {
  tenant_id: "t1",
  doctype: "App Factory Definition",
  name: "APP-DEF-00001",
  owner: "Administrator",
  docstatus: 0,
  status: "Active",
  version: 2,
  created_at: "2026-08-03T00:00:00.000Z",
  modified_at: "2026-08-03T00:00:00.000Z",
  data: {
    definition_key: "expense-approval",
    definition_kind: "Process",
    target_doctype: "Expense Claim",
    version_no: 2,
    effective_from: "2026-08-01",
    status: "Active",
    definition_json: {
      approval_plan: {
        schema_version: 1,
        stages: [{
          key: "finance",
          label: "Finance",
          mode: "quorum",
          quorum: 2,
          approvers: [{ role: "Finance Manager" }],
        }],
      },
      timer_plan: {
        schema_version: 1,
        stages: [{
          stage_key: "finance",
          due_after_minutes: 10,
          escalations: [{ key: "manager-alert", after_minutes: 20 }],
        }],
      },
    },
  },
  children: [],
};

function command({
  id,
  actor,
  action,
  expectedVersion,
  process = "PROC-1",
  payload,
  tenant = "t1",
  hash = "a".repeat(64),
}) {
  return {
    schema_version: 1,
    command_id: id,
    tenant_id: tenant,
    aggregate: { doctype: APP_FACTORY_APPROVAL_PROCESS_DOCTYPE, name: process },
    action,
    expected_version: expectedVersion,
    payload_hash: hash,
    document: payload,
    actor: { user_id: actor, roles: actor.startsWith("finance") ? ["Finance Manager"] : ["Employee"] },
  };
}

function harness() {
  const db = new D1Adapter();
  let currentTarget = structuredClone(target);
  const reader = {
    async getDocument(tenant, doctype, name) {
      if (tenant === currentTarget.tenant_id && doctype === currentTarget.doctype && name === currentTarget.name) return structuredClone(currentTarget);
      return null;
    },
    async listDocumentsByDoctype(tenant, doctype) {
      if (tenant === definition.tenant_id && doctype === "App Factory Definition") return [structuredClone(definition)];
      return [];
    },
  };
  const permissionCalls = [];
  const permissions = {
    async assert(request) { permissionCalls.push(request); },
  };
  let sodAllowed = true;
  let delegationAllowed = false;
  const security = {
    async checkSoD() { return { allowed: sodAllowed, conflicts: sodAllowed ? [] : [{ rule: "maker-checker" }] }; },
    async canActThroughDelegation() {
      return delegationAllowed ? { allowed: true, delegation: "DEL-1", grantor: "finance1@example.com" } : { allowed: false };
    },
  };
  return {
    db,
    runtime: new AppFactoryApprovalRuntime(db, reader, permissions, security),
    permissionCalls,
    changeTargetVersion(version) { currentTarget = { ...currentTarget, version }; },
    setSoD(allowed) { sodAllowed = allowed; },
    setDelegation(allowed) { delegationAllowed = allowed; },
  };
}

async function start(runtime, process = "PROC-1") {
  return runtime.execute(command({
    id: `start-${process}`,
    actor: "requester@example.com",
    action: "create",
    expectedVersion: null,
    process,
    payload: { definition_key: "expense-approval", target_doctype: "Expense Claim", target_name: "EXP-1" },
  }), "2026-08-04T01:00:00.000Z");
}

test("starts a version-pinned process and exposes read-only inspect state with timer evidence", async () => {
  const { db, runtime, permissionCalls } = harness();
  const created = await start(runtime);
  assert.equal(created.aggregate_version, 1);
  assert.equal(created.result.status, "pending");
  assert.equal(created.result.open_stage, "finance");
  assert.equal(created.result.timer.due_at, "2026-08-04T01:10:00.000Z");
  assert.equal(permissionCalls[0].action, "save");

  const inspected = await runtime.execute(command({
    id: "inspect-1",
    actor: "finance1@example.com",
    action: "save",
    expectedVersion: null,
    payload: { operation: "inspect" },
  }), "2026-08-04T01:15:00.000Z");
  assert.equal(inspected.aggregate_version, 1);
  assert.equal(inspected.result.target_changed, false);
  assert.equal(inspected.result.timer.overdue, true);
  assert.deepEqual(inspected.result.timer.due_events.map((event) => event.event_key), ["finance:due"]);
  assert.equal(db.db.prepare("SELECT count(*) AS n FROM app_factory_approval_commands").get().n, 1, "inspect does not manufacture a mutation receipt");
});

test("two distinct actors satisfy one quorum role and retries replay exactly once", async () => {
  const { db, runtime } = harness();
  await start(runtime);
  const firstCommand = command({
    id: "vote-1",
    actor: "finance1@example.com",
    action: "save",
    expectedVersion: 1,
    payload: { decision: "approve", matched_approver: "role:Finance Manager" },
    hash: "b".repeat(64),
  });
  const first = await runtime.execute(firstCommand, "2026-08-04T01:02:00.000Z");
  assert.equal(first.aggregate_version, 2);
  assert.equal(first.result.status, "pending");

  const replay = await runtime.execute(firstCommand, "2026-08-04T01:03:00.000Z");
  assert.deepEqual(replay, first);
  assert.equal(db.db.prepare("SELECT count(*) AS n FROM app_factory_approval_decisions").get().n, 1);

  const second = await runtime.execute(command({
    id: "vote-2",
    actor: "finance2@example.com",
    action: "save",
    expectedVersion: 2,
    payload: { decision: "approve", matched_approver: "role:Finance Manager" },
    hash: "c".repeat(64),
  }), "2026-08-04T01:04:00.000Z");
  assert.equal(second.aggregate_version, 3);
  assert.equal(second.result.status, "approved");
  assert.equal(second.result.open_stage, null);
  assert.equal(db.db.prepare("SELECT status FROM app_factory_approval_processes WHERE tenant_id='t1' AND process_id='PROC-1'").get().status, "approved");
});

test("rejects stale process versions and target drift before persisting a decision", async () => {
  const { db, runtime, changeTargetVersion } = harness();
  await start(runtime);
  await assert.rejects(() => runtime.execute(command({
    id: "stale",
    actor: "finance1@example.com",
    action: "save",
    expectedVersion: 9,
    payload: { decision: "approve", matched_approver: "role:Finance Manager" },
  }), "2026-08-04T01:02:00.000Z"), /version changed/);

  changeTargetVersion(5);
  await assert.rejects(() => runtime.execute(command({
    id: "target-drift",
    actor: "finance1@example.com",
    action: "save",
    expectedVersion: 1,
    payload: { decision: "approve", matched_approver: "role:Finance Manager" },
  }), "2026-08-04T01:03:00.000Z"), /restart approval/);
  assert.equal(db.db.prepare("SELECT count(*) AS n FROM app_factory_approval_decisions").get().n, 0);
});

test("fails closed on SoD and accepts role delegation only when existing security authority proves it", async () => {
  const h = harness();
  await start(h.runtime);
  h.setSoD(false);
  await assert.rejects(() => h.runtime.execute(command({
    id: "sod-blocked",
    actor: "finance1@example.com",
    action: "save",
    expectedVersion: 1,
    payload: { decision: "approve", matched_approver: "role:Finance Manager" },
  }), "2026-08-04T01:02:00.000Z"), /Segregation-of-duties/);

  h.setSoD(true);
  h.setDelegation(true);
  const delegatedActor = command({
    id: "delegated",
    actor: "delegate@example.com",
    action: "save",
    expectedVersion: 1,
    payload: { decision: "approve", matched_approver: "role:Finance Manager" },
  });
  delegatedActor.actor.roles = ["Employee"];
  const result = await h.runtime.execute(delegatedActor, "2026-08-04T01:03:00.000Z");
  assert.equal(result.result.delegation_id, "DEL-1");
});

test("command id cannot be reused with a different payload and only one pending process may govern a target", async () => {
  const { runtime } = harness();
  await start(runtime, "PROC-1");
  const vote = command({
    id: "vote-unique",
    actor: "finance1@example.com",
    action: "save",
    expectedVersion: 1,
    payload: { decision: "approve", matched_approver: "role:Finance Manager" },
    hash: "d".repeat(64),
  });
  await runtime.execute(vote, "2026-08-04T01:02:00.000Z");
  await assert.rejects(() => runtime.execute({ ...vote, payload_hash: "e".repeat(64) }, "2026-08-04T01:03:00.000Z"), /already used/);

  await assert.rejects(() => start(runtime, "PROC-2"), /UNIQUE|constraint/i);
});
