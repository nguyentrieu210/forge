import test from "node:test";
import assert from "node:assert/strict";
import {
  hookMatches,
  MAX_HOOK_ATTEMPTS,
  MAX_HOOK_BACKOFF_SECONDS,
  nextAttemptDelaySeconds,
  parseAppManifest,
  subscribersFor,
  AppHookDispatcher,
} from "../dist/packages/app-registry/src/index.js";
import { deriveAppCallKey } from "../dist/packages/auth/src/index.js";

function manifest(overrides = {}) {
  return parseAppManifest({
    id: "kho",
    name: "Kho",
    version: "1.0.0",
    roles: [{ role: "Kho User" }],
    doctypes: [{
      name: "Stock Request",
      module: "Kho",
      fields: [{ fieldname: "title", label: "Title", fieldtype: "Data" }],
      permissions: [{ role: "Kho User", read: true }],
      revision: 1,
    }],
    ...overrides,
  });
}

// ---- subscription patterns --------------------------------------------------

test("an exact event type matches only itself", () => {
  assert.equal(hookMatches("sales_order.submitted", "sales_order.submitted"), true);
  assert.equal(hookMatches("sales_order.submitted", "sales_order.cancelled"), false);
  assert.equal(hookMatches("sales_order.submitted", "sales_order"), false);
});

test("a trailing wildcard matches a prefix, and `*` matches everything", () => {
  assert.equal(hookMatches("sales_order.*", "sales_order.submitted"), true);
  assert.equal(hookMatches("sales_order.*", "sales_order.cancelled"), true);
  assert.equal(hookMatches("sales_order.*", "purchase_order.submitted"), false);
  // A prefix must not leak across a name boundary.
  assert.equal(hookMatches("sales_order.*", "sales_order_item.created"), false);
  assert.equal(hookMatches("*", "anything.at.all"), true);
});

test("only a trailing wildcard is accepted", () => {
  // An arbitrary pattern would make it impossible to tell from a manifest which
  // events an app actually receives.
  assert.doesNotThrow(() => manifest({ worker: "kho-hooks", hooks: ["sales_order.*", "stock_request.submitted", "*"] }));
  for (const bad of ["*.submitted", "sales_*.submitted", "sales order.*", "Sales_Order.*", "sales_order.**"]) {
    assert.throws(() => manifest({ worker: "kho-hooks", hooks: [bad] }), /must be an event type or a trailing wildcard/, bad);
  }
});

test("a hook may be declared as a string or an object", () => {
  const fromString = manifest({ worker: "w", hooks: ["sales_order.*"] });
  const fromObject = manifest({ worker: "w", hooks: [{ event: "sales_order.*" }] });
  assert.deepEqual(fromString.hooks, fromObject.hooks);
});

test("declaring hooks without a worker is refused", () => {
  // A subscription with nowhere to deliver would queue events that can never be
  // processed, and the backlog would look like a broken platform.
  assert.throws(() => manifest({ hooks: ["sales_order.*"] }), /declares hooks but no worker/);
  assert.doesNotThrow(() => manifest({}), "an app with no hooks needs no worker");
});

// ---- subscriber resolution --------------------------------------------------

test("only apps that both declare a worker and match the event are targeted", () => {
  const installed = [
    { app_id: "kho", manifest: manifest({ id: "kho", worker: "kho-hooks", hooks: ["stock_request.*"] }) },
    { app_id: "ban", manifest: manifest({ id: "ban", worker: "ban-hooks", hooks: ["sales_order.submitted"] }) },
    { app_id: "quiet", manifest: manifest({ id: "quiet" }) },
  ];
  assert.deepEqual(subscribersFor(installed, "stock_request.submitted"), [{ appId: "kho", worker: "kho-hooks" }]);
  assert.deepEqual(subscribersFor(installed, "sales_order.submitted"), [{ appId: "ban", worker: "ban-hooks" }]);
  assert.deepEqual(subscribersFor(installed, "sales_order.cancelled"), []);
  assert.deepEqual(subscribersFor([], "anything"), []);
});

test("several apps can receive the same event", () => {
  const installed = [
    { app_id: "audit", manifest: manifest({ id: "audit", worker: "audit-hooks", hooks: ["*"] }) },
    { app_id: "kho", manifest: manifest({ id: "kho", worker: "kho-hooks", hooks: ["stock_request.*"] }) },
  ];
  assert.deepEqual(subscribersFor(installed, "stock_request.submitted").map((target) => target.appId), ["audit", "kho"]);
});

