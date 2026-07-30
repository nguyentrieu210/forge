import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizePurchaseMaterial,
  planPurchaseReceiptAllocation,
  purchaseObligationQueueKey,
  purchaseSettlementBounds,
} from "../dist/packages/clouderp-core/src/purchase-allocation.js";

const QUEUE = "a".repeat(64);
const WINDOW = "WIN-1";

function obligation(overrides) {
  return {
    queue_key: QUEUE,
    window_id: WINDOW,
    purchase_order: "PO-01",
    purchase_order_item_row_id: "ROW-01",
    remaining_qty_micros: 1_000_000,
    transaction_date: "2026-07-01",
    purchase_order_created_at: "2026-07-01T01:00:00.000Z",
    item_idx: 1,
    ...overrides,
  };
}

test("canonical material key is stable across equivalent null/empty inputs", async () => {
  const first = await canonicalizePurchaseMaterial({
    item_code: " AL71 ",
    length_m: "7.200000",
    theoretical_kg_per_m: "0.389",
    color: null,
    is_stamped: "Có",
    measurement_profile: " profile-1 ",
    stock_uom: " Cây ",
  });
  const second = await canonicalizePurchaseMaterial({
    item_code: "AL71",
    length_m: 7.2,
    theoretical_kg_per_m: 0.389,
    color: "",
    is_stamped: true,
    measurement_profile: "profile-1",
    stock_uom: "Cây",
  });

  assert.match(first.material_match_key, /^[a-f0-9]{64}$/);
  assert.equal(first.material_match_key, second.material_match_key);
  assert.deepEqual(first.snapshot, {
    schema_version: 1,
    item_code: "AL71",
    length_m_micros: 7_200_000,
    theoretical_kg_per_m_micros: 389_000,
    color: "",
    is_stamped: 1,
    measurement_profile: "profile-1",
    stock_uom: "Cây",
  });
});

test("material key separates length, barem, color, stamping, profile and stock UOM", async () => {
  const base = {
    item_code: "AL71",
    length_m: 7.2,
    theoretical_kg_per_m: 0.389,
    color: "GS",
    is_stamped: true,
    measurement_profile: "aluminium-bar",
    stock_uom: "Cây",
  };
  const variants = [
    { ...base, length_m: 6.5 },
    { ...base, theoretical_kg_per_m: 0.4 },
    { ...base, color: "WH" },
    { ...base, is_stamped: false },
    { ...base, measurement_profile: "aluminium-leaf" },
    { ...base, stock_uom: "Lá" },
  ];
  const keys = await Promise.all([base, ...variants].map(async (value) =>
    (await canonicalizePurchaseMaterial(value)).material_match_key));
  assert.equal(new Set(keys).size, keys.length);
});

test("queue key includes tenant, company and supplier", async () => {
  const material = (await canonicalizePurchaseMaterial({
    item_code: "AL71",
    length_m: 7.2,
    theoretical_kg_per_m: 0.389,
    stock_uom: "Cây",
  })).material_match_key;
  const base = await purchaseObligationQueueKey({
    tenant_id: "alu",
    company: "Alumdoor",
    supplier: "FACTORY-1",
    material_match_key: material,
  });
  const otherSupplier = await purchaseObligationQueueKey({
    tenant_id: "alu",
    company: "Alumdoor",
    supplier: "FACTORY-2",
    material_match_key: material,
  });
  assert.match(base, /^[a-f0-9]{64}$/);
  assert.notEqual(base, otherSupplier);
});

test("settlement bounds use integer ceil/floor", () => {
  assert.deepEqual(purchaseSettlementBounds(300_000_000, 500), {
    minimum_qty_micros: 285_000_000,
    maximum_qty_micros: 315_000_000,
  });
  assert.deepEqual(purchaseSettlementBounds(1, 500), {
    minimum_qty_micros: 1,
    maximum_qty_micros: 1,
  });
});

