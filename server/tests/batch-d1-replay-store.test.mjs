import assert from "node:assert/strict";
import test from "node:test";

import { D1BatchReplayStore } from "../dist/packages/batch-executor/src/d1-replay-store.js";

class FakeD1 {
  constructor() { this.rows = new Map(); }
  withSession() { return this; }
  key(tenant, idem) { return `${tenant}\u0000${idem}`; }
  prepare(sql) {
    return {
      bind: (...args) => ({
        run: async () => this.run(sql, args),
        first: async () => this.first(sql, args),
      }),
    };
  }
  async run(sql, args) {
    if (sql.includes("INSERT OR IGNORE INTO batch_replay_claims")) {
      const [tenant, idem, hash, now] = args;
      const key = this.key(tenant, idem);
      if (this.rows.has(key)) return { meta: { changes: 0 } };
      this.rows.set(key, {
        request_hash: hash,
        status: "in_flight",
        result_json: null,
        created_at: now,
        updated_at: now,
      });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET status='completed'")) {
      const [resultJson, now, tenant, idem, hash] = args;
      const row = this.rows.get(this.key(tenant, idem));
      if (!row || row.request_hash !== hash || row.status !== "in_flight") return { meta: { changes: 0 } };
      Object.assign(row, { status: "completed", result_json: resultJson, updated_at: now });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET status='blocked'")) {
      const [now, tenant, idem, hash] = args;
      const row = this.rows.get(this.key(tenant, idem));
      if (!row || row.request_hash !== hash || row.status !== "in_flight") return { meta: { changes: 0 } };
      Object.assign(row, { status: "blocked", updated_at: now });
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  async first(sql, args) {
    if (!sql.includes("FROM batch_replay_claims")) throw new Error(`Unexpected SQL: ${sql}`);
    const [tenant, idem] = args;
    return this.rows.get(this.key(tenant, idem)) ?? null;
  }
}

const scope = {
  tenantId: "tenant-a",
  idempotencyKey: "idem-a",
  requestHash: "hash-a",
};

test("D1 replay store atomically distinguishes acquired, in-flight and completed replay", async () => {
  const db = new FakeD1();
  const store = new D1BatchReplayStore(db);

  assert.deepEqual(await store.claim(scope), { state: "acquired" });
  assert.deepEqual(await store.claim(scope), { state: "in_flight", requestHash: "hash-a" });

  const result = { batchId: "batch-a", replayed: false, items: [] };
  await store.complete(scope, result);
  assert.deepEqual(await store.claim(scope), {
    state: "replay",
    requestHash: "hash-a",
    result,
  });
});

test("D1 replay store preserves stored hash for executor conflict detection", async () => {
  const store = new D1BatchReplayStore(new FakeD1());
  await store.claim(scope);
  assert.deepEqual(await store.claim({ ...scope, requestHash: "hash-other" }), {
    state: "in_flight",
    requestHash: "hash-a",
  });
});

test("release fails closed by blocking rather than deleting an ambiguous claim", async () => {
  const db = new FakeD1();
  const store = new D1BatchReplayStore(db);
  await store.claim(scope);
  await store.release(scope);

  const row = db.rows.get(db.key(scope.tenantId, scope.idempotencyKey));
  assert.equal(row.status, "blocked");
  assert.deepEqual(await store.claim(scope), { state: "in_flight", requestHash: "hash-a" });
});
