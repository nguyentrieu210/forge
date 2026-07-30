import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

test("purchase allocation rollout is disabled by default and explicitly enabled", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  assert.equal(await store.isPurchaseAllocationEnabled("alu"), false);
  store.setPurchaseAllocationEnabled(true);
  assert.equal(await store.isPurchaseAllocationEnabled("alu"), true);
  store.setPurchaseAllocationEnabled(false);
  assert.equal(await store.isPurchaseAllocationEnabled("alu"), false);
});
