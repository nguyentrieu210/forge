import test from "node:test";
import assert from "node:assert/strict";
import { IntegrationSubscriptionController } from "../dist/packages/integration-hub/src/controllers.js";

const baseData = {
  event_pattern: "sales_order.*",
  target_url: "https://hooks.example.com/forge",
  auth_kind: "api_key",
  secret_ref: "credential://integration/sub-sales",
  allowed_hosts: ["hooks.example.com"],
  mapping: [{ source: "payload.customer", target: "customer", required: true }],
  max_attempts: 5,
  base_delay_seconds: 2,
  max_delay_seconds: 60,
  status: "draft",
};

function context({ action = "create", document = baseData, existingData = null, existingStatus = null } = {}) {
  const existing = action === "create" ? null : {
    tenant_id: "demo",
    doctype: "Integration Subscription",
    name: "sub-sales",
    owner: "Administrator",
    docstatus: 0,
    status: existingStatus ?? existingData?.status ?? "draft",
    version: 1,
    created_at: "2026-08-03T00:00:00.000Z",
    modified_at: "2026-08-03T00:00:00.000Z",
    data: existingData ?? baseData,
    children: [],
  };
  return {
    command: {
      schema_version: 1,
      command_id: `cmd-${action}`,
      tenant_id: "demo",
      actor: { user_id: "Administrator", roles: ["System Manager"] },
      aggregate: { doctype: "Integration Subscription", name: "sub-sales" },
      action,
      expected_version: existing ? 1 : null,
      payload_hash: "a".repeat(64),
      document,
    },
    existing,
    nextVersion: existing ? 2 : 1,
    now: "2026-08-03T01:00:00.000Z",
    reader: {},
  };
}

test("Integration Subscription is always created draft and emits canonical outbox event", () => {
  const controller = new IntegrationSubscriptionController();
  const plan = controller.buildPlan(context());
  assert.equal(plan.document.status, "draft");
  assert.equal(plan.document.docstatus, 0);
  assert.equal(plan.document.data.target_url, "https://hooks.example.com/forge");
  assert.equal(plan.events.length, 1);
  assert.equal(plan.events[0].event_type, "integration_subscription.created");
  assert.equal(plan.events[0].tenant_id, "demo");

  assert.throws(() => controller.buildPlan(context({ document: { ...baseData, status: "active" } })), /created as draft/);
});

test("active subscription cannot mutate delivery contract until disabled", () => {
  const controller = new IntegrationSubscriptionController();
  const active = { ...baseData, status: "active", status_reason: "activated" };
  assert.throws(() => controller.buildPlan(context({
    action: "save",
    existingData: active,
    existingStatus: "active",
    document: { ...active, target_url: "https://hooks.example.com/v2" },
  })), /Disable Integration Subscription/);
});

test("status transition requires reason and follows explicit state machine", () => {
  const controller = new IntegrationSubscriptionController();
  const active = { ...baseData, status: "active", status_reason: "activated" };
  assert.throws(() => controller.buildPlan(context({
    action: "save", existingData: active, existingStatus: "active", document: { ...active, status: "disabled", status_reason: "" },
  })), /status_reason/);

  const disabled = controller.buildPlan(context({
    action: "save", existingData: active, existingStatus: "active",
    document: { ...active, status: "disabled", status_reason: "Provider maintenance" },
  }));
  assert.equal(disabled.document.status, "disabled");
  assert.equal(disabled.events[0].event_type, "integration_subscription.disabled");
  assert.equal(disabled.events[0].payload.reason, "Provider maintenance");

  const draft = { ...baseData, status: "draft" };
  assert.throws(() => controller.buildPlan(context({
    action: "save", existingData: draft, existingStatus: "draft",
    document: { ...draft, status: "error", status_reason: "bad" },
  })), /Invalid subscription status transition/);
});

test("disabled subscription may change config then reactivate with explicit reason", () => {
  const controller = new IntegrationSubscriptionController();
  const disabled = { ...baseData, status: "disabled", status_reason: "maintenance" };
  const plan = controller.buildPlan(context({
    action: "save", existingData: disabled, existingStatus: "disabled",
    document: {
      ...disabled,
      target_url: "https://hooks.example.com/v2",
      status: "active",
      status_reason: "Endpoint verified",
    },
  }));
  assert.equal(plan.document.status, "active");
  assert.equal(plan.document.data.target_url, "https://hooks.example.com/v2");
  assert.equal(plan.events[0].event_type, "integration_subscription.active");
});

test("subscription controller rejects submittable lifecycle and unsafe targets", () => {
  const controller = new IntegrationSubscriptionController();
  assert.throws(() => controller.buildPlan(context({ action: "submit", existingData: baseData })), /not submittable/);
  assert.throws(() => controller.buildPlan(context({ action: "cancel", existingData: baseData })), /not submittable/);
  assert.throws(() => controller.buildPlan(context({
    document: { ...baseData, target_url: "https://127.0.0.1/internal", allowed_hosts: ["127.0.0.1"] },
  })), /host is not allowed/);
});
