import test from "node:test";
import assert from "node:assert/strict";
import {
  D1DailyDetailedLedgerService,
  assertDailyLedgerAdjustmentRole,
  buildDailyLedgerContextKey,
  fingerprintDailyLedgerLines,
} from "../dist/packages/document-kernel/src/daily-detailed-ledger.js";

test("daily ledger context key is normalized and dimension-stable", () => {
  const key = buildDailyLedgerContextKey({
    ledger_date: "2026-08-01",
    company: "  Demo  ",
    warehouse: " Main ",
    customer: " CUST-1 ",
    sales_order: " SO-1 ",
  });
  assert.equal(key, JSON.stringify(["2026-08-01", "Demo", "Main", "CUST-1", "SO-1"]));
  assert.throws(
    () => buildDailyLedgerContextKey({ ledger_date: "2026-02-31", company: "Demo" }),
    (error) => error.code === "VALIDATION_ERROR",
  );
});

test("daily ledger source fingerprint is independent of source row order", async () => {
  const inventory = {
    line_key: "Inventory:Stock Entry:STE-1:1:A",
    domain: "Inventory",
    source_type: "Stock Entry",
    source_ref: "STE-1",
    metric: "stock_value_difference",
    quantity_micros: 1_000_000,
    amount_minor: 50_000,
    currency: "VND",
    details_json: '{"item_code":"A"}',
  };
  const finance = {
    line_key: "Finance:GL:Sales Invoice:SI-1:1:AR",
    domain: "Finance",
    source_type: "Sales Invoice",
    source_ref: "SI-1",
    metric: "gl_net",
    quantity_micros: 0,
    amount_minor: 50_000,
    currency: "VND",
    details_json: '{"account":"131"}',
  };
  const first = await fingerprintDailyLedgerLines([inventory, finance]);
  const second = await fingerprintDailyLedgerLines([finance, inventory]);
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);

  const changed = await fingerprintDailyLedgerLines([
    inventory,
    { ...finance, amount_minor: 50_001 },
  ]);
  assert.notEqual(first, changed);
});

test("post-freeze adjustments require accounting leadership roles", () => {
  assert.doesNotThrow(() => assertDailyLedgerAdjustmentRole({
    user_id: "chief@example.com",
    roles: ["Chief Accountant"],
  }));
  assert.doesNotThrow(() => assertDailyLedgerAdjustmentRole({
    user_id: "director@example.com",
    roles: ["Giám đốc"],
  }));
  assert.doesNotThrow(() => assertDailyLedgerAdjustmentRole({
    user_id: "Administrator",
    roles: [],
  }));
  assert.throws(
    () => assertDailyLedgerAdjustmentRole({ user_id: "stock@example.com", roles: ["Stock Manager"] }),
    (error) => error.code === "PERMISSION_DENIED",
  );
  assert.throws(
    () => assertDailyLedgerAdjustmentRole({ user_id: "manager@example.com", roles: ["System Manager"] }),
    (error) => error.code === "PERMISSION_DENIED",
  );
});

function sourceLine(domain, overrides = {}) {
  return {
    line_key: `${domain}:TYPE:DOC-1:LINE-1`,
    domain,
    source_type: `${domain} Document`,
    source_ref: "DOC-1",
    metric: "document",
    quantity_micros: 1_000_000,
    amount_minor: 100_000,
    currency: "VND",
    details_json: '{}',
    ...overrides,
  };
}

function reconciliationDb({ snapshotFingerprint, snapshotLines, liveLines }) {
  return {
    prepare(sql) {
      return {
        bind() {
          if (sql.includes("FROM daily_ledger_snapshots s") && sql.includes("LEFT JOIN daily_ledger_freezes")) {
            return {
              async first() {
                return {
                  snapshot_id: "DLS-5-DOMAINS",
                  context_key: JSON.stringify(["2026-08-01", "ALUMDOOR", "", "", ""]),
                  source_fingerprint: snapshotFingerprint,
                };
              },
            };
          }
          if (sql.includes("FROM daily_ledger_snapshot_lines")) {
            return { async all() { return { results: snapshotLines }; } };
          }
          if (sql.includes("WITH source_lines AS")) {
            return { async all() { return { results: liveLines }; } };
          }
          throw new Error(`Unexpected SQL in reconciliation test: ${sql.slice(0, 80)}`);
        },
      };
    },
  };
}

test("daily ledger reconciliation covers Sales, Purchase, Inventory, Manufacturing, Warranty and Finance", async () => {
  const snapshotLines = [
    sourceLine("Sales", { line_key: "Sales:Delivery Note:DN-1:1" }),
    sourceLine("Purchase", { line_key: "Purchase:Purchase Receipt:PR-1:1" }),
    sourceLine("Inventory", { line_key: "Inventory:Stock Entry:SE-1:1" }),
    sourceLine("Manufacturing", { line_key: "Manufacturing:Work Order:WO-1" }),
    sourceLine("Warranty", { line_key: "Warranty:WC-1" }),
    sourceLine("Finance", { line_key: "Finance:GL:Sales Invoice:SI-1:AR" }),
  ];
  const snapshotFingerprint = await fingerprintDailyLedgerLines(snapshotLines);
  const context = { ledger_date: "2026-08-01", company: "ALUMDOOR" };

  const matching = new D1DailyDetailedLedgerService(reconciliationDb({
    snapshotFingerprint,
    snapshotLines,
    liveLines: snapshotLines,
  }));
  const ok = await matching.reconcile("tenant-a", context);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.snapshot_counts, { Sales: 1, Purchase: 1, Inventory: 1, Manufacturing: 1, Warranty: 1, Finance: 1 });
  assert.deepEqual(ok.live_counts, { Sales: 1, Purchase: 1, Inventory: 1, Manufacturing: 1, Warranty: 1, Finance: 1 });
  assert.deepEqual(ok.mismatches, []);

  const changedFinance = snapshotLines.map((line) => line.domain === "Finance"
    ? { ...line, amount_minor: line.amount_minor + 1 }
    : line);
  const changed = new D1DailyDetailedLedgerService(reconciliationDb({
    snapshotFingerprint,
    snapshotLines,
    liveLines: changedFinance,
  }));
  const mismatch = await changed.reconcile("tenant-a", context);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.mismatches.length, 1);
  assert.deepEqual(mismatch.mismatches[0], {
    kind: "CHANGED",
    domain: "Finance",
    line_key: "Finance:GL:Sales Invoice:SI-1:AR",
  });
});

