import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../dist/packages/clouderp-erpnext/src/manufacturing-costing-exact.js", import.meta.url).href;

async function loadModule() {
  return import(moduleUrl);
}

test("manufacturing cost freeze rejects a snapshot fingerprint after source drift", async () => {
  const { assertFreezeFingerprint } = await loadModule();
  assert.throws(
    () => assertFreezeFingerprint("snapshot-old", "live-new"),
    (error) => error?.code === "INVALID_LIFECYCLE_TRANSITION"
      && /sources changed after this snapshot/.test(error.message),
  );
});

test("manufacturing cost freeze accepts the exact reviewed source fingerprint", async () => {
  const { assertFreezeFingerprint } = await loadModule();
  assert.doesNotThrow(() => assertFreezeFingerprint("same", "same"));
});
