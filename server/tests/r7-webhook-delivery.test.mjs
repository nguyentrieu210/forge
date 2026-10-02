import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { D1WebhookDeliveryStore, enqueueCommittedWebhookEvent, runDurableWebhookDeliveries } from "../dist/packages/integration-hub/src/durable-delivery.js";
import { buildDeliveryTask } from "../dist/packages/integration-hub/src/delivery-planner.js";
import { signWebhookBody } from "../dist/packages/integration-hub/src/index.js";
import { subscriptionFromDocument } from "../dist/packages/integration-hub/src/subscription-store.js";

const epoch = new Date("2026-10-02T00:00:00.000Z");
const later = seconds => new Date(epoch.getTime() + seconds * 1000);
const subscription = overrides => ({
  subscription_id: "SUB-1", tenant_id: "demo", event_pattern: "document.*",
  target_url: "https://hooks.example.test/events", status: "active", auth_kind: "none",
  allowed_hosts: ["hooks.example.test"], retry_policy: { max_attempts: 2, base_delay_seconds: 2, max_delay_seconds: 60 },
  ...overrides,
});
const event = overrides => ({
  event_id: "evt-1", tenant_id: "demo", event_type: "document.updated", command_id: "cmd-1",
  actor: "admin", occurred_at: epoch.toISOString(), schema_version: 1,
  aggregate: { doctype: "Task", name: "TASK-1" }, aggregate_version: 1,
  payload: { status: "Open", total: 42 }, ...overrides,
});
function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../migrations/tenant/0148_r7_webhook_delivery.sql", import.meta.url), "utf8"));
  const adapter = {
    prepare(query) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        params() { return Object.fromEntries(values.map((value, index) => [String(index + 1), value])); },
        async run() { const r = sql.prepare(query).run(this.params()); return { meta: { changes: Number(r.changes) } }; },
        async first() { return sql.prepare(query).get(this.params()) ?? null; },
        async all() { return { results: sql.prepare(query).all(this.params()) }; },
      };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec("COMMIT"); return results; }
      catch (error) { sql.exec("ROLLBACK"); throw error; }
    },
  };
  return { sql, store: new D1WebhookDeliveryStore(adapter) };
}
const inspect = sql => sql.prepare("SELECT * FROM integration_webhook_deliveries").get();
const runner = (store, fetch, options = {}) => runDurableWebhookDeliveries({
  tenant_id: "demo", store, transport: { fetch },
  credential_resolver: { async resolve() { return {}; } }, now: epoch, ...options,
});

test("Frappe dynamic webhook scripting knobs fail closed instead of being silently ignored", () => {
  const document = {
    tenant_id: "demo", doctype: "Integration Subscription", name: "SUB-DOC", owner: "Administrator",
    docstatus: 0, status: "active", version: 1,
    created_at: epoch.toISOString(), modified_at: epoch.toISOString(), children: [],
    data: { status: "active", event_pattern: "document.*", target_url: "https://hooks.example.test/events", auth_kind: "none", allowed_hosts: ["hooks.example.test"] },
  };
  assert.equal(subscriptionFromDocument(document).event_pattern, "document.*");
  for (const [field, value] of [["condition", "doc.total > 0"], ["webhook_json", "{{ doc }}"], ["request_method", "PUT"], ["is_dynamic_url", true]]) {
    assert.throws(() => subscriptionFromDocument({ ...document, data: { ...document.data, [field]: value } }), /Unsupported Frappe dynamic webhook fields/);
  }
});

test("committed-event registry filters tenant/event and persists one immutable delivery per event", async () => {
  const { sql, store } = database();
  const reader = { async subscriptionsForEvent() { return [subscription(), subscription({ tenant_id: "other" }), subscription({ status: "disabled" })]; } };
  assert.deepEqual(await enqueueCommittedWebhookEvent("demo", event(), reader, store, epoch), { matched: 1, created: 1 });
  const original = inspect(sql).task_json;
  const changed = { async subscriptionsForEvent() { return [subscription({ mapping: [{ source: "payload.total", target: "amount" }] }), subscription({ subscription_id: "NEW-SUB" })]; } };
  assert.deepEqual(await enqueueCommittedWebhookEvent("demo", event(), changed, store, epoch), { matched: 1, created: 0 });
  assert.equal(inspect(sql).task_json, original);
  assert.deepEqual(await enqueueCommittedWebhookEvent("demo", event(), { async subscriptionsForEvent() { throw new Error("invalid current config must not reinterpret old event"); } }, store, epoch), { matched: 1, created: 0 });
  await assert.rejects(enqueueCommittedWebhookEvent("other", event(), reader, store, epoch), /tenant mismatch/);
});

