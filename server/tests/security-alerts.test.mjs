import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySecurityAuditEvent,
  listSecurityAlerts,
  routeFrappeApi,
} from "../dist/packages/frappe-api/src/index.js";

const ADMIN = { user_id: "auditor@example.com", roles: ["Internal Auditor"] };

function event(overrides = {}) {
  return {
    event_id: "evt-1",
    correlation_id: "trace-1",
    actor: "admin@example.com",
    action: "roles.replace",
    entity_type: "User",
    entity_name: "worker@example.com",
    before_json: { roles: ["Stock User"] },
    after_json: { roles: ["Stock Manager"] },
    occurred_at: "2026-08-03T01:00:00.000Z",
    source: "rbac",
    ...overrides,
  };
}

test("RBAC privilege changes derive deterministic security alerts without copying audit state", () => {
  const alert = classifySecurityAuditEvent(event());
  assert.deepEqual(alert, {
    alert_id: "security:evt-1",
    severity: "critical",
    category: "access",
    actor: "admin@example.com",
    action: "roles.replace",
    entity_type: "User",
    entity_name: "worker@example.com",
    correlation_id: "trace-1",
    occurred_at: "2026-08-03T01:00:00.000Z",
    evidence_source: "rbac",
  });
});

test("self password changes are evidence but not promoted to alerts by themselves", () => {
  assert.equal(classifySecurityAuditEvent(event({ action: "password.change" })), null);
});

test("security-policy and delegation document changes are promoted from version evidence", () => {
  const policy = classifySecurityAuditEvent(event({
    event_id: "evt-policy",
    source: "document_version",
    action: "save",
    entity_type: "SoD Rule",
    entity_name: "SOD-1",
  }));
  assert.equal(policy.severity, "high");
  assert.equal(policy.category, "policy");

  const delegation = classifySecurityAuditEvent(event({
    event_id: "evt-delegation",
    source: "document_version",
    action: "submit",
    entity_type: "Delegation",
    entity_name: "DEL-1",
  }));
  assert.equal(delegation.category, "delegation");
});

test("ordinary business document history is not mislabeled as a security alert", () => {
  assert.equal(classifySecurityAuditEvent(event({
    source: "document_version",
    action: "submit",
    entity_type: "Sales Order",
    entity_name: "SO-1",
  })), null);
});

test("alert pagination delegates authorization and cursor truth to the immutable audit reader", async () => {
  const calls = [];
  const audit = {
    async listAuditEvents(tenantId, actor, input) {
      calls.push({ tenantId, actor, input });
      return {
        events: [
          event(),
          event({ event_id: "evt-low", action: "password.change" }),
          event({ event_id: "evt-disable", action: "user.disable" }),
        ],
        next_cursor: "cursor-next",
      };
    },
  };
  const result = await listSecurityAlerts({ tenantId: "tenant-a", actor: ADMIN, audit, cursor: "cursor-1", limit: 2 });
  assert.equal(result.alerts.length, 2);
  assert.equal(result.alerts[0].severity, "critical");
  assert.equal(result.alerts[1].category, "identity");
  assert.equal(result.next_cursor, "cursor-next");
  assert.deepEqual(calls[0], {
    tenantId: "tenant-a",
    actor: ADMIN,
    input: { cursor: "cursor-1", limit: 10 },
  });
});

test("Frappe security_alerts endpoint uses the organization audit authority", async () => {
  const seen = [];
  const context = {
    tenantId: "tenant-a",
    actor: ADMIN,
    traceId: "trace-alerts",
    now: () => "2026-08-03T01:00:00.000Z",
    organizationSecurity: {
      async listAuditEvents(tenantId, actor, input) {
        seen.push({ tenantId, actor, input });
        return { events: [event()], next_cursor: null };
      },
    },
  };
  const url = new URL("https://tenant.test/api/method/metaforge.api.security_alerts?limit=20");
  const response = await routeFrappeApi(new Request(url), url, context);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message.alerts.length, 1);
  assert.equal(body.message.alerts[0].alert_id, "security:evt-1");
  assert.equal(seen[0].tenantId, "tenant-a");
  assert.equal(seen[0].input.limit, 100);
});

test("security_alerts fails closed when no audit authority is wired", async () => {
  const context = {
    tenantId: "tenant-a",
    actor: ADMIN,
    traceId: "trace-alerts",
    now: () => "2026-08-03T01:00:00.000Z",
  };
  const url = new URL("https://tenant.test/api/method/metaforge.api.security_alerts");
  const response = await routeFrappeApi(new Request(url), url, context);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).exc_type, "DoesNotExistError");
});
