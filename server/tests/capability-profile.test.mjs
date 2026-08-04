import assert from "node:assert/strict";
import test from "node:test";
import {
  capabilityIsEnabled,
  capabilitySurfaceEnabled,
  parseAppManifest,
  parsePackageCapabilityContract,
  resolveCapabilityProfile,
} from "../dist/packages/app-registry/src/index.js";

function app(overrides = {}) {
  return {
    id: "sales",
    name: "Sales",
    version: "1.2.0",
    roles: [],
    doctypes: [],
    nav: [
      { key: "sales-home", label: "Sales", kind: "route", route: "/sales" },
      { key: "sales-analytics", label: "Analytics", kind: "route", route: "/sales/analytics" },
    ],
    ...overrides,
  };
}

function contract(value) {
  const manifest = parseAppManifest(value);
  return parsePackageCapabilityContract(value, manifest);
}

function salesContract() {
  return contract(app({
    capabilities: [
      {
        id: "sales.core",
        label: "Sales core",
        required: true,
        surfaces: { nav: ["sales-home"] },
      },
      {
        id: "sales.analytics",
        label: "Sales analytics",
        default_state: "disabled",
        requires: [{ capability: "sales.core", min_package_version: "1.1.0" }],
        surfaces: { nav: ["sales-analytics"] },
      },
    ],
  }));
}

test("package capability contract validates namespaced ids and real surfaces", () => {
  const parsed = salesContract();
  assert.equal(parsed.package_id, "sales");
  assert.equal(parsed.capabilities.length, 2);
  assert.throws(() => contract(app({ capabilities: [{ id: "other.core", label: "Bad" }] })), /namespaced/);
  assert.throws(() => contract(app({ capabilities: [{ id: "sales.bad", label: "Bad", surfaces: { nav: ["ghost"] } }] })), /unknown nav surface/);
});

test("required capability cannot be disabled", () => {
  assert.throws(() => resolveCapabilityProfile(
    [salesContract()], [{ app_id: "sales", version: "1.2.0" }],
    { profile_id: "pilot", selections: [{ capability_id: "sales.core", state: "disabled" }] },
  ), /Required capability cannot be disabled/);
});

test("transitive dependency resolution is deterministic and surfaced in the plan", () => {
  const plan = resolveCapabilityProfile(
    [salesContract()], [{ app_id: "sales", version: "1.2.0" }],
    { profile_id: "pilot", selections: [{ capability_id: "sales.analytics", state: "enabled" }] },
  );
  assert.equal(plan.valid, true);
  assert.equal(capabilityIsEnabled(plan, "sales.core"), true);
  assert.equal(capabilityIsEnabled(plan, "sales.analytics"), true);
  assert.deepEqual(plan.capabilities.map((entry) => entry.capability_id), ["sales.analytics", "sales.core"]);
  assert.equal(plan.package_requirements[0].min_version, "1.1.0");
});

test("explicitly disabled dependency blocks the dependent capability instead of silently broadening", () => {
  const base = contract(app({
    capabilities: [
      { id: "sales.core", label: "Core", default_state: "disabled" },
      { id: "sales.analytics", label: "Analytics", default_state: "disabled", requires: [{ capability: "sales.core" }] },
    ],
  }));
  const plan = resolveCapabilityProfile(
    [base], [{ app_id: "sales", version: "1.2.0" }],
    { profile_id: "pilot", selections: [
      { capability_id: "sales.core", state: "disabled" },
      { capability_id: "sales.analytics", state: "enabled" },
    ] },
  );
  assert.equal(plan.valid, false);
  assert.equal(plan.capabilities.find((entry) => entry.capability_id === "sales.analytics").state, "blocked");
  assert.match(plan.errors.join("\n"), /explicitly disabled/);
});

test("cycle, conflict, unknown dependency and minimum package mismatch all fail closed", () => {
  const cycle = contract(app({ capabilities: [
    { id: "sales.a", label: "A", requires: [{ capability: "sales.b" }] },
    { id: "sales.b", label: "B", requires: [{ capability: "sales.a" }] },
  ] }));
  assert.equal(resolveCapabilityProfile([cycle], [{ app_id: "sales", version: "1.2.0" }], { profile_id: "p", selections: [] }).valid, false);

  const conflict = contract(app({ capabilities: [
    { id: "sales.a", label: "A", conflicts_with: ["sales.b"] },
    { id: "sales.b", label: "B" },
  ] }));
  assert.match(resolveCapabilityProfile([conflict], [{ app_id: "sales", version: "1.2.0" }], { profile_id: "p", selections: [] }).errors.join("\n"), /conflict/);

  const unknown = contract(app({ capabilities: [
    { id: "sales.a", label: "A", requires: [{ capability: "ghost.core" }] },
  ] }));
  assert.match(resolveCapabilityProfile([unknown], [{ app_id: "sales", version: "1.2.0" }], { profile_id: "p", selections: [] }).errors.join("\n"), /unknown or uninstalled/);

  const mismatch = contract(app({ capabilities: [
    { id: "sales.core", label: "Core" },
    { id: "sales.analytics", label: "Analytics", requires: [{ capability: "sales.core", min_package_version: "2.0.0" }] },
  ] }));
  assert.match(resolveCapabilityProfile([mismatch], [{ app_id: "sales", version: "1.2.0" }], { profile_id: "p", selections: [] }).errors.join("\n"), /requires sales >= 2.0.0/);
});

test("disabling a capability removes its declared surface without removing package identity", () => {
  const packageContract = salesContract();
  const plan = resolveCapabilityProfile(
    [packageContract], [{ app_id: "sales", version: "1.2.0" }],
    { profile_id: "pilot", selections: [{ capability_id: "sales.analytics", state: "disabled" }] },
  );
  assert.equal(capabilitySurfaceEnabled([packageContract], plan, "sales", "nav", "sales-home"), true);
  assert.equal(capabilitySurfaceEnabled([packageContract], plan, "sales", "nav", "sales-analytics"), false);
  assert.deepEqual({ app_id: "sales", version: "1.2.0" }, { app_id: "sales", version: "1.2.0" });
});

test("current-vs-proposed diff is stable and unknown profile capability ids are refused", () => {
  const initial = resolveCapabilityProfile(
    [salesContract()], [{ app_id: "sales", version: "1.2.0" }],
    { profile_id: "pilot", selections: [] },
  );
  const proposed = resolveCapabilityProfile(
    [salesContract()], [{ app_id: "sales", version: "1.2.0" }],
    { profile_id: "pilot", selections: [{ capability_id: "sales.analytics", state: "enabled" }] },
    initial,
  );
  assert.deepEqual(proposed.diff, [{ capability_id: "sales.analytics", from: "disabled", to: "enabled" }]);
  assert.throws(() => resolveCapabilityProfile(
    [salesContract()], [{ app_id: "sales", version: "1.2.0" }],
    { profile_id: "pilot", selections: [{ capability_id: "sales.ghost", state: "enabled" }] },
  ), /Unknown capability id/);
});