test("FIFO allocates 230 bars as 200 + 30 and preserves weight totals", () => {
  const input = [
    obligation({
      purchase_order: "PO-02",
      purchase_order_item_row_id: "PO-02-ROW-1",
      remaining_qty_micros: 100_000_000,
      transaction_date: "2026-07-02",
    }),
    obligation({
      purchase_order: "PO-01",
      purchase_order_item_row_id: "PO-01-ROW-1",
      remaining_qty_micros: 200_000_000,
      transaction_date: "2026-07-01",
    }),
  ];
  const before = structuredClone(input);
  const result = planPurchaseReceiptAllocation({
    queue_key: QUEUE,
    window_id: WINDOW,
    receipt_qty_micros: 230_000_000,
    receipt_barem_weight_micros: 644_184_000,
    actual_weight_micros: 630_000_000,
    window_nominal_qty_micros: 300_000_000,
    window_received_before_micros: 0,
    tolerance_bps: 500,
  }, input);

  assert.deepEqual(input, before, "planner must not mutate queue state");
  assert.deepEqual(result.allocations, [
    {
      purchase_order: "PO-01",
      purchase_order_item_row_id: "PO-01-ROW-1",
      qty_micros: 200_000_000,
      barem_weight_micros: 560_160_000,
      projected_actual_weight_micros: 547_826_086,
      allocation_sequence: 1,
    },
    {
      purchase_order: "PO-02",
      purchase_order_item_row_id: "PO-02-ROW-1",
      qty_micros: 30_000_000,
      barem_weight_micros: 84_024_000,
      projected_actual_weight_micros: 82_173_914,
      allocation_sequence: 2,
    },
  ]);
  assert.equal(result.unapplied_qty_micros, 0);
  assert.equal(result.allocations.reduce((sum, row) => sum + row.barem_weight_micros, 0), 644_184_000);
  assert.equal(result.allocations.reduce((sum, row) => sum + row.projected_actual_weight_micros, 0), 630_000_000);
});

test("final delivery 85 is accepted as 70 nominal + 15 unapplied", () => {
  const result = planPurchaseReceiptAllocation({
    queue_key: QUEUE,
    window_id: WINDOW,
    receipt_qty_micros: 85_000_000,
    receipt_barem_weight_micros: 238_068_000,
    window_nominal_qty_micros: 300_000_000,
    window_received_before_micros: 230_000_000,
    tolerance_bps: 500,
  }, [obligation({
    purchase_order: "PO-02",
    purchase_order_item_row_id: "PO-02-ROW-1",
    remaining_qty_micros: 70_000_000,
  })]);

  assert.equal(result.allocations[0].qty_micros, 70_000_000);
  assert.equal(result.unapplied_qty_micros, 15_000_000);
  assert.equal(result.received_after_micros, 315_000_000);
  assert.equal(
    result.allocations[0].barem_weight_micros + result.unapplied_barem_weight_micros,
    238_068_000,
  );
});

test("final delivery 86 is rejected above the tolerance maximum", () => {
  assert.throws(() => planPurchaseReceiptAllocation({
    queue_key: QUEUE,
    window_id: WINDOW,
    receipt_qty_micros: 86_000_000,
    receipt_barem_weight_micros: 240_868_800,
    window_nominal_qty_micros: 300_000_000,
    window_received_before_micros: 230_000_000,
    tolerance_bps: 500,
  }, [obligation({ remaining_qty_micros: 70_000_000 })]), /exceeds the settlement tolerance maximum/);
});

test("planner handles hundreds of FIFO allocation rows deterministically", () => {
  const obligations = Array.from({ length: 250 }, (_, index) => obligation({
    purchase_order: `PO-${String(index + 1).padStart(3, "0")}`,
    purchase_order_item_row_id: `ROW-${String(index + 1).padStart(3, "0")}`,
    remaining_qty_micros: 1_000_000,
    transaction_date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
    purchase_order_created_at: `2026-07-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
  })).reverse();
  const result = planPurchaseReceiptAllocation({
    queue_key: QUEUE,
    window_id: WINDOW,
    receipt_qty_micros: 200_000_000,
    receipt_barem_weight_micros: 560_160_000,
    window_nominal_qty_micros: 250_000_000,
    window_received_before_micros: 0,
    tolerance_bps: 0,
  }, obligations);

  assert.equal(result.allocations.length, 200);
  assert.equal(result.allocations.reduce((sum, row) => sum + row.qty_micros, 0), 200_000_000);
  assert.equal(result.allocations.reduce((sum, row) => sum + row.barem_weight_micros, 0), 560_160_000);
  assert.deepEqual(result.allocations.map((row) => row.allocation_sequence),
    Array.from({ length: 200 }, (_, index) => index + 1));
});