test("fanout receipt and all delivery intents roll back together on a database failure", async () => {
  const { sql, store } = database();
  sql.exec("CREATE TRIGGER reject_second_delivery BEFORE INSERT ON integration_webhook_deliveries WHEN NEW.subscription_id='SUB-2' BEGIN SELECT RAISE(ABORT,'simulated database fault'); END");
  const reader = { async subscriptionsForEvent() { return [subscription(), subscription({ subscription_id: "SUB-2" })]; } };
  await assert.rejects(enqueueCommittedWebhookEvent("demo", event(), reader, store, epoch), /database fault/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM integration_webhook_fanouts").get().n, 0);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM integration_webhook_deliveries").get().n, 0);
  sql.exec("DROP TRIGGER reject_second_delivery");
  assert.deepEqual(await enqueueCommittedWebhookEvent("demo", event(), reader, store, epoch), { matched: 2, created: 2 });
});

test("empty committed fanout stays empty after a later subscription is activated", async () => {
  const { sql, store } = database();
  await enqueueCommittedWebhookEvent("demo", event(), { async subscriptionsForEvent() { return []; } }, store, epoch);
  assert.deepEqual(await enqueueCommittedWebhookEvent("demo", event(), { async subscriptionsForEvent() { return [subscription()]; } }, store, later(1)), { matched: 0, created: 0 });
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM integration_webhook_deliveries").get().n, 0);
});

test("queued snapshot bytes survive mapping/config changes and current secret rotation signs exact bytes", async () => {
  const { sql, store } = database();
  await store.enqueue("demo", await buildDeliveryTask(event(), subscription({
    auth_kind: "api_key", secret_ref: "vault:key", mapping: [{ source: "payload.total", target: "amount" }],
  })), epoch);
  let sent;
  const result = await runner(store, async (url, init) => { sent = { url, init }; return new Response(null, { status: 204 }); }, {
    credential_resolver: { async resolve(s) { assert.equal(s.secret_ref, "vault:key"); return { headers: { Authorization: "Bearer ROTATED-SECRET" }, signing_secret: "ROTATED-HMAC-SECRET" }; } },
  });
  assert.deepEqual(result, { claimed: 1, delivered: 1, retry: 0, dead_letter: 0 });
  assert.deepEqual(JSON.parse(sent.init.body).data, { amount: 42 });
  assert.equal(sent.init.headers["x-cloudforge-signature-256"], await signWebhookBody(sent.init.body, "ROTATED-HMAC-SECRET"));
  assert.equal(sent.init.redirect, "manual");
  assert.equal(sent.init.credentials, "omit");
  assert.ok(sent.init.signal instanceof AbortSignal);
  assert.equal(inspect(sql).state, "delivered");
  assert.doesNotMatch(JSON.stringify(sql.prepare("SELECT * FROM integration_webhook_audit").all()) + inspect(sql).task_json, /ROTATED-SECRET|ROTATED-HMAC-SECRET/);
  assert.deepEqual(await runner(store, async () => { throw new Error("duplicate physical send"); }), { claimed: 0, delivered: 0, retry: 0, dead_letter: 0 });
});

test("transient rejection persists due time, retry uses same delivery ID and attempt limit quarantines", async () => {
  const { sql, store } = database();
  await store.enqueue("demo", await buildDeliveryTask(event(), subscription()), epoch);
  const keys = [];
  const transport = async (_url, init) => { keys.push(init.headers["x-cloudforge-idempotency-key"]); return new Response(null, { status: 503, headers: { "retry-after": "5" } }); };
  assert.equal((await runner(store, transport)).retry, 1);
  assert.equal(inspect(sql).next_attempt_at, later(5).toISOString());
  assert.equal((await runner(store, transport, { now: later(4) })).claimed, 0);
  assert.equal((await runner(store, transport, { now: later(5) })).dead_letter, 1);
  assert.equal(inspect(sql).state, "dead_letter");
  assert.equal(inspect(sql).reason, "attempt_limit_exhausted");
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM integration_webhook_audit").get().n, 4);
});

