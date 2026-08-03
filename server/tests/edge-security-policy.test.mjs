import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const policyPath = fileURLToPath(new URL("../config/cloudflare/edge-security-policy.json", import.meta.url));
const gatewayWranglerPath = fileURLToPath(new URL("../apps/gateway-worker/wrangler.jsonc", import.meta.url));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const gatewayWrangler = readFileSync(gatewayWranglerPath, "utf8");

function surface(id) {
  const found = policy.surfaces.find((entry) => entry.id === id);
  assert.ok(found, `missing edge-security surface ${id}`);
  return found;
}

test("CF04 policy cannot self-activate production perimeter changes", () => {
  assert.equal(policy.status, "review_only");
  assert.equal(policy.production_activation, "requires_explicit_user_approval");
  assert.equal(policy.waf_and_rate_limit.provider_apply_owner, "CF08");
});

test("Forge authentication and authorization remain authoritative", () => {
  assert.equal(policy.global_invariants.never_replace_forge_authentication, true);
  assert.equal(policy.global_invariants.never_replace_forge_authorization, true);
  assert.equal(policy.access.tenant_product_login, "rejected");
  assert.equal(policy.access.service_tokens.application_auth_still_required, true);
});

test("unmeasured edge policies never invent numeric thresholds", () => {
  for (const entry of policy.surfaces) {
    assert.equal(entry.edge_rate_limit.threshold, null, `${entry.id} has an unmeasured threshold`);
  }
  assert.match(policy.waf_and_rate_limit.threshold_policy, /require Forge traffic/i);
});

test("machine ingress never gets a generic interactive challenge", () => {
  for (const entry of policy.surfaces.filter((candidate) => candidate.machine_traffic)) {
    assert.notEqual(entry.turnstile, "required", `${entry.id} would challenge machine traffic`);
    assert.notEqual(entry.turnstile, "always", `${entry.id} would challenge machine traffic`);
  }
  assert.equal(surface("provider_callbacks").must_not_challenge, true);
  assert.equal(surface("frappe_api").turnstile, "never_generic");
});

test("signup is the only immediate Turnstile candidate and still requires server verification", () => {
  assert.equal(policy.turnstile.adopt_now, false);
  assert.equal(policy.turnstile.candidate, "public_signup");
  assert.ok(policy.turnstile.required_before_adoption.includes("server_side_siteverify"));
  assert.equal(surface("public_signup").application_guard, "honeypot_plus_hashed_email_ip_limits");
});

test("control-plane Access remains defense in depth", () => {
  const admin = surface("control_plane_admin");
  assert.equal(admin.must_preserve_application_auth, true);
  assert.equal(admin.access, "recommended_defense_in_depth");
});

test("production Gateway source closes workers.dev and Preview URL bypasses", () => {
  assert.equal(policy.origin_exposure.gateway.workers_dev, false);
  assert.equal(policy.origin_exposure.gateway.preview_urls, false);
  assert.match(gatewayWrangler, /"workers_dev"\s*:\s*false/);
  assert.match(gatewayWrangler, /"preview_urls"\s*:\s*false/);
  assert.doesNotMatch(gatewayWrangler, /"workers_dev"\s*:\s*true/);
  assert.doesNotMatch(gatewayWrangler, /"preview_urls"\s*:\s*true/);
});
