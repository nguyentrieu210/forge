import test from "node:test";
import assert from "node:assert/strict";
import jobs, { assertDomainEvent, resolveTenantCallback, tenantRouteIndexKey } from "../dist/apps/jobs-worker/src/index.js";

function event(overrides = {}) {
  return {
    event_id: "evt-1",
    event_type: "sales_order.submitted",
    tenant_id: "demo",
    aggregate: { doctype: "Sales Order", name: "SO-1" },
    aggregate_version: 2,
    actor: "Administrator",
    command_id: "cmd-1",
    occurred_at: "2026-07-25T00:00:00.000Z",
    schema_version: 1,
    payload: { action: "submit" },
    ...overrides,
  };
}

function db({ existing = false } = {}) {
  const inserts = [];
  return {
    inserts,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() { return existing && sql.includes("SELECT event_id") ? { event_id: values[1] } : null; },
            async run() { inserts.push({ sql, values }); return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
}

function message(body = event()) {
  return {
    body,
    attempts: 1,
    acked: false,
    retried: false,
    ack() { this.acked = true; },
    retry(options) { this.retried = options; },
  };
}

test("jobs resolves an active tenant through the reverse route index and dispatch namespace", async () => {
  const calls = [];
  const worker = { async fetch(_url, init) {
    calls.push(init);
    return new Response(JSON.stringify({ committed: true }), { status: 200, headers: { "x-cloudforge-event-committed": "evt-1" } });
  } };
  const kv = { async get(key) {
    assert.equal(key, tenantRouteIndexKey("demo"));
    return JSON.stringify({ tenant_id: "demo", worker_name: "cloudforge-tenant-demo", status: "active", routing_version: 3 });
  } };
  const dispatcher = { get(name) { assert.equal(name, "cloudforge-tenant-demo"); return worker; } };
  assert.equal(await resolveTenantCallback({ ROUTES: kv, DISPATCHER: dispatcher }, "demo"), worker);

  const database = db();
  const msg = message();
  await jobs.queue({ messages: [msg] }, { JOBS_DB: database, ROUTES: kv, DISPATCHER: dispatcher, INTERNAL_SERVICE_TOKEN: "service-token" });
  assert.equal(msg.acked, true);
  assert.equal(msg.retried, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.authorization, "Bearer service-token");
  assert.equal(calls[0].headers["x-cloudforge-tenant"], "demo");
  assert.equal(database.inserts.filter((x) => x.sql.includes("INSERT INTO processed_events")).length, 1);
});

test("jobs fails closed and retries when routing/callback confirmation is missing", async () => {
  for (const env of [
    { JOBS_DB: db(), INTERNAL_SERVICE_TOKEN: "token" },
    {
      JOBS_DB: db(), INTERNAL_SERVICE_TOKEN: "token",
      ROUTES: { async get() { return null; } }, DISPATCHER: { get() { throw new Error("must not dispatch"); } },
    },
    {
      JOBS_DB: db(), INTERNAL_SERVICE_TOKEN: "token",
      TENANT_CALLBACK: { async fetch() { return new Response("no", { status: 200 }); } },
    },
  ]) {
    const msg = message();
    await jobs.queue({ messages: [msg] }, env);
    assert.equal(msg.acked, false);
    assert.ok(msg.retried);
    assert.equal(env.JOBS_DB.inserts.filter((x) => x.sql.includes("INSERT INTO processed_events")).length, 0);
  }
});

test("jobs acknowledges a previously processed event without delivering it again", async () => {
  const msg = message();
  let fetched = false;
  await jobs.queue({ messages: [msg] }, {
    JOBS_DB: db({ existing: true }), INTERNAL_SERVICE_TOKEN: "token",
    TENANT_CALLBACK: { async fetch() { fetched = true; return new Response(); } },
  });
  assert.equal(msg.acked, true);
  assert.equal(fetched, false);
});

test("domain events are fully shape-validated before routing", () => {
  assert.equal(assertDomainEvent(event()).event_id, "evt-1");
  for (const bad of [null, {}, event({ schema_version: 2 }), event({ aggregate_version: 0 }), event({ payload: [] }), event({ command_id: "" })]) {
    assert.throws(() => assertDomainEvent(bad), /Invalid domain event/);
  }
});
