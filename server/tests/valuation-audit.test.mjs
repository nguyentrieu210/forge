import test from "node:test";
import assert from "node:assert/strict";
import { auditOutgoingValuation } from "../dist/packages/clouderp-stock/src/index.js";

const Q = 1_000_000;
const line = (key, postingAt, qty, value, extra = {}) => ({
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
  ...extra,
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

test("backdated issue changes FIFO layers and exposes a later stale issue", () => {
  const result = auditOutgoingValuation([
    line("IN-OLD", "2026-08-01T08:00:00.000Z", 10 * Q, 1000),
    line("OUT-BACKDATED", "2026-08-01T09:00:00.000Z", -6 * Q, -600),
    line("IN-LATER", "2026-08-02T08:00:00.000Z", 10 * Q, 2000),
    line("OUT-LATER-STALE", "2026-08-03T08:00:00.000Z", -8 * Q, -800),
  ], "FIFO");
  assert.equal(result.checked_issue_lines, 2);
  assert.equal(result.mismatch_count, 1);
  assert.equal(result.mismatches[0].line_key, "OUT-LATER-STALE");
  assert.equal(result.mismatches[0].expected_stock_value_difference_minor, -1200);
  assert.equal(result.mismatches[0].delta_minor, -400);
});

test("backdated stock reconciliation or return inward movement participates in replay like any authoritative receipt", () => {
  const result = auditOutgoingValuation([
    line("IN-OPEN", "2026-08-01T08:00:00.000Z", 10 * Q, 1000),
    line("RECON-BACKDATED", "2026-08-01T10:00:00.000Z", 2 * Q, 400),
    line("RETURN-BACKDATED", "2026-08-01T11:00:00.000Z", 3 * Q, 600),
    line("OUT-STALE", "2026-08-02T08:00:00.000Z", -12 * Q, -1200),
  ], "FIFO");
  assert.equal(result.mismatch_count, 1);
  assert.equal(result.mismatches[0].expected_stock_value_difference_minor, -1400);
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

test("valuation audit fails closed when a backdated issue would create negative valued stock", () => {
  assert.throws(
    () => auditOutgoingValuation([
      line("OUT-BEFORE-RECEIPT", "2026-08-01T08:00:00.000Z", -Q, -100),
      line("IN-LATER", "2026-08-01T09:00:00.000Z", Q, 100),
    ], "FIFO"),
    /Insufficient valuated stock/,
  );
});

test("batch valuation streams cannot be silently mixed during replay", () => {
  const mixed = [
    line("IN-B1", "2026-08-01T08:00:00.000Z", Q, 100, { batch_no: "B1" }),
    line("IN-B2", "2026-08-01T09:00:00.000Z", Q, 200, { batch_no: "B2" }),
  ];
  assert.throws(() => auditOutgoingValuation(mixed, "FIFO"), /one item\/warehouse\/batch\/currency stream/);
});

test("valuation audit rejects mixed stock streams", () => {
  const mixed = [
    line("IN", "2026-08-01T08:00:00.000Z", Q, 100),
    { ...line("OUT", "2026-08-02T08:00:00.000Z", -Q, -100), warehouse: "WH-2" },
  ];
  assert.throws(() => auditOutgoingValuation(mixed, "FIFO"), /one item\/warehouse\/batch\/currency stream/);
});
