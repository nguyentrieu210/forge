import test from "node:test";
import assert from "node:assert/strict";
import { attachPurchaseAllocationQueueKeys } from "../dist/packages/document-kernel/src/index.js";

const timeline = {
  kind: "purchase_allocation_timeline",
  doctype: "Purchase Order",
  name: "PO-01",
  title: "Dòng thời gian phân bổ · PO-01",
  description: "ledger",
  columns: [],
  rows: [],
  summary: [],
  windows: [
    {
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
    },
  ],
};

test("operator timeline attaches the authoritative queue key to every settlement window", () => {
  const result = attachPurchaseAllocationQueueKeys(timeline, [
    { window_id: "WINDOW-1", queue_key: "q".repeat(64) },
  ]);
  assert.equal(result.windows[0].queue_key, "q".repeat(64));
  assert.equal(result.windows[0].status, "Open");
  assert.deepEqual(result.supplier_debt_reports, []);
});

test("operator timeline fails closed when a window loses its queue scope", () => {
  assert.throws(
    () => attachPurchaseAllocationQueueKeys(timeline, []),
    /queue scope is missing/,
  );
});
