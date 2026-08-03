import test from "node:test";
import assert from "node:assert/strict";
import {
  assertFeatureEntitled,
  assertQuotaAvailable,
  evaluateFeatureEntitlement,
  evaluateQuotaEntitlement,
  validatePlanEntitlement,
} from "../dist/apps/control-plane-worker/src/entitlements.js";


test("missing entitlement policy preserves legacy behavior but is explicitly unmanaged", () => {
  assert.deepEqual(evaluateFeatureEntitlement("pro", "apps.analytics", undefined), {
    managed: false,
    allowed: true,
    plan: "pro",
    key: "apps.analytics",
    kind: "feature",
  });
  assert.deepEqual(evaluateQuotaEntitlement("free", "users.active", 9, undefined, 2), {
    managed: false,
    allowed: true,
    plan: "free",
    key: "users.active",
    kind: "quota",
    used: 9,
  });
});

test("explicit feature policy is authoritative", () => {
  const denied = evaluateFeatureEntitlement("free", "apps.analytics", {
    kind: "feature",
    key: "apps.analytics",
    enabled: false,
  });
  assert.equal(denied.managed, true);
  assert.equal(denied.allowed, false);
  assert.throws(() => assertFeatureEntitled(denied), /not enabled/);

  const allowed = evaluateFeatureEntitlement("enterprise", "apps.analytics", {
    kind: "feature",
    key: "apps.analytics",
    enabled: true,
  });
  assert.doesNotThrow(() => assertFeatureEntitled(allowed));
});

test("quota policy uses safe integers and exact requested capacity", () => {
  const within = evaluateQuotaEntitlement("pro", "users.active", 24, {
    kind: "quota",
    key: "users.active",
    limit: 25,
    unit: "users",
  }, 1);
  assert.deepEqual(within, {
    managed: true,
    allowed: true,
    plan: "pro",
    key: "users.active",
    kind: "quota",
    limit: 25,
    used: 24,
    remaining: 1,
    unit: "users",
  });
  assert.doesNotThrow(() => assertQuotaAvailable(within));

  const exceeded = evaluateQuotaEntitlement("pro", "users.active", 25, {
    kind: "quota",
    key: "users.active",
    limit: 25,
    unit: "users",
  }, 1);
  assert.equal(exceeded.allowed, false);
  assert.equal(exceeded.remaining, 0);
  assert.throws(() => assertQuotaAvailable(exceeded), /has been reached/);
});

test("invalid keys, units, limits and decision mismatches fail closed", () => {
  assert.throws(() => validatePlanEntitlement({ kind: "feature", key: "Bad Key", enabled: true }), /key is invalid/);
  assert.throws(() => validatePlanEntitlement({ kind: "quota", key: "users.active", limit: -1, unit: "users" }), /non-negative/);
  assert.throws(() => validatePlanEntitlement({ kind: "quota", key: "users.active", limit: 1, unit: "" }), /unit is invalid/);
  assert.throws(() => evaluateFeatureEntitlement("pro", "apps.crm", { kind: "feature", key: "apps.erp", enabled: true }), /key mismatch/);
  assert.throws(() => evaluateQuotaEntitlement("pro", "users.active", Number.MAX_SAFE_INTEGER + 1, undefined), /safe integer/);
});
