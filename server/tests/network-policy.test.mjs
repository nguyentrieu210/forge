import test from "node:test";
import assert from "node:assert/strict";
import {
  assertIpAllowed,
  evaluateIpAllowlist,
  parseIpAllowlist,
} from "../dist/packages/organization-security/src/network-policy.js";

test("empty network policy is intentionally unrestricted", () => {
  assert.deepEqual(parseIpAllowlist(""), []);
  assert.deepEqual(evaluateIpAllowlist("203.0.113.7", []), {
    configured: false,
    allowed: true,
    matched_rule: null,
  });
});

test("IPv4 exact addresses normalize to /32 and CIDR networks are canonicalized", () => {
  assert.deepEqual(parseIpAllowlist(JSON.stringify([
    "203.0.113.7",
    "10.24.31.99/16",
    "10.24.0.0/16",
  ])), [
    "203.0.113.7/32",
    "10.24.0.0/16",
  ]);
  assert.equal(assertIpAllowed("10.24.200.9", '["10.24.31.99/16"]').matched_rule, "10.24.0.0/16");
  assert.throws(() => assertIpAllowed("10.25.0.1", '["10.24.0.0/16"]'), /Network access policy denied/);
});

test("IPv6 compressed forms and mapped IPv4 tails are evaluated correctly", () => {
  const rules = parseIpAllowlist(["2001:db8:abcd::1234/48", "::ffff:192.0.2.1/128"]);
  assert.deepEqual(rules, ["2001:db8:abcd::/48", "::ffff:c000:201/128"]);
  assert.equal(evaluateIpAllowlist("2001:db8:abcd:7::1", rules).allowed, true);
  assert.equal(evaluateIpAllowlist("2001:db8:abce::1", rules).allowed, false);
  assert.equal(evaluateIpAllowlist("::ffff:192.0.2.1", rules).allowed, true);
});

test("invalid configured policies fail closed instead of widening access", () => {
  for (const invalid of [
    "not-json",
    '{"cidr":"10.0.0.0/8"}',
    '["999.1.1.1"]',
    '["10.0.0.0/33"]',
    '["2001:db8::/129"]',
    '["2001:db8:::1"]',
  ]) {
    assert.throws(() => parseIpAllowlist(invalid), /IP allowlist/);
  }
});

test("malformed client addresses are denied when policy is configured", () => {
  const decision = evaluateIpAllowlist("not-an-ip", ["10.0.0.0/8"]);
  assert.deepEqual(decision, { configured: true, allowed: false, matched_rule: null });
});

test("policy size and duplicate rules are bounded", () => {
  const duplicate = Array.from({ length: 10 }, () => "10.0.0.1/8");
  assert.deepEqual(parseIpAllowlist(duplicate), ["10.0.0.0/8"]);
  assert.throws(
    () => parseIpAllowlist(Array.from({ length: 257 }, (_, index) => `10.0.${index % 255}.0/24`)),
    /too large/,
  );
});
