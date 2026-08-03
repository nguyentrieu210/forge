import test from "node:test";
import assert from "node:assert/strict";
import {
  BatchExecutionError,
  executeBatch,
} from "../dist/packages/batch-executor/src/index.js";

class MemoryReplayStore {
  constructor() {
    this.entries = new Map();
    this.claims = new Set();
    this.releases = 0;
    this.completions = 0;
  }

  key(scope) {
    return `${scope.tenantId}:${scope.idempotencyKey}`;
  }

  async claim(scope) {
    const key = this.key(scope);
    const existing = this.entries.get(key);
    if (existing) return { state: "replay", requestHash: existing.requestHash, result: existing.result };
    if (this.claims.has(key)) return { state: "in_flight", requestHash: scope.requestHash };
    this.claims.add(key);
    return { state: "acquired" };
  }

  async complete(scope, result) {
    const key = this.key(scope);
    this.entries.set(key, { requestHash: scope.requestHash, result });
    this.claims.delete(key);
    this.completions += 1;
  }

  async release(scope) {
    this.claims.delete(this.key(scope));
    this.releases += 1;
  }
}

const context = {
  tenantId: "tenant-server-authority",
  actor: { user_id: "operator@example.com", roles: ["Operator"] },
  traceId: "trace-1",
};

function plan(overrides = {}) {
  return {
    batchId: "batch-1",
    requestHash: "hash-1",
    mode: "preview",
    atomicity: "independent",
    items: [
      { id: "row-a", value: { amount: 1, tenantId: "client-spoof" } },
      { id: "row-b", value: { amount: 2 } },
    ],
    ...overrides,
  };
}

test("preview uses only preview callback, trusted context and deterministic item order", async () => {
  const commits = [];
  const previews = [];
  const result = await executeBatch({
    plan: plan(),
    context,
    domain: {
      async preview(item, itemContext) {
        previews.push({ item, itemContext });
        return item.amount * 10;
      },
      async commit(item) {
        commits.push(item);
        return item.amount;
      },
    },
  });

  assert.equal(commits.length, 0);
  assert.deepEqual(previews.map((entry) => entry.itemContext.tenantId), [context.tenantId, context.tenantId]);
  assert.deepEqual(previews.map((entry) => entry.itemContext.actor), [context.actor, context.actor]);
  assert.deepEqual(result.items.map((entry) => entry.itemId), ["row-a", "row-b"]);
  assert.deepEqual(result.items.map((entry) => entry.operationId), ["batch-1:row-a", "batch-1:row-b"]);
  assert.deepEqual(result.items.map((entry) => entry.status), ["success", "success"]);
});

test("independent commit continues failed items and exact replay does not duplicate side effects", async () => {
  const replayStore = new MemoryReplayStore();
  const committed = [];
  const options = {
    plan: plan({ mode: "commit", idempotencyKey: "idem-1" }),
    context,
    replayStore,
    domain: {
      async preview() {
        throw new Error("preview must not run");
      },
      async commit(item, itemContext) {
        committed.push(itemContext.operationId);
        if (item.amount === 1) throw new Error("row rejected");
        return item.amount * 100;
      },
    },
  };

  const first = await executeBatch(options);
  const second = await executeBatch(options);

  assert.deepEqual(first.items.map((entry) => entry.status), ["error", "success"]);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.items, first.items);
  assert.deepEqual(committed, ["batch-1:row-a", "batch-1:row-b"]);
  assert.equal(replayStore.completions, 1);
});

test("same idempotency key with a different request hash fails closed", async () => {
  const replayStore = new MemoryReplayStore();
  const domain = {
    async preview(item) { return item.amount; },
    async commit(item) { return item.amount; },
  };

  await executeBatch({
    plan: plan({ mode: "commit", idempotencyKey: "idem-conflict" }),
    context,
    replayStore,
    domain,
  });

  await assert.rejects(
    executeBatch({
      plan: plan({ mode: "commit", idempotencyKey: "idem-conflict", requestHash: "hash-other" }),
      context,
      replayStore,
      domain,
    }),
    (error) => error instanceof BatchExecutionError && error.code === "BATCH_IDEMPOTENCY_CONFLICT",
  );
});

test("commit cannot run without replay protection", async () => {
  let commitCalls = 0;
  await assert.rejects(
    executeBatch({
      plan: plan({ mode: "commit", idempotencyKey: "idem-required" }),
      context,
      domain: {
        async preview() { return 1; },
        async commit() { commitCalls += 1; return 1; },
      },
    }),
    (error) => error instanceof BatchExecutionError && error.code === "BATCH_REPLAY_STORE_REQUIRED",
  );
  assert.equal(commitCalls, 0);
});

test("atomic commit refuses execution without an authoritative transaction runner", async () => {
  const replayStore = new MemoryReplayStore();
  let commitCalls = 0;
  await assert.rejects(
    executeBatch({
      plan: plan({ mode: "commit", atomicity: "atomic", idempotencyKey: "idem-atomic" }),
      context,
      replayStore,
      domain: {
        async preview() { return 1; },
        async commit() { commitCalls += 1; return 1; },
      },
    }),
    (error) => error instanceof BatchExecutionError && error.code === "BATCH_ATOMIC_RUNNER_REQUIRED",
  );
  assert.equal(commitCalls, 0);
});

test("failed atomic commit releases replay claim and records rollback correlation", async () => {
  const replayStore = new MemoryReplayStore();
  const audit = [];
  const committed = [];

  await assert.rejects(
    executeBatch({
      plan: plan({ mode: "commit", atomicity: "atomic", idempotencyKey: "idem-rollback" }),
      context,
      replayStore,
      audit: { async record(event) { audit.push(event); } },
      atomicRunner: {
        async run(work) {
          try {
            return await work();
          } catch (error) {
            committed.length = 0;
            throw error;
          }
        },
      },
      domain: {
        async preview() { return 1; },
        async commit(item, itemContext) {
          committed.push(itemContext.operationId);
          if (item.amount === 2) throw new Error("second row failed");
          return item.amount;
        },
      },
    }),
    (error) => error instanceof BatchExecutionError && error.code === "BATCH_ATOMIC_COMMIT_FAILED",
  );

  assert.deepEqual(committed, []);
  assert.equal(replayStore.completions, 0);
  assert.equal(replayStore.releases, 1);
  assert.ok(audit.some((event) => event.type === "item.rolled_back" && event.operationId === "batch-1:row-a"));
  assert.ok(audit.some((event) => event.type === "batch.failed"));
});

test("duplicate item ids fail before any domain callback", async () => {
  let calls = 0;
  await assert.rejects(
    executeBatch({
      plan: plan({ items: [{ id: "dup", value: {} }, { id: "dup", value: {} }] }),
      context,
      domain: {
        async preview() { calls += 1; return 1; },
        async commit() { calls += 1; return 1; },
      },
    }),
    (error) => error instanceof BatchExecutionError && error.code === "BATCH_DUPLICATE_ITEM_ID",
  );
  assert.equal(calls, 0);
});
