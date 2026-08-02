import test from "node:test";
import assert from "node:assert/strict";
import { hmacHex, verifyMetaSignature } from "../dist/packages/social-commerce/src/index.js";
import { deriveInboundDeliveryId, verifyHmacSha256Signature } from "../dist/packages/integration-hub/src/inbound.js";

test("generic inbound HMAC contract is compatible with existing Facebook signature verification", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const rawBody = JSON.stringify({ object: "page", entry: [{ id: "page-1", time: 1785715200 }] });
  const digest = await hmacHex(secret, rawBody);
  const header = `sha256=${digest}`;
  assert.equal(await verifyMetaSignature(rawBody, header, secret), true);
  assert.equal(await verifyHmacSha256Signature(rawBody, header, secret), true);
  assert.equal(await verifyMetaSignature(`${rawBody}x`, header, secret), false);
  assert.equal(await verifyHmacSha256Signature(`${rawBody}x`, header, secret), false);
});

test("generic inbound dedupe identity is provider/endpoint/raw-byte scoped", async () => {
  const rawBody = "{\"object\":\"page\"}";
  const first = await deriveInboundDeliveryId("facebook", "pages", rawBody);
  const same = await deriveInboundDeliveryId("facebook", "pages", rawBody);
  const otherEndpoint = await deriveInboundDeliveryId("facebook", "comments", rawBody);
  assert.equal(first, same);
  assert.notEqual(first, otherEndpoint);
});
