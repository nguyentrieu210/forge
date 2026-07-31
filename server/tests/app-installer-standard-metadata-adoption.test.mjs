import test from "node:test";
import assert from "node:assert/strict";
import { canAdoptPlatformDocType } from "../dist/packages/app-registry/src/index.js";

test("authoritative apps may adopt only platform-standard non-custom DocTypes", () => {
  assert.equal(canAdoptPlatformDocType(0, false), true);
  assert.equal(canAdoptPlatformDocType("0", false), true);

  assert.equal(canAdoptPlatformDocType(1, false), false, "customer-created custom metadata must stay protected");
  assert.equal(canAdoptPlatformDocType(0, true), false, "an incoming custom definition cannot claim a standard DocType");
  assert.equal(canAdoptPlatformDocType(null, false), false, "an absent row is handled by the core installer, not adoption");
  assert.equal(canAdoptPlatformDocType(undefined, false), false);
});