// ---- retry schedule ---------------------------------------------------------

test("backoff grows exponentially and its cap is actually reachable", () => {
  assert.equal(nextAttemptDelaySeconds(1), 30);
  assert.equal(nextAttemptDelaySeconds(2), 60);
  assert.equal(nextAttemptDelaySeconds(3), 120);
  // The cap must be reachable within MAX_HOOK_ATTEMPTS, or it is dead code hiding
  // how short the real retry window is.
  assert.equal(nextAttemptDelaySeconds(MAX_HOOK_ATTEMPTS), MAX_HOOK_BACKOFF_SECONDS);
  assert.equal(nextAttemptDelaySeconds(50), MAX_HOOK_BACKOFF_SECONDS, "a large attempt count must not overflow");
});

test("the retry window spans a realistic outage, not a few minutes", () => {
  // An app Worker down for a morning must still receive everything that happened
  // while it was gone.
  let total = 0;
  for (let attempts = 1; attempts <= MAX_HOOK_ATTEMPTS; attempts += 1) total += nextAttemptDelaySeconds(attempts);
  assert.ok(total >= 4 * 3600, `retry window is only ${Math.round(total / 60)} minutes`);
});

test("the schedule is monotonic, so each retry waits at least as long as the last", () => {
  let previous = 0;
  for (let attempts = 1; attempts <= 15; attempts += 1) {
    const delay = nextAttemptDelaySeconds(attempts);
    assert.ok(delay >= previous, `attempt ${attempts}`);
    previous = delay;
  }
});

// ---- what the platform presents to an app Worker ----------------------------

/** At least 32 characters: the HMAC helper refuses a shorter secret. */
const MASTER = "platform-master-secret-value-0123456789";

/** A domain event of the shape the dispatcher forwards. */
function domainEvent() {
  return {
    event_id: "evt-1", event_type: "stock_request.submitted", tenant_id: "acme",
    aggregate: { doctype: "Stock Request", name: "SR-1" }, aggregate_version: 1,
    actor: "user@example.com", command_id: "cmd-1",
    occurred_at: "2026-07-27T00:00:00.000Z", schema_version: 1, payload: {},
  };
}

/** Minimal D1 stand-in: one pending delivery row, and writes that succeed. */
function hookDb() {
  const statement = {
    bind: () => statement,
    first: async () => ({ status: "pending", attempts: 0 }),
    run: async () => ({ success: true, meta: { changes: 1 } }),
    all: async () => ({ results: [] }),
  };
  return { prepare: () => statement, batch: async () => [] };
}

test("an app Worker is never given the platform's own internal credential", async () => {
  // INTERNAL_SERVICE_TOKEN authenticates /internal/events, /internal/maintenance,
  // /internal/outbox/flush and /internal/reconciliation on EVERY tenant Worker, and
  // this deployment shares one value across all tenants. It used to be sent to app
  // Workers as their `authorization`, which inverts the trust direction: a credential
  // meant to prove "the platform is calling you" also granted "you may call the
  // platform's internals, on any tenant, as the platform".
  let sent;
  const dispatcher = {
    get: () => ({
      fetch: async (_url, init) => {
        sent = init.headers.authorization;
        return new Response("{}", { status: 200 });
      },
    }),
  };

  const outcomes = await new AppHookDispatcher(hookDb(), {
    DISPATCHER: dispatcher,
    INTERNAL_AUTH_SECRET: MASTER,
  }).fanOut("acme", domainEvent(), [{ appId: "kho", worker: "app-kho" }], "2026-07-27T00:00:00.000Z");

  assert.equal(outcomes[0].status, "delivered");
  assert.match(sent ?? "", /^Bearer /);
  const presented = (sent ?? "").slice("Bearer ".length);

  // Exactly the key derived for THIS tenant and THIS app — nothing else.
  assert.equal(presented, await deriveAppCallKey(MASTER, "acme", "kho"));
  assert.notEqual(presented, MASTER);
});

test("each app gets its own credential, so one leak cannot impersonate the platform to another", async () => {
  const [kho, hrm, otherTenant] = await Promise.all([
    deriveAppCallKey(MASTER, "acme", "kho"),
    deriveAppCallKey(MASTER, "acme", "hrm"),
    deriveAppCallKey(MASTER, "beta", "kho"),
  ]);
  assert.notEqual(kho, hrm, "two apps on one tenant must not share a credential");
  assert.notEqual(kho, otherTenant, "one app on two tenants must not share a credential");
});
