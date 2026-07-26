import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAppManifest,
  runAppValidators,
  validatorsFor,
  VALIDATOR_TIMEOUT_MS,
} from "../dist/packages/app-registry/src/index.js";
import { deriveAppCallKey, IDENTITY_HEADER } from "../dist/packages/auth/src/index.js";

/**
 * Pre-commit checks: the one thing an after-commit hook can never do.
 *
 * Before this, every rule that had to BLOCK a write was forced to become platform code,
 * which is precisely what made apps unable to express real business logic.
 */
const MASTER = "platform-master-secret-value-0123456789";
const ACTOR = { user_id: "an@example.com", roles: ["HR Manager"] };

function manifest(overrides = {}) {
  return parseAppManifest({
    id: "hrm",
    name: "HRM",
    version: "1.0.0",
    doctypes: [{
      name: "Leave Application",
      module: "HR",
      fields: [{ fieldname: "employee", label: "Employee", fieldtype: "Data" }],
      permissions: [{ role: "HR User", read: true }],
      revision: 1,
    }],
    roles: [{ role: "HR User" }],
    ...overrides,
  });
}

const subject = { doctype: "Leave Application", name: "NP-1", action: "submit", payload: { total_days: 3 } };

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

const allow = async () => new Response("{}", { status: 200 });

// ---- declaring a validator ---------------------------------------------------

test("a validator without a worker is refused at install, not ignored at runtime", () => {
  // Allowing it would silently drop the rule; denying everything would brick the
  // doctype. Refusing the manifest is the only answer that is not a surprise later.
  assert.throws(
    () => manifest({ validators: [{ doctype: "Leave Application" }] }),
    /declares validators but no worker/,
  );
  assert.doesNotThrow(() => manifest({ worker: "app-hrm", validators: [{ doctype: "Leave Application" }] }));
});

test("an action that is not a write action is refused", () => {
  // A typo would match nothing, so the rule would never run — exactly the failure a
  // declarative manifest exists to make impossible.
  assert.throws(
    () => manifest({ worker: "w", validators: [{ doctype: "*", actions: ["read"] }] }),
    /is not a write action/,
  );
  assert.doesNotThrow(() => manifest({ worker: "w", validators: [{ doctype: "*", actions: ["submit", "cancel"] }] }));
});

// ---- which validators apply --------------------------------------------------

const installed = [
  { app_id: "hrm", worker: "app-hrm", validators: [{ doctype: "Leave Application", actions: ["submit"] }] },
  { app_id: "audit", worker: "app-audit", validators: [{ doctype: "*" }] },
  { app_id: "quiet", worker: null, validators: [{ doctype: "*" }] },
  { app_id: "plain", worker: "app-plain", validators: [] },
];

test("a validator applies to its doctype and action, and a wildcard to everything", () => {
  assert.deepEqual(validatorsFor(installed, "Leave Application", "submit").map((t) => t.appId), ["hrm", "audit"]);
  // Same doctype, different action: the narrow rule must not fire.
  assert.deepEqual(validatorsFor(installed, "Leave Application", "save").map((t) => t.appId), ["audit"]);
  assert.deepEqual(validatorsFor(installed, "Employee", "create").map((t) => t.appId), ["audit"]);
});

test("an app with no worker registers no validator", () => {
  assert.equal(validatorsFor(installed, "Employee", "create").some((t) => t.appId === "quiet"), false);
});

// ---- running them ------------------------------------------------------------

test("an approved write proceeds, and the app is told who is writing what", async () => {
  const seen = {};
  await runAppValidators({
    env: { DISPATCHER: dispatcherThat(allow, seen), INTERNAL_AUTH_SECRET: MASTER },
    tenantId: "acme", actor: ACTOR, traceId: "t", subject,
    targets: [{ appId: "hrm", worker: "app-hrm" }],
  });
  assert.equal(seen.worker, "app-hrm");
  assert.match(seen.url, /\/hooks\/validate$/);
  assert.deepEqual(JSON.parse(seen.init.body), subject);
  assert.equal(seen.init.headers.authorization, `Bearer ${await deriveAppCallKey(MASTER, "acme", "hrm")}`);
  assert.ok(seen.init.headers[IDENTITY_HEADER], "the app is told who is writing");
});

