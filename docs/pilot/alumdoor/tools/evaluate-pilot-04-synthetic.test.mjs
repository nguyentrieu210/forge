import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePilot04Synthetic,
  loadPilot04Authorities,
  makePassingSyntheticDecisionInput,
} from "./evaluate-pilot-04-synthetic.mjs";

const authorities = loadPilot04Authorities();

function passing() {
  return makePassingSyntheticDecisionInput(authorities);
}

function expectNoGo(input, gateId) {
  const result = evaluatePilot04Synthetic(input, authorities);
  assert.equal(result.synthetic_verdict, "NO-GO");
  assert.equal(result.production_write_authorized, false);
  assert.equal(result.cutover_authorized, false);
  assert.equal(result.real_pilot_transition_allowed, false);
  assert.ok(result.blockers.some((entry) => entry.id === gateId), `expected blocker ${gateId}`);
  return result;
}

test("complete synthetic evidence yields GO but never authorizes real cutover", () => {
  const result = evaluatePilot04Synthetic(passing(), authorities);
  assert.equal(result.synthetic_verdict, "GO");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.gate_count, 11);
  assert.equal(result.passed_gate_count, 11);
  assert.equal(result.production_write_authorized, false);
  assert.equal(result.cutover_authorized, false);
  assert.equal(result.real_pilot_transition_allowed, false);
  assert.equal(result.production_data_mutated, false);
});

test("unresolved P0 or P1 blocker forces NO-GO", () => {
  const p0 = passing();
  p0.scenario_id = "P04-SYN-NOGO-P0";
  p0.blockers.p0 = 1;
  expectNoGo(p0, "NO_P0_P1");

  const p1 = passing();
  p1.scenario_id = "P04-SYN-NOGO-P1";
  p1.blockers.p1 = 2;
  expectNoGo(p1, "NO_P0_P1");
});

test("non-zero reconciliation variance forces NO-GO", () => {
  const input = passing();
  input.scenario_id = "P04-SYN-NOGO-VARIANCE";
  input.reconciliation.unexplained_variance = 1;
  expectNoGo(input, "ZERO_UNEXPLAINED_VARIANCE");
});

test("missing or duplicate Giám đốc approval forces NO-GO", () => {
  const missing = passing();
  missing.scenario_id = "P04-SYN-NOGO-NO-DIRECTOR";
  missing.approvers = [];
  expectNoGo(missing, "SINGLE_NAMED_DIRECTOR_APPROVAL");

  const duplicate = passing();
  duplicate.scenario_id = "P04-SYN-NOGO-DUP-DIRECTOR";
  duplicate.approvers.push({
    account: "director2.synthetic@example.invalid",
    persona: "Giám đốc",
    active: true,
    approved: true,
  });
  expectNoGo(duplicate, "SINGLE_NAMED_DIRECTOR_APPROVAL");
});

test("release package or profile drift forces NO-GO", () => {
  const release = passing();
  release.scenario_id = "P04-SYN-NOGO-RELEASE-DRIFT";
  release.observed_identity.source_sha = "0000000000000000000000000000000000000000";
  expectNoGo(release, "LOCKED_RELEASE_IDENTITY");

  const pkg = passing();
  pkg.scenario_id = "P04-SYN-NOGO-PACKAGE-DRIFT";
  pkg.observed_identity.packages.find((entry) => entry.app_id === "alumdoor").version = "2.2.4";
  expectNoGo(pkg, "LOCKED_RELEASE_IDENTITY");

  const profile = passing();
  profile.scenario_id = "P04-SYN-NOGO-PROFILE-DRIFT";
  profile.observed_identity.capability_profile.content_hash = "drift";
  expectNoGo(profile, "LOCKED_RELEASE_IDENTITY");
});

test("stale or unverified recovery evidence forces NO-GO", () => {
  const stale = passing();
  stale.scenario_id = "P04-SYN-NOGO-STALE-RECOVERY";
  stale.recovery.verified_at = "2026-08-03T00:00:00.000Z";
  expectNoGo(stale, "RECOVERY_FRESH");

  const unverified = passing();
  unverified.scenario_id = "P04-SYN-NOGO-UNVERIFIED-RECOVERY";
  unverified.recovery.restore_test_pass = false;
  expectNoGo(unverified, "RECOVERY_FRESH");
});

test("non-deterministic or non-source-bound cutoff forces NO-GO", () => {
  const input = passing();
  input.scenario_id = "P04-SYN-NOGO-CUTOFF";
  input.cutoff.delta_procedure_ready = false;
  expectNoGo(input, "CUTOFF_DETERMINISTIC");
});

test("synthetic flag cannot be omitted to obtain GO", () => {
  const input = passing();
  input.scenario_id = "P04-SYN-NOGO-NOT-SYNTHETIC";
  input.synthetic = false;
  expectNoGo(input, "SYNTHETIC_ONLY");
});
