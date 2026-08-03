import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildPlan,
  classifyInherited,
  loadJson,
  normalizeProfile,
  requiredChecks,
  validateProfile,
  verifyReleaseEvidence
} from "./run-validation-gate.mjs";

const matrix = loadJson(resolve("validation/rc-gates.json"));
const SHA0 = "0".repeat(40);
const SHA1 = "1".repeat(40);

function profile(overrides = {}) {
  return normalizeProfile({
    changeId: "test",
    baseSha: SHA0,
    headSha: SHA1,
    risk: "FAST",
    domains: ["ui"],
    touches: {
      ui: false,
      mobile: false,
      migration: false,
      authoritativeMutation: false,
      tenantBoundary: false
    },
    claims: [],
    ...overrides
  });
}

test("FAST locks typecheck and build", () => {
  assert.deepEqual([...requiredChecks(profile(), matrix).keys()], ["typecheck", "build"]);
});

test("STANDARD authoritative mutation adds idempotency/retry", () => {
  const p = profile({ risk: "STANDARD", domains: ["crm"], touches: { authoritativeMutation: true } });
  const required = new Set(requiredChecks(p, matrix).keys());
  for (const id of ["typecheck", "build", "unit", "targeted_integration", "permission", "failure_path", "idempotency_retry"]) assert(required.has(id), id);
});

test("tenant boundary and migration add isolation and replay", () => {
  const p = profile({ risk: "STANDARD", domains: ["platform"], touches: { tenantBoundary: true, migration: true } });
  const required = new Set(requiredChecks(p, matrix).keys());
  assert(required.has("tenant_isolation"));
  assert(required.has("migration_replay"));
});

test("CRITICAL finance requires correction and reconciliation", () => {
  const p = profile({ risk: "CRITICAL", domains: ["finance"] });
  const required = new Set(requiredChecks(p, matrix).keys());
  assert(required.has("correction_reversal"));
  assert(required.has("reconciliation"));
});

test("UI maturity/promotion claims require desktop browser and mobile when touched", () => {
  for (const claim of ["UI_PROMOTION", "RC", "HARDENED", "DEPLOYED"]) {
    const p = profile({ risk: "FAST", domains: ["ui"], touches: { ui: true, mobile: true }, claims: [claim] });
    const required = new Set(requiredChecks(p, matrix).keys());
    assert(required.has("browser_e2e"), `${claim}: browser_e2e`);
    assert(required.has("mobile_evidence"), `${claim}: mobile_evidence`);
  }
});

test("HARDENED and DEPLOYED claims require exact production marker", () => {
  for (const claim of ["HARDENED", "DEPLOYED"]) {
    const required = new Set(requiredChecks(profile({ claims: [claim] }), matrix).keys());
    assert(required.has("production_release_marker"), claim);
  }
});

test("finance/stock/payroll cannot be downgraded below CRITICAL", () => {
  const errors = validateProfile(profile({ risk: "STANDARD", domains: ["stock"] }), matrix);
  assert(errors.some((item) => item.includes("must use CRITICAL")));
});

test("plan fails closed when a required targeted check has no implementation", () => {
  const p = profile({ risk: "STANDARD", domains: ["crm"] });
  assert(buildPlan(p, matrix).missing.some((item) => item.startsWith("targeted_integration:")));
});

test("inherited diagnostic classification is pinned to exact base SHA", () => {
  const p = profile();
  const ok = classifyInherited({ inherited: { baseSha: SHA0, tracking: "#1", reason: "pre-existing" } }, p);
  assert.equal(ok.inherited, true);
  const bad = classifyInherited({ inherited: { baseSha: SHA1, tracking: "#1", reason: "pre-existing" } }, p);
  assert.equal(bad.inherited, false);
});

test("production release evidence rejects SHA mismatch and accepts exact marker", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-validation-"));
  const evidence = join(dir, "release.json");
  writeFileSync(evidence, JSON.stringify({ releaseSha: SHA1, deployedSha: SHA1, bundleHash: "12345678", completedAt: "2026-08-03T00:00:00.000Z" }));
  const p = profile();
  assert.equal(verifyReleaseEvidence({ path: evidence }, p, dir).ok, true);
  assert.equal(verifyReleaseEvidence({ path: evidence, releaseSha: SHA0 }, p, dir).ok, false);
});
