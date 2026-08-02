import test from "node:test";
import assert from "node:assert/strict";
import {
  assertConnectionConfigUpdateAllowed,
  connectorConnectionFingerprint,
  validateConnectorConnection,
} from "../dist/packages/integration-hub/src/connection.js";
import {
  assertConnectionHealthEvidence,
  createConnectorHealthEvidence,
} from "../dist/packages/integration-hub/src/health.js";

const manifest = {
  schema_version: 1,
  connector_key: "bank-feed",
  version: "1.0.0",
  provider: "bank.example",
  display_name: "Bank Feed",
  category: "bank",
  auth_kinds: ["api_key"],
  capabilities: ["poll", "pull_records", "cursor_sync", "health_check"],
  config_schema_version: 1,
};

function connection(overrides = {}) {
  return {
    schema_version: 1,
    connection_id: "bank:primary",
    tenant_id: "demo",
    connector_key: "bank-feed",
    connector_version: "1.0.0",
    auth_kind: "api_key",
    secret_ref: "credential://bank/primary",
    status: "disabled",
    config: { account_id: "123456", api_base: "https://api.bank.example" },
    ...overrides,
  };
}

test("connection contract keeps credentials out of provider config", () => {
  assert.equal(validateConnectorConnection(connection(), manifest).connection_id, "bank:primary");
  for (const config of [
    { access_token: "plaintext" },
    { nested: { refresh_token: "plaintext" } },
    { private_key: "pem" },
    { api_key: "plaintext" },
  ]) {
    assert.throws(() => validateConnectorConnection(connection({ config }), manifest), /Plaintext credential field/);
  }
  assert.throws(() => validateConnectorConnection(connection({ secret_ref: undefined }), manifest), /requires secret_ref/);
});

test("active connection config is immutable and activation cannot bundle a config change", () => {
  const active = connection({ status: "active" });
  assert.throws(() => assertConnectionConfigUpdateAllowed(active, {
    ...active, config: { ...active.config, account_id: "other" },
  }), /Disable connector connection/);

  const disabled = connection({ status: "disabled" });
  assert.throws(() => assertConnectionConfigUpdateAllowed(disabled, {
    ...disabled, status: "active", config: { ...disabled.config, account_id: "other" },
  }), /Save connector connection configuration before activating/);
  assert.doesNotThrow(() => assertConnectionConfigUpdateAllowed(disabled, { ...disabled, status: "active" }));
});

test("connection fingerprint is deterministic and covers secret reference plus non-secret config", async () => {
  const first = await connectorConnectionFingerprint(connection());
  assert.equal(first, await connectorConnectionFingerprint(connection()));
  assert.notEqual(first, await connectorConnectionFingerprint(connection({ secret_ref: "credential://bank/rotated" })));
  assert.notEqual(first, await connectorConnectionFingerprint(connection({ config: { account_id: "999" } })));
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("health evidence is accepted only for the exact current connection configuration", async () => {
  const current = connection();
  const checkedAt = new Date("2026-08-03T01:00:00Z");
  const evidence = await createConnectorHealthEvidence(current, { ok: true, code: "OK", detail: "Provider reachable" }, checkedAt);
  assert.match(evidence.evidence_id, /^health_[a-f0-9]{48}$/);
  await assert.doesNotReject(() => assertConnectionHealthEvidence(current, evidence, new Date("2026-08-03T01:05:00Z"), 600));
  await assert.rejects(
    () => assertConnectionHealthEvidence(connection({ config: { account_id: "other" } }), evidence, new Date("2026-08-03T01:05:00Z"), 600),
    /stale/,
  );
  await assert.rejects(() => assertConnectionHealthEvidence(current, evidence, new Date("2026-08-03T01:20:00Z"), 600), /expired/);

  const unhealthy = await createConnectorHealthEvidence(current, { ok: false, code: "TOKEN_EXPIRED" }, checkedAt);
  await assert.rejects(() => assertConnectionHealthEvidence(current, unhealthy, new Date("2026-08-03T01:01:00Z"), 600), /not healthy/);
});
