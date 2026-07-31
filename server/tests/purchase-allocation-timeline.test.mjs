import test from "node:test";
import assert from "node:assert/strict";
import { buildPurchaseAllocationTimeline } from "../dist/packages/document-kernel/src/index.js";

function ledger(overrides) {
  return {
    source_type: "allocation",
    entry_id: "ENTRY-1",
    entry_kind: "allocate",
    window_id: "WINDOW-1",
    window_sequence: 1,
    window_status: "Open",
    tolerance_bps: 500,
    purchase_order: "PO-01",
    purchase_receipt: "PR-01",
    purchase_order_item_row_id: "PO-ROW-1",
    receipt_item_row_id: "PR-ROW-1",
    qty_micros: 0,
    barem_weight_micros: 0,
    projected_actual_weight_micros: null,
    posting_at: "2026-07-03T00:00:00.000Z",
    committed_at: "2026-07-03T01:00:00.000Z",
    actor: "Administrator",
    reason: null,
    ...overrides,
  };
}

const windowRow = {
  window_id: "WINDOW-1",
  window_sequence: 1,
  window_status: "Open",
  tolerance_bps: 500,
  nominal_qty_micros: 300_000_000,
  received_qty_micros: 230_000_000,
  minimum_qty_micros: null,
  maximum_qty_micros: null,
  shortage_variance_micros: null,
  overage_variance_micros: null,
  settlement_reason: null,
};

test("purchase order timeline projects net ordered, received and remaining quantities", () => {
  const timeline = buildPurchaseAllocationTimeline("Purchase Order", "PO-01", [
    ledger({
      source_type: "obligation",
      entry_id: "OB-1",
      entry_kind: "open",
      purchase_receipt: null,
      receipt_item_row_id: null,
      qty_micros: 200_000_000,
      committed_at: "2026-07-01T01:00:00.000Z",
    }),
    ledger({
      source_type: "obligation",
      entry_id: "OB-2",
      entry_kind: "open",
      purchase_receipt: null,
      receipt_item_row_id: null,
      qty_micros: 100_000_000,
      committed_at: "2026-07-02T01:00:00.000Z",
    }),
    ledger({ entry_id: "AL-1", qty_micros: 200_000_000, barem_weight_micros: 560_160_000 }),
    ledger({
      entry_id: "AL-2",
      qty_micros: 30_000_000,
      barem_weight_micros: 84_024_000,
      committed_at: "2026-07-03T01:01:00.000Z",
    }),
  ], [windowRow]);

  assert.deepEqual(timeline.summary.slice(0, 4), [
    { label: "Đã đặt", value: "300" },
    { label: "Đã nhận", value: "230" },
    { label: "Còn danh nghĩa", value: "70" },
    { label: "Kg barem", value: "644.184" },
  ]);
  assert.equal(timeline.rows[0].event, "Mở nghĩa vụ PO");
  assert.equal(timeline.rows.at(-1).qty, "30");
  assert.deepEqual(timeline.windows[0], {
    window_id: "WINDOW-1",
    sequence: 1,
    status: "Open",
    tolerance: "5%",
    nominal_qty: "300",
    received_qty: "230",
    remaining_qty: "70",
    minimum_qty: null,
    maximum_qty: null,
    shortage_variance: null,
    overage_variance: null,
    reason: null,
  });
});

test("purchase receipt timeline keeps allocated and unapplied movements balanced", () => {
  const timeline = buildPurchaseAllocationTimeline("Purchase Receipt", "PR-01", [
    ledger({ entry_id: "AL-1", qty_micros: 200_000_000, barem_weight_micros: 560_160_000 }),
    ledger({
      source_type: "unapplied",
      entry_id: "UN-1",
      entry_kind: "receive",
      purchase_order: null,
      purchase_order_item_row_id: null,
      qty_micros: 30_000_000,
      barem_weight_micros: 84_024_000,
      committed_at: "2026-07-03T01:01:00.000Z",
    }),
  ], [windowRow]);

  assert.deepEqual(timeline.summary.slice(0, 4), [
    { label: "Tổng nhận", value: "230" },
    { label: "Đã phân bổ", value: "200" },
    { label: "Chưa phân bổ", value: "30" },
    { label: "Kg barem", value: "644.184" },
  ]);
  assert.equal(timeline.rows[1].event, "Ghi nhận chưa phân bổ");
  assert.equal(timeline.rows[1].purchase_order, null);
});
