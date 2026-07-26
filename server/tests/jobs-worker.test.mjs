import test from "node:test";
import assert from "node:assert/strict";
import jobs, { assertDomainEvent, resolveTenantCallback, sweepTenantMaintenance, tenantRouteIndexKey } from "../dist/apps/jobs-worker/src/index.js";

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

/** A ROUTES stand-in whose `list` pages, so pagination is actually exercised. */
function routesKv(entries, { pageSize = 1 } = {}) {
  const names = Object.keys(entries);
  return {
    async get(key) { return entries[key] ?? null; },
    async list({ prefix = "", cursor } = {}) {
      const matching = names.filter((name) => name.startsWith(prefix));
      const start = cursor ? Number(cursor) : 0;
      const slice = matching.slice(start, start + pageSize);
      const end = start + slice.length;
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: end >= matching.length,
        ...(end >= matching.length ? {} : { cursor: String(end) }),
      };
    },
  };
}

const activeRoute = (tenant) => JSON.stringify({
  tenant_id: tenant, worker_name: `cloudforge-tenant-${tenant}`, status: "active", routing_version: 1,
});

test("maintenance is driven for every active tenant, across KV pages", async () => {
  // The tenant Worker's own cron never fires: it lives in a dispatch namespace, which
  // is invoke-only. This sweep is the reason the outbox drains at all.
  const called = [];
  const kv = routesKv({
    [tenantRouteIndexKey("demo")]: activeRoute("demo"),
    [tenantRouteIndexKey("acme")]: activeRoute("acme"),
    // Must be skipped: draining a suspended tenant would emit events for an
    // account that is meant to be inert.
    [tenantRouteIndexKey("frozen")]: JSON.stringify({ tenant_id: "frozen", worker_name: "w", status: "suspended", routing_version: 1 }),
    // Not part of the tenant index, so the prefix must exclude it.
    "some.host.example": activeRoute("demo"),
  });
  const dispatcher = { get(name) {
    return { async fetch(url, init) {
      called.push({ name, url, method: init.method, authorization: init.headers.authorization, tenant: init.headers["x-cloudforge-tenant"] });
      return new Response("{}", { status: 200 });
    } };
  } };

  const result = await sweepTenantMaintenance({ ROUTES: kv, DISPATCHER: dispatcher, INTERNAL_SERVICE_TOKEN: "svc" });
  assert.deepEqual(result, { swept: 2, failed: 0 });
  assert.deepEqual(called.map((call) => call.name).sort(), ["cloudforge-tenant-acme", "cloudforge-tenant-demo"]);
  assert.equal(called[0].method, "POST");
  assert.match(called[0].url, /\/internal\/maintenance$/);
  assert.equal(called[0].authorization, "Bearer svc");
});

test("one unreachable tenant does not stop maintenance for the others", async () => {
  const kv = routesKv({
    [tenantRouteIndexKey("broken")]: activeRoute("broken"),
    [tenantRouteIndexKey("fine")]: activeRoute("fine"),
  });
  const dispatcher = { get(name) {
    return { async fetch() {
      if (name.endsWith("broken")) return new Response("nope", { status: 500 });
      return new Response("{}", { status: 200 });
    } };
  } };
  const result = await sweepTenantMaintenance({ ROUTES: kv, DISPATCHER: dispatcher, INTERNAL_SERVICE_TOKEN: "svc" });
  assert.deepEqual(result, { swept: 1, failed: 1 });
});

test("domain events are fully shape-validated before routing", () => {
  assert.equal(assertDomainEvent(event()).event_id, "evt-1");
  for (const bad of [null, {}, event({ schema_version: 2 }), event({ aggregate_version: 0 }), event({ payload: [] }), event({ command_id: "" })]) {
    assert.throws(() => assertDomainEvent(bad), /Invalid domain event/);
  }
});
