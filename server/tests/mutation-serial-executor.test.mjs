import test from "node:test";
import assert from "node:assert/strict";
import { MutationSerialExecutor } from "../dist/packages/document-kernel/src/index.js";

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("MutationSerialExecutor serializes the complete async operation", async () => {
  const executor = new MutationSerialExecutor();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  const first = executor.execute(async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
    return "first";
  });
  const second = executor.execute(async () => {
    events.push("second:start");
    events.push("second:end");
    return "second";
  });

  await tick();
  assert.deepEqual(events, ["first:start"]);

  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
});

test("MutationSerialExecutor releases the queue after a rejected mutation", async () => {
  const executor = new MutationSerialExecutor();
  await assert.rejects(
    executor.execute(async () => {
      throw new Error("expected failure");
    }),
    /expected failure/,
  );

  assert.equal(await executor.execute(async () => 42), 42);
});
