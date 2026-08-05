import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MarketplaceConnectionController } from "../dist/packages/integration-hub/src/marketplace-connection-controller.js";

const controller = new MarketplaceConnectionController();
const NOW = "2026-08-05T05:00:00.000Z";

function data(overrides = {}) {
  return {
    connector_key: "shopee-marketplace",
    connector_version: "1.0.0",
    auth_kind: "oauth2",
    secret_ref: "vault://tenant-1/shopee/main",
    config: { shop_id: "9001" },
    status: "draft",
    ...overrides,
  };
}

function existing(overrides = {}) {
  const value = data({ status: "active", ...overrides });
  return {
    tenant_id: "tenant-1",
    doctype: "Marketplace Connection",
    name: "INT-MKT-00001",
    owner: "admin",
    docstatus: 0,
    status: value.status,
    version: 3,
    created_at: "2026-08-05T04:00:00.000Z",
    modified_at: "2026-08-05T04:30:00.000Z",
    data: value,
    children: [],
  };
}

function context(document, current = null, action = current ? "save" : "create") {
  return {
    command: {
      schema_version: 1,
      command_id: `cmd-${action}`,
      tenant_id: "tenant-1",
      actor: { user_id: "admin", roles: ["Integration Admin"] },
      aggregate: { doctype: "Marketplace Connection", name: "INT-MKT-00001" },
      action,
      expected_version: current?.version ?? null,
      payload_hash: "test",
      document,
    },
    existing: current,
    nextVersion: (current?.version ?? 0) + 1,
    now: NOW,
  };
}

test("Marketplace Connection metadata stores only secret_ref and non-secret config", async () => {
  const raw = await readFile(new URL("../apps-src/integration-hub/doctypes/marketplace-connection.json", import.meta.url), "utf8");
  const meta = JSON.parse(raw);
  assert.equal(meta.name, "Marketplace Connection");
  const fields = new Map(meta.fields.map((field) => [field.fieldname, field]));
  assert.equal(fields.get("connector_key")?.fieldtype, "Select");
  assert.equal(fields.get("secret_ref")?.fieldtype, "Data");
  assert.equal(fields.get("config")?.fieldtype, "JSON");
  for (const field of meta.fields) {
    if (field.fieldname === "secret_ref") continue;
    assert.doesNotMatch(field.fieldname, /(password|access_token|refresh_token|app_secret|api_key|private_key)/i);
  }
});

test("Marketplace Connection accepts registered provider config and emits no credential material in event payload", () => {
  const plan = controller.buildPlan(context(data({ config: JSON.stringify({ shop_id: "9001", lookback_seconds: 3600 }) })));
  assert.equal(plan.document.data.connector_key, "shopee-marketplace");
  assert.deepEqual(plan.document.data.config, { shop_id: "9001", lookback_seconds: 3600 });
  assert.equal(plan.document.data.secret_ref, "vault://tenant-1/shopee/main");
  assert.equal(plan.events.length, 1);
  const payload = JSON.stringify(plan.events[0].payload);
  assert.doesNotMatch(payload, /vault:\/\/|access_token|refresh_token|secret/i);
});

test("Marketplace Connection rejects plaintext credentials and invalid provider-specific config", () => {
  assert.throws(
    () => controller.buildPlan(context(data({ config: { shop_id: "9001", access_token: "plaintext" } }))),
    /Plaintext credential field is forbidden/,
  );
  assert.throws(
    () => controller.buildPlan(context(data({ connector_key: "tiktok-shop-marketplace", config: {} }))),
    /TikTok Shop shop_cipher is required/,
  );
});

test("active Marketplace Connection cannot mutate connector scope or config in place", () => {
  const current = existing();
  assert.throws(
    () => controller.buildPlan(context(data({ status: "active", config: { shop_id: "9002" } }), current)),
    /Disable connector connection before changing connector, auth, secret reference or config/,
  );
});

test("Marketplace Connection status transitions require an explicit reason", () => {
  const current = existing();
  assert.throws(
    () => controller.buildPlan(context(data({ status: "disabled" }), current)),
    /status_reason is required/,
  );
  const plan = controller.buildPlan(context(data({ status: "disabled", status_reason: "Rotate provider credentials" }), current));
  assert.equal(plan.document.data.status, "disabled");
  assert.equal(plan.events[0].event_type, "marketplace_connection.disabled");
  assert.equal(plan.events[0].payload.reason, "Rotate provider credentials");
});
