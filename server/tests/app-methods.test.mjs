import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_METHOD_TIMEOUT_MS,
  appMethodTarget,
  dispatchAppMethod,
} from "../dist/packages/app-registry/src/index.js";
import { deriveAppCallKey, IDENTITY_HEADER, IDENTITY_SIGNATURE_HEADER } from "../dist/packages/auth/src/index.js";

/**
 * An app calling its own API method, in-request.
 *
 * This is the seam that replaces `@frappe.whitelist()`. Before it, an app could only
 * react to events after commit, so anything a screen needed to ASK — a computed total,
 * a button's action, a business query — had to become platform code.
 */
const MASTER = "platform-master-secret-value-0123456789";
const ACTOR = { user_id: "an@example.com", roles: ["HR Manager"] };

function installed(overrides = []) {
  return [
    { app_id: "hrm", worker: "app-hrm", ...overrides[0] },
    { app_id: "quiet", worker: null },
  ];
}

function dispatcherThat(handler, seen = {}) {
  return {
    seen,
    get(name, _args, options) {
      seen.worker = name;
      seen.limits = options?.limits;
      return { fetch: (url, init) => { seen.url = url; seen.init = init; return handler(url, init); } };
    },
  };
}

const ok = (body) => async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

// ---- which app owns a method -------------------------------------------------

test("a method belongs to the app whose id is its first segment", () => {
  assert.deepEqual(appMethodTarget(installed(), "hrm.api.leave_balance"), { appId: "hrm", worker: "app-hrm" });
  assert.deepEqual(appMethodTarget(installed(), "hrm.anything"), { appId: "hrm", worker: "app-hrm" });
});

test("no app can claim a method outside its own namespace", () => {
  // The platform's own namespaces are handled before this is ever reached, but an app
  // must not be able to answer for another app either.
  assert.equal(appMethodTarget(installed(), "payroll.api.run"), null);
  assert.equal(appMethodTarget(installed(), "frappe.client.get_list"), null);
  assert.equal(appMethodTarget(installed(), "metaforge.api.get_boot"), null);
});

test("an app with no worker owns no methods", () => {
  // Otherwise a data-only app would turn every `quiet.*` call into a dispatch error
  // instead of the honest "not implemented on this platform".
  assert.equal(appMethodTarget(installed(), "quiet.api.thing"), null);
});

test("a method with no namespace belongs to nobody", () => {
  for (const name of ["ping", ".leading", ""]) assert.equal(appMethodTarget(installed(), name), null);
});

// ---- what the app receives ---------------------------------------------------

test("the app receives the caller's identity, signed, and its own derived credential", async () => {
  const seen = {};
  const result = await dispatchAppMethod({
    env: { DISPATCHER: dispatcherThat(ok({ message: { balance: 12 } }), seen), INTERNAL_AUTH_SECRET: MASTER },
    tenantId: "acme",
    target: { appId: "hrm", worker: "app-hrm" },
    methodName: "hrm.api.leave_balance",
    args: { employee: "NV-2026-0001" },
    actor: ACTOR,
    traceId: "trace-1",
  });

  assert.deepEqual(result.value, { balance: 12 });
  assert.equal(seen.worker, "app-hrm");
  assert.deepEqual(JSON.parse(seen.init.body), { method: "hrm.api.leave_balance", args: { employee: "NV-2026-0001" } });

  // Proves the platform is calling — and nothing more. NOT the platform's internal
  // service token, which would let the app call into platform internals as the platform.
  assert.equal(seen.init.headers.authorization, `Bearer ${await deriveAppCallKey(MASTER, "acme", "hrm")}`);

  // The caller's identity, so the app knows who it is acting for.
  assert.ok(seen.init.headers[IDENTITY_HEADER], "identity is forwarded");
  assert.ok(seen.init.headers[IDENTITY_SIGNATURE_HEADER], "identity is signed");
  const identity = JSON.parse(Buffer.from(seen.init.headers[IDENTITY_HEADER], "base64url").toString("utf8"));
  assert.equal(identity.actor.user_id, ACTOR.user_id);
  assert.equal(identity.tenant_id, "acme");
  // Short-lived: the app holds a credential for this user, so it must expire with the
  // call rather than become a bearer token sitting in third-party code.
  assert.ok(identity.expires_at - identity.issued_at <= Math.ceil(APP_METHOD_TIMEOUT_MS / 1000) + 5);
});