test("a refusal blocks the write and carries the app's own reason", async () => {
  const dispatcher = dispatcherThat(async () => new Response(
    JSON.stringify({ message: "Vượt quá số ngày phép còn lại" }), { status: 400 },
  ));
  await assert.rejects(
    () => runAppValidators({
      env: { DISPATCHER: dispatcher, INTERNAL_AUTH_SECRET: MASTER },
      tenantId: "acme", actor: ACTOR, traceId: "t", subject,
      targets: [{ appId: "hrm", worker: "app-hrm" }],
    }),
    (error) => {
      assert.match(error.message, /Vượt quá số ngày phép còn lại/);
      // A refusal is a validation error whatever status the app chose: an app must not
      // be able to answer 401 and log the user out of the platform.
      assert.equal(error.code, "VALIDATION_ERROR");
      return true;
    },
  );
});

test("an app answering 401 still only refuses the write", async () => {
  const dispatcher = dispatcherThat(async () => new Response(JSON.stringify({ message: "no" }), { status: 401 }));
  await assert.rejects(
    () => runAppValidators({
      env: { DISPATCHER: dispatcher, INTERNAL_AUTH_SECRET: MASTER },
      tenantId: "acme", actor: ACTOR, traceId: "t", subject,
      targets: [{ appId: "hrm", worker: "app-hrm" }],
    }),
    (error) => (assert.equal(error.code, "VALIDATION_ERROR"), true),
  );
});

test("an unreachable validator FAILS CLOSED", async () => {
  // Allowing the write would mean a rule the tenant declared silently stops applying
  // the moment an app Worker is down — the failure nobody notices until an audit.
  const dispatcher = dispatcherThat(() => new Promise(() => {}));
  const started = Date.now();
  await assert.rejects(
    () => runAppValidators({
      env: { DISPATCHER: dispatcher, INTERNAL_AUTH_SECRET: MASTER },
      tenantId: "acme", actor: ACTOR, traceId: "t", subject,
      targets: [{ appId: "hrm", worker: "app-hrm" }],
    }),
    /could not check this change/,
  );
  assert.ok(Date.now() - started < VALIDATOR_TIMEOUT_MS + 2_000, "and it must not wait forever to say so");
});

test("the first refusal stops the rest, so a blocked write costs one call", async () => {
  let calls = 0;
  const dispatcher = {
    get: () => ({
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ message: "no" }), { status: 400 });
      },
    }),
  };
  await assert.rejects(() => runAppValidators({
    env: { DISPATCHER: dispatcher, INTERNAL_AUTH_SECRET: MASTER },
    tenantId: "acme", actor: ACTOR, traceId: "t", subject,
    targets: [{ appId: "hrm", worker: "app-hrm" }, { appId: "audit", worker: "app-audit" }],
  }));
  assert.equal(calls, 1);
});

test("no validators means no calls at all", async () => {
  let called = false;
  await runAppValidators({
    env: { DISPATCHER: { get: () => ({ fetch: async () => { called = true; return new Response("{}"); } }) }, INTERNAL_AUTH_SECRET: MASTER },
    tenantId: "acme", actor: ACTOR, traceId: "t", subject, targets: [],
  });
  assert.equal(called, false, "an ordinary write must not pay for a feature nobody uses");
});

test("declared validators on a deployment that cannot reach apps refuse loudly", async () => {
  await assert.rejects(
    () => runAppValidators({
      env: {}, tenantId: "acme", actor: ACTOR, traceId: "t", subject,
      targets: [{ appId: "hrm", worker: "app-hrm" }],
    }),
    /cannot reach app Workers/,
  );
});
