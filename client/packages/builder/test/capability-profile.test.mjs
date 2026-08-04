import assert from "node:assert/strict";
import test from "node:test";
import {
  capabilityProfileFromResolution,
  serializeCapabilityProfile,
  setCapabilityDesiredState,
  validateCapabilityProfile,
} from "../dist/index.js";

function model() {
  return capabilityProfileFromResolution({
    profile_id: "alumdoor-pilot",
    version: 3,
    capabilities: [
      {
        capability_id: "erp.core",
        package_id: "erp",
        label: "ERP core",
        required: true,
        state: "required",
        desired_state: "enabled",
        source: "required",
      },
      {
        capability_id: "alumdoor.workshop",
        package_id: "alumdoor",
        label: "Xưởng cửa",
        state: "enabled",
        desired_state: "enabled",
        source: "explicit",
      },
      {
        capability_id: "alumdoor.analytics",
        package_id: "alumdoor",
        label: "Phân tích",
        state: "disabled",
        desired_state: "disabled",
        source: "default",
      },
    ],
  });
}

test("builder keeps server profile version and cannot toggle required capabilities", () => {
  const initial = model();
  assert.equal(initial.expectedVersion, 3);
  const changed = setCapabilityDesiredState(initial, "erp.core", "disabled");
  assert.equal(changed.capabilities[0].desired_state, "enabled");
});

test("builder serializes only explicit selections in deterministic order", () => {
  let current = model();
  current = setCapabilityDesiredState(current, "alumdoor.analytics", "enabled");
  const payload = serializeCapabilityProfile(current);
  assert.deepEqual(payload, {
    profile_id: "alumdoor-pilot",
    expected_version: 3,
    selections: [
      { capability_id: "alumdoor.analytics", state: "enabled" },
      { capability_id: "alumdoor.workshop", state: "enabled" },
    ],
  });
});

test("builder validation rejects invalid profile ids and required-disable corruption", () => {
  const invalidId = { ...model(), profileId: "Bad Profile" };
  assert.equal(validateCapabilityProfile(invalidId).ok, false);

  const corrupted = model();
  corrupted.capabilities[0] = { ...corrupted.capabilities[0], desired_state: "disabled" };
  assert.match(validateCapabilityProfile(corrupted).errors.join("\n"), /bắt buộc/);
});
