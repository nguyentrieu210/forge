import test from "node:test";
import assert from "node:assert/strict";
import {
  assertReconciled,
  buildMigrationPlan,
  reconcileExactMetrics,
  transitionMigrationState,
} from "../dist/packages/migration/src/index.js";

const targetFields = [
  { fieldname: "customer_name", required: true },
  { fieldname: "tax_code" },
  { fieldname: "disabled", has_default: true },
];

function source(overrides = {}) {
  return {
    source_id: "customers-2026-08-03.csv",
    source_kind: "csv",
    target_doctype: "Customer",
    headers: ["Mã KH", "Tên KH", "MST", "Bỏ qua"],
    rows: [
      { "Mã KH": "KH-001", "Tên KH": "Công ty A", MST: "0311111111", "Bỏ qua": "x" },
      { "Mã KH": "KH-002", "Tên KH": "Công ty B", MST: "0312222222", "Bỏ qua": "y" },
    ],
    target_fields: targetFields,
    mapping: {
      "Mã KH": "name",
      "Tên KH": "customer_name",
      MST: "tax_code",
      "Bỏ qua": null,
    },
    key_field: "Mã KH",
    duplicate_policy: "error",
    ...overrides,
  };
}

test("migration plan maps source columns and produces stable fingerprints", async () => {
  const first = await buildMigrationPlan(source());
  const second = await buildMigrationPlan(source({
    mapping: {
      MST: "tax_code",
      "Tên KH": "customer_name",
      "Bỏ qua": null,
      "Mã KH": "name",
    },
  }));

  assert.equal(first.plan_id, second.plan_id);
  assert.equal(first.source_fingerprint, second.source_fingerprint);
  assert.equal(first.total_rows, 2);
  assert.deepEqual(first.rows[0].document, {
    name: "KH-001",
    customer_name: "Công ty A",
    tax_code: "0311111111",
  });
  assert.equal(first.rows[0].row_key, "KH-001");
  assert.match(first.rows[0].fingerprint, /^[a-f0-9]{64}$/);
});

test("migration plan refuses two source columns targeting the same field", async () => {
  await assert.rejects(
    () => buildMigrationPlan(source({ mapping: {
      "Mã KH": "name",
      "Tên KH": "customer_name",
      MST: "customer_name",
      "Bỏ qua": null,
    } })),
    /Multiple source columns map to target field: customer_name/,
  );
});

test("migration plan refuses duplicate source keys", async () => {
  await assert.rejects(
    () => buildMigrationPlan(source({ rows: [
      { "Mã KH": "KH-001", "Tên KH": "Công ty A", MST: "0311111111", "Bỏ qua": "x" },
      { "Mã KH": "KH-001", "Tên KH": "Công ty B", MST: "0312222222", "Bỏ qua": "y" },
    ] })),
    /Duplicate migration key at row 3: KH-001/,
  );
});

test("migration state machine allows retry but rejects invalid jumps", () => {
  assert.equal(transitionMigrationState("draft", "validated"), "validated");
  assert.equal(transitionMigrationState("failed", "applying"), "applying");
  assert.throws(() => transitionMigrationState("draft", "completed"), /Migration state cannot move from draft to completed/);
});

test("reconciliation requires exact source-to-target metrics", () => {
  const ok = reconcileExactMetrics({ records: "2", amount: "100.00" }, { amount: "100.00", records: "2" });
  assert.equal(ok.every((metric) => metric.matches), true);
  assert.doesNotThrow(() => assertReconciled(ok));

  const mismatch = reconcileExactMetrics({ records: "2", amount: "100.00" }, { records: "2", amount: "99.99" });
  assert.equal(mismatch.find((metric) => metric.metric === "amount")?.matches, false);
  assert.throws(() => assertReconciled(mismatch), /Migration reconciliation failed/);
});
