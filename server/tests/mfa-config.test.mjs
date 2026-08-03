import test from "node:test";
import assert from "node:assert/strict";
import { mfaKeyRingFromEnv } from "../dist/apps/tenant-worker/src/mfa-config.js";

const CURRENT = Buffer.alloc(32, 1).toString("base64");
const PREVIOUS = Buffer.alloc(32, 2).toString("base64");

test("MFA keyring is absent when no dedicated key generation is configured", () => {
  assert.equal(mfaKeyRingFromEnv({}), undefined);
});

test("partial current MFA key configuration stays unavailable rather than inventing a key", () => {
  assert.equal(mfaKeyRingFromEnv({ MFA_KEY_ID: "mfa-k1" }), undefined);
  assert.equal(mfaKeyRingFromEnv({ MFA_KEK: CURRENT }), undefined);
});

test("current MFA key generation is exposed only as the dedicated MFA keyring", () => {
  assert.deepEqual(mfaKeyRingFromEnv({ MFA_KEY_ID: "mfa-k1", MFA_KEK: CURRENT }), {
    current: { keyId: "mfa-k1", kekBase64: CURRENT },
  });
});

test("previous generation remains decrypt-only during key rotation", () => {
  assert.deepEqual(mfaKeyRingFromEnv({
    MFA_KEY_ID: "mfa-k2",
    MFA_KEK: CURRENT,
    MFA_KEY_ID_PREVIOUS: "mfa-k1",
    MFA_KEK_PREVIOUS: PREVIOUS,
  }), {
    current: { keyId: "mfa-k2", kekBase64: CURRENT },
    previous: [{ keyId: "mfa-k1", kekBase64: PREVIOUS }],
  });
});

test("an incomplete previous generation is ignored instead of shadowing the current key", () => {
  assert.deepEqual(mfaKeyRingFromEnv({
    MFA_KEY_ID: "mfa-k2",
    MFA_KEK: CURRENT,
    MFA_KEY_ID_PREVIOUS: "mfa-k1",
  }), {
    current: { keyId: "mfa-k2", kekBase64: CURRENT },
  });
});
