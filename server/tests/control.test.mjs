import test from "node:test";
import assert from "node:assert/strict";
import control from "../dist/apps/control-plane-worker/src/index.js";

const TOKEN = "control-secret-token";

function mockDb(existingVersion = null) {
  return {
    prepare() {
      return {
        bind() {
          return {
            async first() { return existingVersion === null ? null : { routing_version: existingVersion }; },
            async run() { return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
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

test("control plane rejects a wrong control token", async () => {
  const res = await control.fetch(put("demo.example.com", { tenant_id: "demo", worker_name: "w", status: "active" }, { token: "nope" }), env());
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "CONTROL_AUTH_REQUIRED");
});

test("control plane rejects invalid route status and unbounded/non-json bodies", async () => {
  const bad = await control.fetch(put("demo.example.com", { tenant_id: "demo", worker_name: "w", status: "bogus" }), env());
  assert.equal(bad.status, 422);
  assert.equal((await bad.json()).error.code, "VALIDATION_ERROR");

  const notJson = await control.fetch(put("demo.example.com", "not json", { contentType: "text/plain" }), env());
  assert.equal(notJson.status, 422);

  const missingField = await control.fetch(put("demo.example.com", { tenant_id: "demo", status: "active" }), env());
  assert.equal(missingField.status, 422);
});

test("control plane provisions a valid route into KV with an incrementing version", async () => {
  const e = env();
  const res = await control.fetch(put("demo.example.com", { tenant_id: "demo", worker_name: "cloudforge-tenant-demo", status: "active", plan: "pro" }), e);
  assert.equal(res.status, 200);
  const stored = JSON.parse(e.ROUTES.store["demo.example.com"]);
  assert.equal(stored.tenant_id, "demo");
  assert.equal(stored.worker_name, "cloudforge-tenant-demo");
  assert.equal(stored.routing_version, 1);
  assert.deepEqual(JSON.parse(e.ROUTES.store["__tenant__:demo"]), stored);
});

test("control plane rebuilds the reverse tenant index in bounded pages", async () => {
  const rows = [
    { tenant_id: "a", worker_name: "tenant-a", status: "active", plan: "pro", routing_version: 2 },
    { tenant_id: "b", worker_name: "tenant-b", status: "suspended", plan: "free", routing_version: 4 },
    { tenant_id: "c", worker_name: "tenant-c", status: "active", plan: "enterprise", routing_version: 1 },
  ];
  const e = env({
    CONTROL_DB: {
      prepare(sql) {
        assert.match(sql, /FROM tenant_routes/);
        return { bind(after, limit) { return { async all() { return { results: rows.filter((row) => row.tenant_id > after).slice(0, limit) }; } }; } };
      },
    },
  });
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