test("only one concurrent lease wins, stale takeover fences the earlier completion", async () => {
  const { sql, store } = database();
  const task = await buildDeliveryTask(event(), subscription());
  await store.enqueue("demo", task, epoch);
  const claims = await Promise.all([store.claim("demo", task.delivery_id, epoch), store.claim("demo", task.delivery_id, epoch)]);
  assert.equal(claims.filter(Boolean).length, 1);
  const original = claims.find(Boolean);
  assert.equal(await store.claim("other", task.delivery_id, later(121)), null);
  assert.equal(await store.claim("demo", task.delivery_id, later(119)), null);
  const replacement = await store.claim("demo", task.delivery_id, later(121));
  assert.equal(replacement.attempt, 2);
  await store.finish("demo", original, { action: "delivered", retry_after_seconds: null, reason: "accepted" }, 204, later(122));
  assert.equal(inspect(sql).state, "in_flight");
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM integration_webhook_audit WHERE action='delivered'").get().n, 0);
  await store.finish("demo", replacement, { action: "delivered", retry_after_seconds: null, reason: "accepted" }, 204, later(123));
  assert.equal(inspect(sql).state, "delivered");
});

test("stale attempts consume retry budget without sending beyond configured limit", async () => {
  const { sql, store } = database();
  const task = await buildDeliveryTask(event(), subscription({ retry_policy: { max_attempts: 1 } }));
  await store.enqueue("demo", task, epoch);
  await store.claim("demo", task.delivery_id, epoch);
  const result = await runner(store, async () => { throw new Error("must not physically send exhausted lease"); }, { now: later(121) });
  assert.equal(result.dead_letter, 1);
  assert.equal(inspect(sql).reason, "attempt_limit_exhausted");
});

test("redirects and permanent rejection quarantine; replay requires attribution and preserves snapshot", async () => {
  const { sql, store } = database();
  const task = await buildDeliveryTask(event(), subscription());
  await store.enqueue("demo", task, epoch);
  await runner(store, async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } }));
  assert.equal(inspect(sql).reason, "redirect_blocked_302");
  const frozen = inspect(sql).task_json;
  await assert.rejects(store.replay("demo", task.delivery_id, "", "retry", later(1)), /actor and reason/);
  assert.equal(await store.replay("other", task.delivery_id, "admin", "retry", later(1)), false);
  assert.equal(await store.replay("demo", task.delivery_id, "admin", "Provider repaired", later(1)), true);
  assert.equal(inspect(sql).task_json, frozen);
  assert.equal(inspect(sql).replay_count, 1);
  assert.equal((await runner(store, async () => new Response(null, { status: 204 }), { now: later(1) })).delivered, 1);
  assert.equal(await store.replay("demo", task.delivery_id, "admin", "again", later(2)), false);
  const audit = sql.prepare("SELECT actor_id,reason FROM integration_webhook_audit WHERE action='replayed'").get();
  assert.deepEqual({ ...audit }, { actor_id: "admin", reason: "Provider repaired" });
});

test("credential failures never send or persist secret-bearing diagnostic strings", async () => {
  const { sql, store } = database();
  await store.enqueue("demo", await buildDeliveryTask(event(), subscription({ auth_kind: "api_key", secret_ref: "vault:key" })), epoch);
  const result = await runner(store, async () => { throw new Error("unexpected send"); }, {
    credential_resolver: { async resolve() { throw new Error("SECRET-TOKEN in provider error"); } },
  });
  assert.equal(result.dead_letter, 1);
  assert.equal(inspect(sql).reason, "credential_or_configuration_error");
  assert.doesNotMatch(JSON.stringify(sql.prepare("SELECT * FROM integration_webhook_audit").all()), /SECRET-TOKEN/);
});

test("task target policy and trusted tenant fail closed before persistence or transport", async () => {
  const { store } = database();
  const task = await buildDeliveryTask(event(), subscription());
  await assert.rejects(store.enqueue("other", task, epoch), /tenant mismatch/);
  await assert.rejects(store.enqueue("demo", { ...task, target_url: "https://127.0.0.1/private", allowed_hosts: ["127.0.0.1"] }, epoch), /host is not allowed/);
  await assert.rejects(store.due("demo", epoch, 101), /limit/);
});
