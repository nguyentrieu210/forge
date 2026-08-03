import test from "node:test";
import assert from "node:assert/strict";
import control from "../dist/apps/control-plane-worker/src/index.js";

const TOKEN = "control-secret-token";

function mockDb(initialRoutes = []) {
  const routes = initialRoutes.map((route) => ({ ...route }));
  const audit = [];

  function bound(sql, values) {
    return {
      _sql: sql,
      _values: values,
      async first() {
        if (sql.includes("FROM tenant_routes WHERE route_key=?1")) {
          return routes.find((route) => route.route_key === values[0]) ?? null;
        }
        if (sql.includes("FROM tenant_routes WHERE tenant_id=?1")) {
          return routes.find((route) => route.tenant_id === values[0]) ?? null;
        }
        return null;
      },
      async all() {
        if (sql.includes("FROM control_route_audit_events")) {
          const [tenantId, maybeBefore, maybeLimit] = values;
          const hasBefore = sql.includes("created_at<?2");
          const before = hasBefore ? maybeBefore : null;
          const limit = Number(hasBefore ? maybeLimit : maybeBefore);
          return {
            results: audit
              .filter((event) => event.tenant_id === tenantId && (!before || event.created_at < before))
              .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.event_id.localeCompare(left.event_id))
              .slice(0, limit),
          };
        }
        if (sql.includes("FROM tenant_routes WHERE tenant_id>?1")) {
          const [after, limit] = values;
          return { results: routes.filter((route) => route.tenant_id > after).sort((a, b) => a.tenant_id.localeCompare(b.tenant_id)).slice(0, limit) };
        }
        return { results: [] };
      },
      async run() { return { success: true, meta: { changes: 1 } }; },
    };
  }

  const database = {
    routes,
    audit,
    prepare(sql) {
      return { bind(...values) { return bound(sql, values); } };
    },
    async batch(statements) {
      for (const statement of statements) {
        const sql = statement._sql;
        const values = statement._values;
        if (sql.startsWith("DELETE FROM tenant_routes")) {
          const index = routes.findIndex((route) => route.route_key === values[0]);
          if (index >= 0) routes.splice(index, 1);
          continue;
        }
        if (sql.includes("INSERT INTO tenant_routes")) {
          const [route_key, tenant_id, worker_name, status, plan, routing_version, modified_at] = values;
          const row = { route_key, tenant_id, worker_name, status, plan, routing_version, modified_at };
          const index = routes.findIndex((route) => route.route_key === route_key);
          if (index >= 0) routes[index] = row;
          else routes.push(row);
          continue;
        }
        if (sql.includes("INSERT INTO control_route_audit_events")) {
          const [event_id, trace_id, action, tenant_id, route_key, reason, before_json, after_json, created_at] = values;
          audit.push({ event_id, trace_id, actor_key: "control-token", action, tenant_id, route_key, reason, before_json, after_json, created_at });
        }
      }
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
  return database;
}

function mockKv() {
  const store = {};
  return { store, async put(k, v) { store[k] = v; }, async get(k) { return store[k] ?? null; }, async delete(k) { delete store[k]; } };
}

function env(extra = {}) {
  return { CONTROL_TOKEN: TOKEN, CONTROL_DB: mockDb(), ROUTES: mockKv(), ...extra };
}

function put(routeKey, body, { token = TOKEN, contentType = "application/json" } = {}) {
  return new Request(`https://control.test/v1/routes/${routeKey}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const DEMO_ROUTE = {
  tenant_id: "demo",
  worker_name: "cloudforge-tenant-demo",
  status: "active",
  plan: "pro",
  reason: "tenant provisioning workflow",
};

test("public signup hashes credentials, encrypts the pending payload and never returns a verification token", async () => {
  const inserts = [];
  const database = {
    prepare(sql) {
      return { bind(...values) { return {
        async first() {
          if (sql.includes("COUNT(*)")) return { total: 0 };
          return null;
        },
        async run() { inserts.push({ sql, values }); return { success: true, meta: { changes: 1 } }; },
      }; } };
    },
  };
  const request = new Request("https://control.test/v1/public/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify({ shop_name: "Mộc Store", email: "Owner@Example.com", password: "StrongPass123", desired_slug: "moc-store", accepted_terms: true }),
  });
  const response = await control.fetch(request, env({
    CONTROL_DB: database,
    SIGNUP_DATA_KEY: Buffer.alloc(32, 7).toString("base64"),
    SIGNUP_LOOKUP_SECRET: "signup-lookup-secret-for-tests",
  }));
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.status, "pending_verification");
  assert.equal(body.desired_hostname, "moc-store.kairo.vn");
  assert.equal("verification_token" in body, false);
  const signupInsert = inserts.find((entry) => entry.sql.includes("INSERT INTO signup_verifications"));
  assert.ok(signupInsert);
  assert.equal(signupInsert.values.includes("StrongPass123"), false);
  assert.equal(JSON.stringify(signupInsert.values).includes("owner@example.com"), false);
});

test("public signup fails closed until its encryption secrets are configured", async () => {
  const request = new Request("https://control.test/v1/public/signup", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
  });
  const response = await control.fetch(request, env());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "SIGNUP_NOT_CONFIGURED");
});

test("public signup enforces its password floor on the server", async () => {
  const request = new Request("https://control.test/v1/public/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shop_name: "Mộc Store", email: "owner@example.com", password: "short", accepted_terms: true }),
  });
  const response = await control.fetch(request, env({
    SIGNUP_DATA_KEY: Buffer.alloc(32, 7).toString("base64"),
    SIGNUP_LOOKUP_SECRET: "signup-lookup-secret-for-tests",
  }));
  assert.equal(response.status, 422);
});

test("control plane rejects a wrong control token", async () => {
  const res = await control.fetch(put("demo.example.com", DEMO_ROUTE, { token: "nope" }), env());
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "CONTROL_AUTH_REQUIRED");
});

test("control plane rejects invalid route status and unbounded/non-json bodies", async () => {
  const bad = await control.fetch(put("demo.example.com", { ...DEMO_ROUTE, status: "bogus" }), env());
  assert.equal(bad.status, 422);
  assert.equal((await bad.json()).error.code, "VALIDATION_ERROR");

  const notJson = await control.fetch(put("demo.example.com", "not json", { contentType: "text/plain" }), env());
  assert.equal(notJson.status, 422);

  const missingField = await control.fetch(put("demo.example.com", { tenant_id: "demo", status: "active", reason: "broken input" }), env());
  assert.equal(missingField.status, 422);
});

test("control plane provisions a valid route, reverse index and immutable audit evidence", async () => {
  const e = env();
  const res = await control.fetch(put("demo.example.com", DEMO_ROUTE), e);
  assert.equal(res.status, 200);
  const stored = JSON.parse(e.ROUTES.store["demo.example.com"]);
  assert.equal(stored.tenant_id, "demo");
  assert.equal(stored.worker_name, "cloudforge-tenant-demo");
  assert.equal(stored.routing_version, 1);
  assert.deepEqual(JSON.parse(e.ROUTES.store["__tenant__:demo"]), stored);
  assert.equal(e.CONTROL_DB.audit.length, 1);
  assert.equal(e.CONTROL_DB.audit[0].action, "route.create");
  assert.equal(e.CONTROL_DB.audit[0].reason, "tenant provisioning workflow");
  assert.equal(JSON.parse(e.CONTROL_DB.audit[0].after_json).plan, "pro");
});

test("idempotent route replay neither bumps version nor creates duplicate audit", async () => {
  const initial = { route_key: "demo.example.com", ...DEMO_ROUTE, routing_version: 4, modified_at: "2026-08-03T00:00:00.000Z" };
  delete initial.reason;
  const database = mockDb([initial]);
  const e = env({ CONTROL_DB: database });
  const res = await control.fetch(put("demo.example.com", {
    tenant_id: initial.tenant_id,
    worker_name: initial.worker_name,
    status: initial.status,
    plan: initial.plan,
  }), e);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { route_key: "demo.example.com", routing_version: 4, unchanged: true });
  assert.equal(database.audit.length, 0);
  assert.equal(database.routes[0].routing_version, 4);
});

test("effective route changes require reason and preserve the current plan when omitted", async () => {
  const initial = { route_key: "demo.example.com", tenant_id: "demo", worker_name: "worker-v1", status: "active", plan: "enterprise", routing_version: 3 };
  const database = mockDb([initial]);
  const e = env({ CONTROL_DB: database });
  const blocked = await control.fetch(put("demo.example.com", {
    tenant_id: "demo", worker_name: "worker-v2", status: "active",
  }), e);
  assert.equal(blocked.status, 422);
  assert.equal(database.routes[0].worker_name, "worker-v1");
  assert.equal(database.routes[0].plan, "enterprise");
});

test("suspend/reactivate are governed transitions with auditable reasons", async () => {
  const initial = { route_key: "demo.example.com", tenant_id: "demo", worker_name: "worker", status: "active", plan: "pro", routing_version: 5 };
  const database = mockDb([initial]);
  const e = env({ CONTROL_DB: database });

  const suspended = await control.fetch(put("demo.example.com", {
    tenant_id: "demo", worker_name: "worker", status: "suspended", plan: "pro", reason: "security incident containment",
  }), e);
  assert.equal(suspended.status, 200);
  assert.equal(JSON.parse(e.ROUTES.store["demo.example.com"]).status, "suspended");
  assert.equal(database.audit.at(-1).action, "tenant.suspend");

  const reactivated = await control.fetch(put("demo.example.com", {
    tenant_id: "demo", worker_name: "worker", status: "active", plan: "pro", reason: "incident resolved and reviewed",
  }), e);
  assert.equal(reactivated.status, 200);
  assert.equal(JSON.parse(e.ROUTES.store["demo.example.com"]).status, "active");
  assert.equal(database.audit.at(-1).action, "tenant.reactivate");

  const rewind = await control.fetch(put("demo.example.com", {
    tenant_id: "demo", worker_name: "worker", status: "provisioning", plan: "pro", reason: "invalid rewind",
  }), e);
  assert.equal(rewind.status, 422);
});

test("hostname move keeps routing version monotonic and removes the stale KV key", async () => {
  const initial = { route_key: "old.example.com", tenant_id: "demo", worker_name: "worker", status: "active", plan: "pro", routing_version: 9 };
  const database = mockDb([initial]);
  const e = env({ CONTROL_DB: database });
  e.ROUTES.store["old.example.com"] = JSON.stringify(initial);
  const response = await control.fetch(put("new.example.com", {
    tenant_id: "demo", worker_name: "worker", status: "active", plan: "pro", reason: "approved domain change",
  }), e);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).routing_version, 10);
  assert.equal(e.ROUTES.store["old.example.com"], undefined);
  assert.equal(JSON.parse(e.ROUTES.store["new.example.com"]).routing_version, 10);
  assert.equal(database.audit.at(-1).action, "route.move");
});

test("route audit evidence can be queried per tenant with parsed before/after snapshots", async () => {
  const database = mockDb();
  const e = env({ CONTROL_DB: database });
  await control.fetch(put("demo.example.com", DEMO_ROUTE), e);
  const response = await control.fetch(new Request("https://control.test/v1/audit/routes?tenant_id=demo&limit=10", {
    headers: { authorization: `Bearer ${TOKEN}` },
  }), e);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].before, null);
  assert.equal(body.events[0].after.tenant_id, "demo");
  assert.equal(body.events[0].reason, "tenant provisioning workflow");
});

test("control plane rebuilds the reverse tenant index in bounded pages", async () => {
  const rows = [
    { route_key: "a.example.com", tenant_id: "a", worker_name: "tenant-a", status: "active", plan: "pro", routing_version: 2 },
    { route_key: "b.example.com", tenant_id: "b", worker_name: "tenant-b", status: "suspended", plan: "free", routing_version: 4 },
    { route_key: "c.example.com", tenant_id: "c", worker_name: "tenant-c", status: "active", plan: "enterprise", routing_version: 1 },
  ];
  const e = env({ CONTROL_DB: mockDb(rows) });
  const request = new Request("https://control.test/v1/routes/rebuild-index", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ limit: 2 }),
  });
  const response = await control.fetch(request, e);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { rebuilt: 2, next_after_tenant_id: "b" });
  assert.equal(JSON.parse(e.ROUTES.store["__tenant__:a"]).worker_name, "tenant-a");
  assert.equal(JSON.parse(e.ROUTES.store["__tenant__:b"]).status, "suspended");
  assert.equal(e.ROUTES.store["__tenant__:c"], undefined);
});
