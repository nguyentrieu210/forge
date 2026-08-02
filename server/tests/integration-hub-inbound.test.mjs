import test from "node:test";
import assert from "node:assert/strict";
import {
  assertInboundBodySize,
  deriveInboundDeliveryId,
  normalizeSha256Signature,
  parseInboundJson,
  validateInboundWebhookPolicy,
  verifyHmacSha256Signature,
} from "../dist/packages/integration-hub/src/inbound.js";

function policy(overrides = {}) {
  return {
    provider: "facebook",
    endpoint_key: "pages",
    signature_header: "x-hub-signature-256",
    max_body_bytes: 1_000_000,
    secret_ref: "credential://social/facebook-app-secret",
    ...overrides,
  };
}

async function hmac(secret, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("inbound webhook policy is bounded and stores only credential references", () => {
  assert.equal(validateInboundWebhookPolicy(policy()).endpoint_key, "pages");
  assert.throws(() => validateInboundWebhookPolicy(policy({ provider: "" })), /provider/);
  assert.throws(() => validateInboundWebhookPolicy(policy({ max_body_bytes: 20_000_000 })), /max_body_bytes/);
  assert.throws(() => validateInboundWebhookPolicy(policy({ signature_header: "bad header" })), /signature header/);
  assert.throws(() => validateInboundWebhookPolicy(policy({ secret_ref: "" })), /secret_ref/);
});

test("generic HMAC-SHA256 verification accepts prefixed or raw signatures and rejects tampering", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const body = JSON.stringify({ hello: "world" });
  const digest = await hmac(secret, body);
  assert.equal(await verifyHmacSha256Signature(body, `sha256=${digest}`, secret), true);
  assert.equal(await verifyHmacSha256Signature(body, digest, secret), true);
  assert.equal(await verifyHmacSha256Signature(`${body}x`, digest, secret), false);
  assert.equal(await verifyHmacSha256Signature(body, "sha256=bad", secret), false);
  assert.equal(await verifyHmacSha256Signature(body, null, secret), false);
});

test("inbound identity is deterministic for provider endpoint and exact raw bytes", async () => {
  const body = "{\"a\":1}";
  const first = await deriveInboundDeliveryId("facebook", "pages", body);
  const same = await deriveInboundDeliveryId("facebook", "pages", body);
  const differentBody = await deriveInboundDeliveryId("facebook", "pages", "{\"a\":2}");
  const differentEndpoint = await deriveInboundDeliveryId("facebook", "comments", body);
  assert.equal(first, same);
  assert.notEqual(first, differentBody);
  assert.notEqual(first, differentEndpoint);
  assert.match(first, /^inb_[a-f0-9]{48}$/);
});

test("inbound payload size is byte-based and JSON parsing fails closed", () => {
  assert.doesNotThrow(() => assertInboundBodySize("abc", 3));
  assert.throws(() => assertInboundBodySize("á", 1), /too large/);
  assert.deepEqual(parseInboundJson("{\"ok\":true}", 100), { ok: true });
  assert.throws(() => parseInboundJson("not-json", 100), /Invalid inbound webhook JSON/);
});

test("signature normalization rejects malformed digests", () => {
  const digest = "a".repeat(64);
  assert.equal(normalizeSha256Signature(`sha256=${digest}`), digest);
  assert.equal(normalizeSha256Signature(digest.toUpperCase()), digest);
  assert.equal(normalizeSha256Signature("sha1=" + digest), null);
  assert.equal(normalizeSha256Signature("a".repeat(63)), null);
});
