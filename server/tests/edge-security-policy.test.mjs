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

test("CF4 policy cannot self-activate production perimeter changes", () => {
  assert.equal(policy.status, "review_only");
  assert.equal(policy.production_activation, "requires_explicit_user_approval");
  assert.equal(policy.waf_and_rate_limit.default_phase, "log/observe");
});

test("Forge authentication and authorization remain authoritative behind the perimeter", () => {
  assert.equal(policy.global_invariants.never_replace_forge_authentication, true);
  assert.equal(policy.global_invariants.never_replace_forge_authorization, true);
  assert.equal(policy.access.tenant_product_login, "rejected");
  assert.equal(policy.access.service_tokens.application_auth_still_required, true);
});

test("unmeasured Cloudflare rate limits never invent numeric thresholds", () => {
  for (const entry of policy.surfaces) {
    assert.equal(
      entry.edge_rate_limit.threshold,
      null,
      `${entry.id} has a numeric edge threshold without measured Forge evidence`,
    );
  }
  assert.match(policy.waf_and_rate_limit.threshold_policy, /forbidden until backed by Forge traffic\/abuse\/cost evidence/i);
});

test("machine ingress is never forced through a generic Turnstile contract", () => {
  for (const entry of policy.surfaces.filter((candidate) => candidate.machine_traffic)) {
    assert.notEqual(entry.turnstile, "required", `${entry.id} would challenge machine traffic`);
    assert.notEqual(entry.turnstile, "always", `${entry.id} would challenge machine traffic`);
  }
  assert.equal(surface("social_webhook_oauth").must_not_challenge, true);
  assert.equal(surface("frappe_api").turnstile, "never_generic");
});

test("public signup keeps existing application anti-abuse authority while Turnstile is deferred", () => {
  const signup = surface("public_signup");
  assert.equal(signup.application_guard.kind, "honeypot_plus_hashed_email_ip_limits");
  assert.equal(signup.application_guard.reference, "3/email/hour and 10/ip/hour");
  assert.equal(signup.turnstile, "recommended_after_client_token_and_siteverify_seam");
  assert.equal(policy.turnstile.adopt_now, false);
  assert.ok(policy.turnstile.required_before_adoption.includes("server-side Siteverify validation"));
});

test("login edge policy does not weaken the persistent application rate guard", () => {
  const login = surface("login");
  assert.equal(login.application_guard.reference, "30 attempts per client IP per 15 minutes");
  assert.equal(login.edge_rate_limit.mode, "observe_then_calibrate");
  assert.equal(login.edge_rate_limit.threshold, null);
});

test("control-plane Access is defense in depth, not an authorization replacement", () => {
  for (const id of ["control_plane_admin", "custom_domain_governance"]) {
    const entry = surface(id);
    assert.equal(entry.must_preserve_application_auth, true);
    assert.match(entry.access, /in_front_of_existing_control_auth/);
  }
});

test("production Gateway cannot expose workers.dev or Preview URL bypasses", () => {
  assert.equal(policy.origin_exposure.gateway.workers_dev, false);
  assert.equal(policy.origin_exposure.gateway.preview_urls, false);
  assert.match(gatewayWrangler, /"workers_dev"\s*:\s*false/);
  assert.match(gatewayWrangler, /"preview_urls"\s*:\s*false/);
  assert.doesNotMatch(gatewayWrangler, /"workers_dev"\s*:\s*true/);
  assert.doesNotMatch(gatewayWrangler, /"preview_urls"\s*:\s*true/);
});