test("the app never receives the user's session cookie", async () => {
  const seen = {};
  await dispatchAppMethod({
    env: { DISPATCHER: dispatcherThat(ok({ message: null }), seen), INTERNAL_AUTH_SECRET: MASTER },
    tenantId: "acme", target: { appId: "hrm", worker: "app-hrm" },
    methodName: "hrm.api.x", args: {}, actor: ACTOR, traceId: "t",
  });
  // A replayable cookie would let the app act as this user everywhere, for the cookie's
  // whole lifetime, instead of for this one call.
  assert.equal(seen.init.headers.cookie, undefined);
  assert.equal(seen.init.headers["x-frappe-csrf-token"], undefined);
});

test("an app runs on its own CPU budget", async () => {
  const seen = {};
  await dispatchAppMethod({
    env: { DISPATCHER: dispatcherThat(ok({}), seen), INTERNAL_AUTH_SECRET: MASTER },
    tenantId: "acme", target: { appId: "hrm", worker: "app-hrm" },
    methodName: "hrm.api.x", args: {}, actor: ACTOR, traceId: "t",
  });
  assert.ok(seen.limits?.cpuMs > 0, "a runaway app must exhaust its own allowance, not the platform's");
});

// ---- what the app may and may not say ----------------------------------------

test("an app that answers without the frappe envelope is still understood", async () => {
  // An app author should not have to know which convention the platform prefers.
  const result = await dispatchAppMethod({
    env: { DISPATCHER: dispatcherThat(ok({ total: 7 })), INTERNAL_AUTH_SECRET: MASTER },
    tenantId: "acme", target: { appId: "hrm", worker: "app-hrm" },
    methodName: "hrm.api.x", args: {}, actor: ACTOR, traceId: "t",
  });
  assert.deepEqual(result.value, { total: 7 });
});

test("an app's failure is reported as the app's, and cannot forge a platform error", async () => {
  // An app answering 401 must NOT become an authentication failure: that would log the
  // user out of the platform on a third party's say-so.
  const dispatcher = dispatcherThat(async () => new Response(JSON.stringify({ message: "Nhân viên không tồn tại" }), { status: 401 }));
  await assert.rejects(
    () => dispatchAppMethod({
      env: { DISPATCHER: dispatcher, INTERNAL_AUTH_SECRET: MASTER },
      tenantId: "acme", target: { appId: "hrm", worker: "app-hrm" },
      methodName: "hrm.api.x", args: {}, actor: ACTOR, traceId: "t",
    }),
    (error) => {
      assert.equal(error.code, "VALIDATION_ERROR", "an app cannot raise an authentication error");
      assert.match(error.message, /Nhân viên không tồn tại/, "the app's own message reaches the caller");
      return true;
    },
  );
});

test("a hung app fails its own call rather than hanging the request forever", async () => {
  const dispatcher = dispatcherThat(() => new Promise(() => {}));
  const started = Date.now();
  await assert.rejects(
    () => dispatchAppMethod({
      env: { DISPATCHER: dispatcher, INTERNAL_AUTH_SECRET: MASTER },
      tenantId: "acme", target: { appId: "hrm", worker: "app-hrm" },
      methodName: "hrm.api.x", args: {}, actor: ACTOR, traceId: "t",
    }),
    /did not answer/,
  );
  assert.ok(Date.now() - started < APP_METHOD_TIMEOUT_MS + 2_000);
});

test("a deployment without the bindings refuses clearly instead of failing obscurely", async () => {
  await assert.rejects(
    () => dispatchAppMethod({
      env: {}, tenantId: "acme", target: { appId: "hrm", worker: "app-hrm" },
      methodName: "hrm.api.x", args: {}, actor: ACTOR, traceId: "t",
    }),
    /DISPATCHER binding is required/,
  );
});
