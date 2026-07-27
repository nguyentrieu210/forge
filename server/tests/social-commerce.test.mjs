import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveFacebookEventId, extractFacebookPageIds, hmacHex, verifyMetaSignature,
} from "../dist/packages/social-commerce/src/index.js";
import { normalizeFacebookEvents } from "../dist/packages/social-commerce/src/tenant-handler.js";

test("Facebook webhook signature is verified against the raw body", async () => {
  const body = JSON.stringify({ object: "page", entry: [{ id: "page-1" }] });
  const signature = `sha256=${await hmacHex("app-secret", body)}`;
  assert.equal(await verifyMetaSignature(body, signature, "app-secret"), true);
  assert.equal(await verifyMetaSignature(`${body} `, signature, "app-secret"), false);
  assert.equal(await verifyMetaSignature(body, null, "app-secret"), false);
});

test("Facebook page ids and stable envelope id are derived without exposing directory ids", async () => {
  const payload = { object: "page", entry: [{ id: "page-1" }, { id: "page-1" }, { id: "page-2" }] };
  assert.deepEqual(extractFacebookPageIds(payload), ["page-1", "page-2"]);
  assert.equal(await deriveFacebookEventId(JSON.stringify(payload)), await deriveFacebookEventId(JSON.stringify(payload)));
});

test("Facebook comment is normalized for keyword cart automation", async () => {
  const payload = { entry: [{ id: "page-1", time: 1_700_000_000, changes: [{
    field: "feed", value: { from: { id: "buyer-1" }, message: "RED-M" },
  }] }] };
  const events = await normalizeFacebookEvents(payload, "facebook:abc", "2026-07-27T00:00:00.000Z");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    event_id: "facebook:abc:0", provider: "facebook", page_id: "page-1", event_kind: "feed",
    external_actor_id: "buyer-1", message_text: "RED-M", occurred_at: "2023-11-14T22:13:20.000Z",
    payload: payload.entry[0].changes[0],
  });
});
