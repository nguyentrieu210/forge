import test from "node:test";
import assert from "node:assert/strict";
import { auditOutgoingValuation } from "../dist/packages/clouderp-stock/src/index.js";

const Q = 1_000_000;
const line = (key, postingAt, qty, value) => ({
  line_key: key,
  item_code: "ITEM-1",
  warehouse: "WH-1",
  actual_qty_micros: qty,
  valuation_rate_minor: qty === 0 ? 0 : Math.trunc(Math.abs(value) * Q / Math.abs(qty)),
  stock_value_difference_minor: value,
  qty_scale: 6,
  currency_scale: 0,
  currency: "VND",
  posting_at: postingAt,
});

test("valuation audit detects stale FIFO issue after backdated receipt", () => {
  const result = auditOutgoingValuation([
    line("IN-OLD", "2026-08-01T08:00:00.000Z", 10 * Q, 1000),
    line("IN-BACKDATED", "2026-08-01T09:00:00.000Z", 10 * Q, 2000),
    line("OUT-STALE", "2026-08-02T08:00:00.000Z", -15 * Q, -1500),
  ], "FIFO");
  assert.equal(result.checked_issue_lines, 1);
  assert.equal(result.mismatch_count, 1);
  assert.equal(result.mismatches[0].expected_stock_value_difference_minor, -2000);
  assert.equal(result.mismatches[0].delta_minor, -500);
});

test("valuation audit passes when moving-average issue matches replay", () => {
  const result = auditOutgoingValuation([
    line("IN-1", "2026-08-01T08:00:00.000Z", 10 * Q, 1000),
    line("IN-2", "2026-08-01T09:00:00.000Z", 10 * Q, 2000),
    line("OUT-OK", "2026-08-02T08:00:00.000Z", -10 * Q, -1500),
  ], "Moving Average");
  assert.equal(result.mismatch_count, 0);
});

test("valuation audit keeps same-timestamp input order deterministic", () => {
  const result = auditOutgoingValuation([
    line("IN-A", "2026-08-01T08:00:00.000Z", 5 * Q, 500),
    line("IN-B", "2026-08-01T08:00:00.000Z", 5 * Q, 1000),
    line("OUT", "2026-08-01T08:00:00.000Z", -5 * Q, -500),
  ], "FIFO");
  assert.equal(result.mismatch_count, 0);
});

test("valuation audit rejects mixed stock streams", () => {
  const mixed = [
    line("IN", "2026-08-01T08:00:00.000Z", Q, 100),
    { ...line("OUT", "2026-08-02T08:00:00.000Z", -Q, -100), warehouse: "WH-2" },
  ];
  assert.throws(() => auditOutgoingValuation(mixed, "FIFO"), /one item\/warehouse\/batch\/currency stream/);
});
