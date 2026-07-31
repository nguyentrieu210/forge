import test from "node:test";
import assert from "node:assert/strict";
import { planPurchaseAllocationBackfill } from "../scripts/purchase-allocation-backfill-planner.mjs";

const tenantId = "demo";
const committedAt = "2026-07-31T05:00:00.000Z";

function document(doctype, name, version, data, createdAt = "2026-07-01T00:00:00.000Z") {
  return {
    doctype,
    name,
    version,
    created_at: createdAt,
    payload_json: JSON.stringify(data),
  };
}

function child(parentKey, rowId, idx, qtyBar, actualWeightKg) {
  const theoreticalKg = qtyBar * 7.2 * 0.389;
  return {
    parent_key: parentKey,
    row_id: rowId,
    idx,
    payload_json: JSON.stringify({
      item_code: "AL71",
      qty_bar: qtyBar,
      qty: theoreticalKg.toFixed(3),
      theoretical_kg: theoreticalKg.toFixed(3),
      ...(actualWeightKg === undefined ? {} : { actual_weight_kg: actualWeightKg }),
      length_m: 7.2,
      theoretical_kg_per_m: 0.389,
      color: "GS",
      is_stamped: "Có",
      measurement_profile: "AL-BAR",
      stock_uom: "Cây",
      uom: "Kg",
    }),
  };
}

function resolvedFixture() {
  return {
    tenantId,
    committedAt,
    documents: [
      document("Purchase Order", "PO-01", 1, {
        company: "Alumdoor",
        supplier: "FACTORY-1",
        transaction_date: "2026-07-01",
        receipt_tolerance_pct: 5,
      }),
      document("Purchase Receipt", "PR-01", 2, {
        company: "Alumdoor",
        supplier: "FACTORY-1",
        posting_at: "2026-07-03T00:00:00.000Z",
      }),
    ],
    children: [
      child("Purchase Order:PO-01", "PO-ROW-1", 1, 100),
      child("Purchase Receipt:PR-01", "PR-ROW-1", 1, 105, 300),
    ],
    progressEntries: [{
      voucher_type: "Purchase Receipt",
      voucher_no: "PR-01",
      voucher_revision: 2,
      line_key: "RECEIPT-1",
      purchase_order: "PO-01",
      kind: "Receipt",
      item_code: "AL71",
      qty_micros: 100_000_000,
      posting_at: "2026-07-03T00:00:00.000Z",
    }],
  };
}

test("backfill resolves one exact row pair, conserves receipt weight and emits stable checksum", () => {
  const first = planPurchaseAllocationBackfill(resolvedFixture());
  const second = planPurchaseAllocationBackfill(resolvedFixture());

  assert.equal(first.counts.queues, 1);
  assert.equal(first.counts.windows, 1);
  assert.equal(first.counts.obligations, 1);
  assert.equal(first.counts.allocations, 1);
  assert.equal(first.counts.unapplied, 1);
  assert.equal(first.counts.unresolved, 0);
  assert.equal(first.checksum, second.checksum);
  assert.match(first.checksum, /^[a-f0-9]{64}$/);

  const allocation = first.allocations[0];
  const unapplied = first.unapplied[0];
  assert.equal(allocation.purchase_order_item_row_id, "PO-ROW-1");
  assert.equal(allocation.receipt_item_row_id, "PR-ROW-1");
  assert.equal(allocation.qty_micros, 100_000_000);
  assert.equal(unapplied.qty_micros, 5_000_000);
  assert.equal(allocation.barem_weight_micros + unapplied.barem_weight_micros, 294_084_000);
  assert.equal(allocation.projected_actual_weight_micros + unapplied.projected_actual_weight_micros, 300_000_000);
  assert.deepEqual(first.po_checksum_rows, [{
    purchase_order: "PO-01",
    purchase_order_item_row_id: "PO-ROW-1",
    nominal_qty_micros: 100_000_000,
    allocated_qty_micros: 100_000_000,
    remaining_qty_micros: 0,
  }]);
});

test("backfill refuses to guess when one legacy progress row matches multiple PO rows", () => {
  const fixture = resolvedFixture();
  fixture.children = [
    child("Purchase Order:PO-01", "PO-ROW-1", 1, 100),
    child("Purchase Order:PO-01", "PO-ROW-2", 2, 100),
    child("Purchase Receipt:PR-01", "PR-ROW-1", 1, 105, 300),
  ];
  const plan = planPurchaseAllocationBackfill(fixture);
  assert.equal(plan.counts.unresolved, 1);
  assert.equal(plan.unresolved[0].code, "ambiguous_progress");
  assert.equal(plan.allocations.length, 0);
  assert.deepEqual(plan.unresolved[0].details.po_candidates, ["PO-ROW-1", "PO-ROW-2"]);
});
