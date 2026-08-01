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

test("daily ledger reconciliation covers Sales, Purchase, Inventory, Manufacturing and Finance", async () => {
  const snapshotLines = [
    sourceLine("Sales", { line_key: "Sales:Delivery Note:DN-1:1" }),
    sourceLine("Purchase", { line_key: "Purchase:Purchase Receipt:PR-1:1" }),
    sourceLine("Inventory", { line_key: "Inventory:Stock Entry:SE-1:1" }),
    sourceLine("Manufacturing", { line_key: "Manufacturing:Work Order:WO-1" }),
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
  assert.deepEqual(ok.snapshot_counts, { Sales: 1, Purchase: 1, Inventory: 1, Manufacturing: 1, Finance: 1 });
  assert.deepEqual(ok.live_counts, { Sales: 1, Purchase: 1, Inventory: 1, Manufacturing: 1, Finance: 1 });
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
