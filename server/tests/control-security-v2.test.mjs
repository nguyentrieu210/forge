import test from "node:test";
import assert from "node:assert/strict";
import controlV2 from "../dist/apps/control-plane-worker/src/index-v2b.js";

const ACCOUNT = "a".repeat(32);
const SOURCE_SHA = "b".repeat(40);
const PROVIDER_TOKEN = "provider-token";
const CONTROL_TOKEN = "c".repeat(43);
const AUTH_MASTER = "d".repeat(43);
const SERVICE_MASTER = "e".repeat(43);

function mockDb() {
  const state = {
    providerAccount: null,
    profiles: new Map(),
    routes: new Map(),
    securityAudit: [],
    routeAudit: [],
  };

  function statement(sql, values = []) {
    return {
      _sql: sql,
      _values: values,
      bind(...next) { return statement(sql, next); },
      async first() {
        if (sql.includes("FROM provider_authority")) {
          return state.providerAccount ? { account_id: state.providerAccount } : null;
        }
        if (sql.includes("FROM tenant_security_profiles")) {
          return state.profiles.get(values[0]) ?? null;
        }
        if (sql.includes("SELECT status FROM tenant_routes")) {
          return state.routes.get([...state.routes.keys()].find((key) => state.routes.get(key)?.tenant_id === values[0])) ?? null;
        }
        if (sql.includes("FROM tenant_routes WHERE route_key=?1")) return state.routes.get(values[0]) ?? null;
        if (sql.includes("FROM tenant_routes WHERE tenant_id=?1")) {
          return [...state.routes.values()].find((row) => row.tenant_id === values[0]) ?? null;
        }
        return null;
      },
      async run() {
        if (sql.includes("INSERT INTO provider_authority")) {
          state.providerAccount = values[1];
          return { success: true, meta: { changes: 1 } };
        }
        if (sql.includes("INSERT INTO tenant_security_profile_audit_events")) {
          state.securityAudit.push({ sql, values });
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 1 } };
      },
      async all() { return { results: [] }; },
    };
  }

  return {
    state,
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      for (const item of statements) {
        const sql = item._sql;
        const values = item._values;
        if (sql.includes("INSERT INTO tenant_security_profiles")) {
          const [tenant_id, generation, key_id, worker_name, source_sha, modified_at] = values;
          state.profiles.set(tenant_id, { tenant_id, generation, key_id, worker_name, source_sha, modified_at });
        } else if (sql.includes("INSERT INTO tenant_security_profile_audit_events")) {
          state.securityAudit.push({ sql, values });
        } else if (sql.startsWith("DELETE FROM tenant_routes")) {
          state.routes.delete(values[0]);
        } else if (sql.includes("INSERT INTO tenant_routes")) {
          const [route_key, tenant_id, worker_name, status, plan, routing_version, modified_at] = values;
          state.routes.set(route_key, { route_key, tenant_id, worker_name, status, plan, routing_version, modified_at });
        } else if (sql.includes("INSERT INTO control_route_audit_events")) {
          state.routeAudit.push({ sql, values });
        }
      }
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
}

function mockKv() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.get(key) ?? null; },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); },
  };
}

function request(pathname, method, body, account = ACCOUNT) {
  return new Request(`https://control.test${pathname}`, {
    method,
    headers: { authorization: `Bearer ${PROVIDER_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ account_id: account, ...body }),
  });
}

test("provider broker provisions V2 secrets before route and retry is idempotent", async () => {
  const db = mockDb();
  const kv = mockKv();
  const secretNames = new Set();
  const secretPuts = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/workers/scripts/cloudforge-gateway/settings")) {
      return Response.json({ success: true, result: { bindings: [] } });
    }
    if (url.includes("/workers/dispatch/namespaces/cloudforge-production/scripts/cloudforge-tenant-thuy/secrets")) {
      if ((init.method ?? "GET") === "GET") {
        return Response.json({ success: true, result: [...secretNames].map((name) => ({ name, type: "secret_text" })) });
      }
      if (init.method === "PUT") {
        const body = JSON.parse(String(init.body));
        secretNames.add(body.name);
        secretPuts.push({ name: body.name, text: body.text });
        return Response.json({ success: true, result: { name: body.name, type: "secret_text" } });
      }
    }
    throw new Error(`unexpected provider fetch ${init.method ?? "GET"} ${url}`);
  };

  const env = {
    CONTROL_DB: db,
    ROUTES: kv,
    CONTROL_TOKEN,
    INTERNAL_AUTH_SECRET_V2: AUTH_MASTER,
    INTERNAL_SERVICE_TOKEN_V2: SERVICE_MASTER,
  };

  try {
    const bootstrap = await controlV2.fetch(request("/v1/provider/bootstrap", "POST", { source_sha: SOURCE_SHA }), env);
    assert.equal(bootstrap.status, 200);
    assert.equal(db.state.providerAccount, ACCOUNT);

    const provision = await controlV2.fetch(request("/v1/provider/tenant-secrets/thuy", "POST", {
      namespace: "cloudforge-production",
      worker_name: "cloudforge-tenant-thuy",
      source_sha: SOURCE_SHA,
    }), env);
    assert.equal(provision.status, 200);
    assert.deepEqual([...secretNames].sort(), ["INTERNAL_AUTH_SECRET", "INTERNAL_SERVICE_TOKEN", "SESSION_SECRET"]);
    assert.equal(secretPuts.length, 3);
    assert.equal(db.state.profiles.get("thuy").generation, 2);
    assert.equal(JSON.parse(kv.store.get("__security__:thuy")).key_id, "k2");
    assert.equal(kv.store.has("thuy.kairo.vn"), false, "security provisioning must not publish the public route");

    const retry = await controlV2.fetch(request("/v1/provider/tenant-secrets/thuy", "POST", {
      namespace: "cloudforge-production",
      worker_name: "cloudforge-tenant-thuy",
      source_sha: SOURCE_SHA,
    }), env);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).unchanged, true);
    assert.equal(secretPuts.length, 3, "idempotent retry must not rotate tenant credentials");

    const publish = await controlV2.fetch(request("/v1/provider/routes/thuy.kairo.vn", "PUT", {
      tenant_id: "thuy",
      worker_name: "cloudforge-tenant-thuy",
      status: "active",
      plan: "pro",
      reason: "V2 test route publication",
    }), env);
    assert.equal(publish.status, 200);
    assert.equal(JSON.parse(kv.store.get("thuy.kairo.vn")).tenant_id, "thuy");
    assert.equal(JSON.parse(kv.store.get("__tenant__:thuy")).status, "active");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider account authority is immutable through bootstrap", async () => {
  const db = mockDb();
  const kv = mockKv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: true, result: {} });
  try {
    const env = { CONTROL_DB: db, ROUTES: kv, CONTROL_TOKEN, INTERNAL_AUTH_SECRET_V2: AUTH_MASTER, INTERNAL_SERVICE_TOKEN_V2: SERVICE_MASTER };
    assert.equal((await controlV2.fetch(request("/v1/provider/bootstrap", "POST", { source_sha: SOURCE_SHA }), env)).status, 200);
    const wrong = await controlV2.fetch(request("/v1/provider/bootstrap", "POST", { source_sha: SOURCE_SHA }, "f".repeat(32)), env);
    assert.equal(wrong.status, 401);
    assert.equal(db.state.providerAccount, ACCOUNT);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
