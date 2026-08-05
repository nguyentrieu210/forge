import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePilot05Synthetic,
  loadPilot05Authorities,
  makePassingSyntheticExitInput,
} from "./evaluate-pilot-05-synthetic.mjs";

const authorities = loadPilot05Authorities();

function passing() {
  return makePassingSyntheticExitInput();
}

function expectNoExit(input, gateId) {
  const result = evaluatePilot05Synthetic(input, authorities);
  assert.equal(result.synthetic_exit_verdict, "NO-EXIT");
  assert.equal(result.production_write_authorized, false);
  assert.equal(result.cutover_authorized, false);
  assert.equal(result.ga_authorized, false);
  assert.equal(result.accepted_production_reference_authorized, false);
  assert.equal(result.real_pilot_transition_allowed, false);
  assert.ok(result.blockers.some((entry) => entry.id === gateId), `expected blocker ${gateId}`);
}

test("clean three-day synthetic hypercare yields EXIT but no real/GA authority", () => {
  const result = evaluatePilot05Synthetic(passing(), authorities);
  assert.equal(result.synthetic_exit_verdict, "EXIT");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.gate_count, 12);
  assert.equal(result.passed_gate_count, 12);
  assert.equal(result.production_write_authorized, false);
  assert.equal(result.cutover_authorized, false);
  assert.equal(result.ga_authorized, false);
  assert.equal(result.accepted_production_reference_authorized, false);
  assert.equal(result.real_pilot_transition_allowed, false);
  assert.equal(result.production_data_mutated, false);
});

test("runtime or transaction health failure forces NO-EXIT", () => {
  const runtime = passing(); runtime.checkpoints[1].runtime_health = false;
  expectNoExit(runtime, "RUNTIME_AND_TRANSACTION_HEALTHY");
  const transaction = passing(); transaction.checkpoints[2].transaction_health = false;
  expectNoExit(transaction, "RUNTIME_AND_TRANSACTION_HEALTHY");
});

test("non-zero Stock AR AP or Finance variance forces NO-EXIT", () => {
  for (const axis of ["stock", "ar", "ap", "finance"]) {
    const input = passing(); input.checkpoints[1].variances[axis] = 1;
    expectNoExit(input, "ZERO_UNEXPLAINED_VARIANCE");
  }
});

test("open P0 or P1 forces NO-EXIT", () => {
  const p0 = passing(); p0.checkpoints[2].blockers.p0 = 1;
  expectNoExit(p0, "NO_OPEN_P0_P1");
  const p1 = passing(); p1.checkpoints[0].blockers.p1 = 1;
  expectNoExit(p1, "NO_OPEN_P0_P1");
});

test("unresolved incident forces NO-EXIT", () => {
  const input = passing(); input.checkpoints[2].open_incidents = 1;
  expectNoExit(input, "INCIDENTS_CLOSED");
});

test("stale or failed recovery continuity forces NO-EXIT", () => {
  const stale = passing(); stale.checkpoints[1].recovery.verified_at = "2026-08-04T00:00:00Z";
  expectNoExit(stale, "RECOVERY_CONTINUITY_FRESH");
  const failed = passing(); failed.checkpoints[2].recovery.restore_continuity_pass = false;
  expectNoExit(failed, "RECOVERY_CONTINUITY_FRESH");
});

test("idempotency regression forces NO-EXIT", () => {
  const input = passing(); input.checkpoints[1].idempotency_stable = false;
  expectNoExit(input, "IDEMPOTENCY_STABLE");
});

test("correction path regression forces NO-EXIT", () => {
  const input = passing(); input.checkpoints[1].correction_paths_stable = false;
  expectNoExit(input, "CORRECTION_PATHS_STABLE");
});

test("incomplete or duplicate hypercare window forces NO-EXIT", () => {
  const missing = passing(); missing.checkpoints.pop();
  expectNoExit(missing, "HYPERCARE_WINDOW_COMPLETE");
  const duplicate = passing(); duplicate.checkpoints[2].day = 2; duplicate.checkpoints[2].date = "2026-08-06";
  expectNoExit(duplicate, "HYPERCARE_WINDOW_COMPLETE");
});

test("non-synthetic invocation cannot obtain EXIT", () => {
  const input = passing(); input.synthetic = false;
  expectNoExit(input, "SYNTHETIC_ONLY");
});
