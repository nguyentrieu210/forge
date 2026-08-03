import test from "node:test";
import assert from "node:assert/strict";

import { runNotificationRules } from "../dist/packages/frappe-api/src/notification-runner.js";

function event() {
  return {
    event_id: "evt-1",
    tenant_id: "demo",
    event_type: "leave_application.submitted",
    aggregate: { doctype: "Leave Application", name: "LEAVE-1" },
    actor: "employee@example.test",
    payload: { employee: "NV-1", approver: "manager@example.test" },
    occurred_at: "2026-08-03T00:00:00Z",
  };
}

function dbWithRule(overrides = {}) {
  const body = {
    subject: "{{ employee }} xin nghỉ",
    message: "",
    channel: "Notification",
    recipients: [{ kind: "field", value: "approver" }],
    ...overrides,
  };
  return {
    prepare(sql) {
      assert.match(sql, /FROM notification_rules/);
      return {
        bind() {
          return {
            async all() {
              return {
                results: [{
                  name: "Leave submitted",
                  document_type: "Leave Application",
                  event: "submitted",
                  rule_json: JSON.stringify(body),
                  enabled: 1,
                }],
              };
            },
          };
        },
      };
    },
  };
}

function inbox() {
  const writes = [];
  return {
    writes,
    store: {
      async notify(tenantId, input, now) {
        writes.push({ tenantId, input, now });
      },
    },
  };
}

test("notification delivery fails closed when recipient cannot read the document", async () => {
  const { store, writes } = inbox();
  const result = await runNotificationRules(
    dbWithRule(), store, "demo", event(), "2026-08-03T01:00:00Z",
    { canReceive: async () => false, allowsInApp: async () => true },
  );
  assert.deepEqual(result, { matched: 1, delivered: 0, skipped: 1 });
  assert.equal(writes.length, 0);
});

test("notification preference can mute an otherwise-authorized recipient", async () => {
  const { store, writes } = inbox();
  const result = await runNotificationRules(
    dbWithRule(), store, "demo", event(), "2026-08-03T01:00:00Z",
    { canReceive: async () => true, allowsInApp: async (_user, eventKey) => eventKey !== "submitted" },
  );
  assert.deepEqual(result, { matched: 1, delivered: 0, skipped: 1 });
  assert.equal(writes.length, 0);
});

test("authorized recipient with notifications enabled gets one deterministic inbox record", async () => {
  const { store, writes } = inbox();
  const result = await runNotificationRules(
    dbWithRule(), store, "demo", event(), "2026-08-03T01:00:00Z",
    { canReceive: async () => true, allowsInApp: async () => true },
  );
  assert.deepEqual(result, { matched: 1, delivered: 1, skipped: 0 });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].input.name, "evt-1:Leave submitted:manager@example.test");
  assert.equal(writes[0].input.documentName, "LEAVE-1");
  assert.equal(writes[0].input.subject, "NV-1 xin nghỉ");
});

test("unavailable email transport remains skipped before inbox delivery", async () => {
  const { store, writes } = inbox();
  const result = await runNotificationRules(
    dbWithRule({ channel: "Email" }), store, "demo", event(), "2026-08-03T01:00:00Z",
    { canReceive: async () => true, allowsInApp: async () => true },
  );
  assert.deepEqual(result, { matched: 1, delivered: 0, skipped: 1 });
  assert.equal(writes.length, 0);
});