const FREEZE_ACTOR = { user_id: "chief@example.test", roles: ["Chief Accountant"] };
const FREEZE_SNAPSHOT = {
  snapshot_id: "DLS-ATOMIC",
  context_key: JSON.stringify(["2026-08-02", "ALUMDOOR", "K36", "", ""]),
  source_fingerprint: "a".repeat(64),
  ledger_date: "2026-08-02",
  company: "ALUMDOOR",
  warehouse: "K36",
  customer: "",
  sales_order: "",
};

function atomicFreezeDb({ insertChanges = 1, frozenBefore = null, frozenAfter = null } = {}) {
  const calls = [];
  let freezeReads = 0;
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          if (sql.includes("WITH live_lines AS") && sql.includes("INSERT INTO daily_ledger_freezes")) {
            return { async run() { return { meta: { changes: insertChanges } }; } };
          }
          if (sql.includes("FROM daily_ledger_snapshots WHERE")) {
            return { async first() { return FREEZE_SNAPSHOT; } };
          }
          if (sql.includes("FROM daily_ledger_freezes f")) {
            freezeReads += 1;
            return { async first() { return freezeReads === 1 ? frozenBefore : frozenAfter; } };
          }
          throw new Error(`Unexpected SQL in atomic freeze test: ${sql.slice(0, 100)}`);
        },
      };
    },
  };
}

test("direct core freeze atomically compares the live and snapshot source sets before inserting", async () => {
  const db = atomicFreezeDb();
  const service = new D1DailyDetailedLedgerService(db);
  const result = await service.freeze(
    "tenant-a",
    FREEZE_ACTOR,
    FREEZE_SNAPSHOT.snapshot_id,
    "close day",
    "2026-08-02T18:00:00.000Z",
  );

  assert.deepEqual(result, {
    snapshot_id: FREEZE_SNAPSHOT.snapshot_id,
    context_key: FREEZE_SNAPSHOT.context_key,
    existing: false,
  });
  const atomicCall = db.calls.find((call) => call.sql.includes("WITH live_lines AS"));
  assert.ok(atomicCall, "freeze must execute the atomic live-source INSERT");
  assert.equal((atomicCall.sql.match(/\bEXCEPT\b/g) ?? []).length, 2);
  assert.match(atomicCall.sql, /ON CONFLICT\(tenant_id,context_key\) DO NOTHING/);
  assert.equal(atomicCall.args.length, 12);
  assert.deepEqual(atomicCall.args.slice(0, 7), [
    "tenant-a",
    FREEZE_SNAPSHOT.ledger_date,
    FREEZE_SNAPSHOT.company,
    FREEZE_SNAPSHOT.warehouse,
    FREEZE_SNAPSHOT.customer,
    FREEZE_SNAPSHOT.sales_order,
    5001,
  ]);
  assert.equal(atomicCall.args[7], FREEZE_SNAPSHOT.snapshot_id);
  assert.equal(atomicCall.args[8], FREEZE_SNAPSHOT.context_key);
});

test("direct core freeze fails closed when the atomic source-set comparison inserts no row", async () => {
  const db = atomicFreezeDb({ insertChanges: 0 });
  const service = new D1DailyDetailedLedgerService(db);

  await assert.rejects(
    () => service.freeze("tenant-a", FREEZE_ACTOR, FREEZE_SNAPSHOT.snapshot_id, "close day"),
    (error) => error?.code === "INVALID_LIFECYCLE_TRANSITION"
      && error?.status === 409
      && /source changed/i.test(error.message),
  );
  assert.equal(db.calls.filter((call) => call.sql.includes("INSERT INTO daily_ledger_freezes")).length, 1);
});

test("direct core freeze resolves a same-snapshot concurrent insert as idempotent", async () => {
  const db = atomicFreezeDb({
    insertChanges: 0,
    frozenAfter: { snapshot_id: FREEZE_SNAPSHOT.snapshot_id },
  });
  const service = new D1DailyDetailedLedgerService(db);
  const result = await service.freeze("tenant-a", FREEZE_ACTOR, FREEZE_SNAPSHOT.snapshot_id, "retry");
  assert.equal(result.existing, true);
});

test("direct core freeze rejects a context already frozen to another snapshot", async () => {
  const db = atomicFreezeDb({
    frozenBefore: { snapshot_id: "DLS-OTHER" },
  });
  const service = new D1DailyDetailedLedgerService(db);

  await assert.rejects(
    () => service.freeze("tenant-a", FREEZE_ACTOR, FREEZE_SNAPSHOT.snapshot_id, "close day"),
    (error) => error?.code === "INVALID_LIFECYCLE_TRANSITION"
      && /another snapshot/i.test(error.message),
  );
  assert.equal(db.calls.some((call) => call.sql.includes("WITH live_lines AS")), false);
});
