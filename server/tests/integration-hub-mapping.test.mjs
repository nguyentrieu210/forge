import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMappingSpec,
  assertMappingUpgrade,
  mappingFingerprint,
  validateMappingSpec,
} from "../dist/packages/integration-hub/src/mapping.js";

function event(overrides = {}) {
  return {
    event_id: "evt-1",
    event_type: "sales_order.submitted",
    tenant_id: "demo",
    aggregate: { doctype: "Sales Order", name: "SO-1" },
    aggregate_version: 1,
    actor: "Administrator",
    command_id: "cmd-1",
    occurred_at: "2026-08-03T00:00:00.000Z",
    schema_version: 1,
    payload: { customer: "ACME", amount_minor: 125000 },
    ...overrides,
  };
}

function spec(overrides = {}) {
  return {
    schema_version: 1,
    mapping_id: "sales-to-provider",
    version: 1,
    event_pattern: "sales_order.*",
    rules: [
      { source: "payload.customer", target: "customer_code", required: true },
      { source: "payload.amount_minor", target: "amount.minor", required: true },
    ],
    ...overrides,
  };
}

test("mapping spec is explicitly versioned and event-scoped", () => {
  assert.equal(validateMappingSpec(spec()).mapping_id, "sales-to-provider");
  assert.deepEqual(applyMappingSpec(event(), spec()), { customer_code: "ACME", amount: { minor: 125000 } });
  assert.throws(() => applyMappingSpec(event({ event_type: "purchase_order.submitted" }), spec()), /does not match/);
  assert.throws(() => validateMappingSpec(spec({ version: 0 })), /version/);
  assert.throws(() => validateMappingSpec(spec({ rules: [] })), /rules/);
  assert.throws(() => validateMappingSpec(spec({ rules: [{ source: "payload.customer", target: "__proto__.x" }] })), /Unsafe mapping path/);
});

test("mapping fingerprint is deterministic and changes with semantic version or rules", async () => {
  const first = await mappingFingerprint(spec());
  const same = await mappingFingerprint(spec());
  const bumped = await mappingFingerprint(spec({ version: 2 }));
  const changed = await mappingFingerprint(spec({
    rules: [{ source: "payload.customer", target: "customer_name", required: true }],
  }));
  assert.equal(first, same);
  assert.notEqual(first, bumped);
  assert.notEqual(first, changed);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("mapping upgrades are append-versioned rather than silently overwritten", () => {
  assert.doesNotThrow(() => assertMappingUpgrade(spec(), spec({ version: 2 })));
  assert.throws(() => assertMappingUpgrade(spec(), spec({ version: 1 })), /must increase/);
  assert.throws(() => assertMappingUpgrade(spec(), spec({ mapping_id: "other", version: 2 })), /id mismatch/);
});
