import test from "node:test";
import assert from "node:assert/strict";
import { D1GuardedDailyDetailedLedgerService } from "../dist/packages/document-kernel/src/guarded-daily-detailed-ledger.js";

const ACTOR = { user_id: "chief@example.test", roles: ["Chief Accountant"] };
const SNAPSHOT = {
  snapshot_id: "DLS-OLD",
  context_key: JSON.stringify(["2026-08-02", "ALUMDOOR", "Main", "", ""]),
  source_fingerprint: "a".repeat(64),
  ledger_date: "2026-08-02",
  company: "ALUMDOOR",
  warehouse: "Main",
  customer: "",
  sales_order: "",
};

function db({ snapshot = SNAPSHOT, frozen = null } = {}) {
  const binds = [];
  return {
    binds,
    prepare(sql) {
      return {
        bind(...args) {
          binds.push({ sql, args });
          if (sql.includes("FROM daily_ledger_snapshots")) {
            return { async first() { return snapshot; } };
          }
          if (sql.includes("FROM daily_ledger_freezes")) {
            return { async first() { return frozen; } };
          }
          throw new Error(`Unexpected guard SQL: ${sql.slice(0, 100)}`);
        },
      };
    },
  };
}

function delegate(overrides = {}) {
  return {
    async generate() { throw new Error("unexpected generate"); },
    async read() { throw new Error("unexpected read"); },
    async reconcile() { throw new Error("unexpected reconcile"); },
    async freeze() { throw new Error("unexpected freeze"); },
    async adjust() { throw new Error("unexpected adjust"); },
    ...overrides,
  };
}

test("first freeze rechecks current source fingerprint before locking", async () => {
  const database = db();
  let generatedContext;
  let freezeCalls = 0;
  const service = new D1GuardedDailyDetailedLedgerService(database, delegate({
    async generate(tenantId, actor, context) {
      assert.equal(tenantId, "tenant-a");
      assert.deepEqual(actor, ACTOR);
      generatedContext = context;
      return {
        snapshot_id: SNAPSHOT.snapshot_id,
        context_key: SNAPSHOT.context_key,
        source_fingerprint: SNAPSHOT.source_fingerprint,
        line_count: 6,
        existing: true,
        frozen: false,
      };
    },
    async freeze(tenantId, actor, snapshotId, reason) {
      freezeCalls += 1;
      assert.equal(tenantId, "tenant-a");
      assert.deepEqual(actor, ACTOR);
      assert.equal(snapshotId, SNAPSHOT.snapshot_id);
      assert.equal(reason, "close day");
      return { snapshot_id: snapshotId, context_key: SNAPSHOT.context_key, existing: false };
    },
  }));

  const result = await service.freeze("tenant-a", ACTOR, SNAPSHOT.snapshot_id, "close day", "2026-08-02T18:00:00.000Z");
  assert.equal(result.existing, false);
  assert.equal(freezeCalls, 1);
  assert.deepEqual(generatedContext, {
    ledger_date: "2026-08-02",
    company: "ALUMDOOR",
    warehouse: "Main",
    customer: "",
    sales_order: "",
  });
  assert.equal(database.binds[0].args[0], "tenant-a");
  assert.equal(database.binds[0].args[1], SNAPSHOT.snapshot_id);
});

test("first freeze fails closed when source changed after snapshot", async () => {
  const database = db();
  let freezeCalls = 0;
  const service = new D1GuardedDailyDetailedLedgerService(database, delegate({
    async generate() {
      return {
        snapshot_id: "DLS-CURRENT",
        context_key: SNAPSHOT.context_key,
        source_fingerprint: "b".repeat(64),
        line_count: 7,
        existing: false,
        frozen: false,
      };
    },
    async freeze() {
      freezeCalls += 1;
      return { snapshot_id: SNAPSHOT.snapshot_id, context_key: SNAPSHOT.context_key, existing: false };
    },
  }));

  await assert.rejects(
    () => service.freeze("tenant-a", ACTOR, SNAPSHOT.snapshot_id, "close day"),
    (error) => error?.code === "LIFECYCLE_ERROR" && /source changed/i.test(error.message),
  );
  assert.equal(freezeCalls, 0);
});

test("already-frozen same snapshot stays idempotent without live recheck", async () => {
  const database = db({ frozen: { snapshot_id: SNAPSHOT.snapshot_id } });
  let generateCalls = 0;
  const service = new D1GuardedDailyDetailedLedgerService(database, delegate({
    async generate() {
      generateCalls += 1;
      throw new Error("live source must not be re-read on completed freeze replay");
    },
    async freeze(tenantId, actor, snapshotId) {
      assert.equal(tenantId, "tenant-a");
      assert.deepEqual(actor, ACTOR);
      return { snapshot_id: snapshotId, context_key: SNAPSHOT.context_key, existing: true };
    },
  }));

  const result = await service.freeze("tenant-a", ACTOR, SNAPSHOT.snapshot_id, "retry");
  assert.equal(result.existing, true);
  assert.equal(generateCalls, 0);
});

test("freeze permission is checked before snapshot existence lookup", async () => {
  const database = {
    prepare() { throw new Error("database must not be touched for unauthorized actor"); },
  };
  const service = new D1GuardedDailyDetailedLedgerService(database, delegate());

  await assert.rejects(
    () => service.freeze("tenant-a", { user_id: "stock@example.test", roles: ["Stock Manager"] }, SNAPSHOT.snapshot_id),
    (error) => error?.code === "PERMISSION_DENIED",
  );
});

test("freeze lookup remains tenant scoped and missing snapshot fails closed", async () => {
  const database = db({ snapshot: null });
  const service = new D1GuardedDailyDetailedLedgerService(database, delegate());

  await assert.rejects(
    () => service.freeze("tenant-b", ACTOR, "DLS-FOREIGN"),
    (error) => error?.code === "NOT_FOUND",
  );
  assert.equal(database.binds[0].args[0], "tenant-b");
  assert.equal(database.binds[0].args[1], "DLS-FOREIGN");
});
