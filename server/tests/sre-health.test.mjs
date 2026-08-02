import test from "node:test";
import assert from "node:assert/strict";
import { assertProbeTarget, evaluateHealthSnapshot } from "../scripts/lib/sre-health.mjs";

test("local health probe is allowed without remote confirmation", () => {
  assert.deepEqual(assertProbeTarget("http://127.0.0.1:8787/anything"), {
    base: "http://127.0.0.1:8787",
    host: "127.0.0.1",
    remote: false,
  });
});

test("remote health probe requires exact hostname confirmation", () => {
  assert.throws(() => assertProbeTarget("https://alu.kairo.vn"), /allow-remote/);
  assert.throws(() => assertProbeTarget("https://alu.kairo.vn", {
    allowRemote: true,
    confirmHost: "other.kairo.vn",
  }), /confirm-host alu\.kairo\.vn/);
  assert.equal(assertProbeTarget("https://alu.kairo.vn", {
    allowRemote: true,
    confirmHost: "alu.kairo.vn",
  }).remote, true);
});

test("healthy exact release snapshot passes", () => {
  const result = evaluateHealthSnapshot({
    healthStatus: 200,
    healthBody: { ok: true },
    rootStatus: 200,
    guestBootStatus: 403,
    releaseStatus: 200,
    releaseBody: { ok: true, releaseSha: "abc1234", bundleHash: "1234567890abcdef" },
    expectedReleaseSha: "abc1234",
  });
  assert.deepEqual(result, {
    ok: true,
    failures: [],
    release_sha: "abc1234",
    bundle_hash: "1234567890abcdef",
  });
});

test("health snapshot fails closed on boundary or release drift", () => {
  const result = evaluateHealthSnapshot({
    healthStatus: 503,
    healthBody: { ok: false },
    rootStatus: 500,
    guestBootStatus: 200,
    releaseStatus: 200,
    releaseBody: { ok: true, releaseSha: "old", bundleHash: "" },
    expectedReleaseSha: "new",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures.sort(), [
    "guest_boot_boundary_changed",
    "health_not_ready",
    "release_bundle_hash_missing",
    "release_sha_mismatch",
    "root_not_served",
  ]);
});
