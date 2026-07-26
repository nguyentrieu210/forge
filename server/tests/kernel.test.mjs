
import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { makeCommand } from "../dist/packages/test-harness/src/index.js";

const baseOrder = {
  customer: "CUST-1",
  company: "Demo",
  currency: "USD",
  transaction_date: "2026-07-23",
  items: [{ row_id: "ROW-1", item_code: "ITEM-1", qty: 2, rate: 10 }],
  taxes: [],
};

test("same command is idempotent and command reuse with another payload is rejected", async () => {
  const store = new InMemoryMutationStore();
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, undefined, () => "2026-07-23T00:00:00.000Z");
  const command = await makeCommand({ commandId: "cmd-1", doctype: "Sales Order", name: "SO-1", action: "create", expectedVersion: null, document: baseOrder });
  const first = await kernel.execute(command);
  const second = await kernel.execute(command);
  assert.deepEqual(second, first);

  const reused = await makeCommand({ commandId: "cmd-1", doctype: "Sales Order", name: "SO-1", action: "create", expectedVersion: null, document: { ...baseOrder, customer: "OTHER" } });
  await assert.rejects(kernel.execute(reused), (error) => error.code === "IDEMPOTENCY_KEY_REUSED");

  const crossActorReplay = await makeCommand({
    commandId: "cmd-1", doctype: "Sales Order", name: "SO-1", action: "create", expectedVersion: null, document: baseOrder,
    actor: { user_id: "other-manager@example.com", roles: ["System Manager"] },
  });
  await assert.rejects(kernel.execute(crossActorReplay), (error) => error.code === "IDEMPOTENCY_KEY_REUSED");
});

test("one optimistic update wins under concurrent commands", async () => {
  const store = new InMemoryMutationStore();
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, undefined, () => "2026-07-23T00:00:00.000Z");
  const create = await makeCommand({ commandId: "create", doctype: "Sales Order", name: "SO-C", action: "create", expectedVersion: null, document: baseOrder });
  await kernel.execute(create);
  const commands = await Promise.all(Array.from({ length: 100 }, (_, index) => makeCommand({
    commandId: `save-${index}`,
    doctype: "Sales Order",
    name: "SO-C",
    action: "save",
    expectedVersion: 1,
    document: { ...baseOrder, customer: `CUST-${index}` },
  })));
  const results = await Promise.allSettled(commands.map((command) => kernel.execute(command)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.code === "VERSION_CONFLICT").length, 99);
  const saved = await store.getDocument("demo", "Sales Order", "SO-C");
  assert.equal(saved.version, 2);
});
