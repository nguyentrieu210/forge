import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSupplierEligible,
  buildSupplierPriceHistory,
  buildSupplierSpendSummary,
  calculateSupplierRating,
  compareSupplierQuotations,
  evaluateBlanketRelease,
  evaluatePurchaseOrderSupplierContract,
  evaluateThreeWayMatch,
  resolvePurchaseDeliverySchedule,
  validateSupplierSelection,
} from "../dist/packages/clouderp-core/src/index.js";

function rfq() {
  return {
    company: "ACME",
    transaction_date: "2026-08-01",
    suppliers: [{ row_id: "S1", supplier: "SUP-A" }, { row_id: "S2", supplier: "SUP-B" }],
    items: [
      { row_id: "R1", item_code: "ITEM-A", qty: 10, qty_micros: 10_000_000, uom: "Kg" },
      { row_id: "R2", item_code: "ITEM-B", qty: 5, qty_micros: 5_000_000, uom: "Cái" },
    ],
  };
}

function quote(name, supplier, baseTotal, rateA, rateB) {
  return {
    name,
    docstatus: 1,
    data: {
      supplier,
      company: "ACME",
      currency: "USD",
      currency_scale: 2,
      company_currency: "USD",
      company_currency_scale: 2,
      conversion_rate_micros: 1_000_000,
      transaction_date: "2026-08-02",
      valid_till: "2026-08-31",
      request_for_quotation: "RFQ-1",
      taxes: [],
      base_grand_total_minor: baseTotal,
      grand_total_minor: baseTotal,
      items: [
        { row_id: `${name}-1`, request_for_quotation_item: "R1", item_code: "ITEM-A", qty: 10, qty_micros: 10_000_000, uom: "Kg", rate: rateA, rate_minor: Math.round(rateA * 100) },
        { row_id: `${name}-2`, request_for_quotation_item: "R2", item_code: "ITEM-B", qty: 5, qty_micros: 5_000_000, uom: "Cái", rate: rateB, rate_minor: Math.round(rateB * 100) },
      ],
    },
  };
}

test("quotation comparison ranks complete submitted quotes and selection requires a reason", () => {
  const comparison = compareSupplierQuotations("RFQ-1", rfq(), [
    quote("SQ-A", "SUP-A", 20_000, 10, 20),
    quote("SQ-B", "SUP-B", 18_000, 9, 18),
  ], "2026-08-03");
  assert.deepEqual(comparison.complete_rank, ["SQ-B", "SQ-A"]);
  const decision = validateSupplierSelection(comparison, [
    { rfq_row_id: "R1", quotation: "SQ-B" },
    { rfq_row_id: "R2", quotation: "SQ-A" },
  ], "Giá ITEM-A tốt hơn, ITEM-B đạt điều kiện giao hàng");
  assert.equal(decision.lines.length, 2);
  assert.throws(() => validateSupplierSelection(comparison, [
    { rfq_row_id: "R1", quotation: "SQ-B" },
    { rfq_row_id: "R2", quotation: "SQ-A" },
  ], ""), /reason/);
});

test("three-way match emits hold facts without posting accounting", () => {
  const matched = evaluateThreeWayMatch([{
    line_key: "PO-1:R1",
    item_code: "ITEM-A",
    ordered_qty_micros: 100_000_000,
    received_qty_micros: 80_000_000,
    invoiced_qty_micros: 80_000_000,
    ordered_rate_minor: 10_000,
    invoice_rate_minor: 10_000,
    currency: "USD",
    currency_scale: 2,
  }]);
  assert.equal(matched.status, "Match");
  const held = evaluateThreeWayMatch([{
    line_key: "PO-1:R1",
    item_code: "ITEM-A",
    ordered_qty_micros: 100_000_000,
    received_qty_micros: 80_000_000,
    invoiced_qty_micros: 85_000_000,
    ordered_rate_minor: 10_000,
    invoice_rate_minor: 10_500,
    currency: "USD",
    currency_scale: 2,
  }], { quantity_tolerance_bps: 200, price_tolerance_bps: 300 });
  assert.equal(held.status, "Hold");
  assert.equal(held.lines[0].quantity_within_tolerance, false);
  assert.equal(held.lines[0].price_within_tolerance, false);
});

test("approved supplier policy is opt-in and rating uses exact BPS", () => {
  assert.equal(assertSupplierEligible("LEGACY", {}, "2026-08-03").status, "LegacyUncontrolled");
  assert.throws(() => assertSupplierEligible("SUP-A", { procurement_status: "Pending" }, "2026-08-03"), /not approved/);
  const approved = assertSupplierEligible("SUP-A", {
    procurement_status: "Approved",
    approved_from: "2026-01-01",
    approved_until: "2026-12-31",
    approved_categories: "Aluminium,Glass",
  }, "2026-08-03", "Aluminium");
  assert.equal(approved.status, "Approved");
  const rating = calculateSupplierRating([
    { key: "quality", score_bps: 9500, weight_bps: 4000 },
    { key: "delivery", score_bps: 8000, weight_bps: 3000 },
    { key: "commercial", score_bps: 8500, weight_bps: 2000 },
    { key: "service", score_bps: 9000, weight_bps: 1000 },
  ]);
  assert.equal(rating.score_bps, 8800);
  assert.equal(rating.grade, "B");
});

test("blanket release and PO contract release enforce cumulative ceilings", () => {
  const contract = {
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    contract_reference: "CON-1",
    valid_from: "2026-01-01",
    valid_until: "2026-12-31",
    maximum_qty_micros: 100_000_000,
    maximum_value_minor: 100_000,
    quantity_uom: "Kg",
  };
  const blanket = evaluateBlanketRelease(contract, {
    release_qty_micros: 20_000_000,
    release_value_minor: 20_000,
    released_qty_before_micros: 50_000_000,
    released_value_before_minor: 40_000,
  });
  assert.equal(blanket.remaining_qty_micros, 30_000_000);

  const current = {
    supplier: "SUP-A", company: "ACME", currency: "USD", transaction_date: "2026-08-03",
    supplier_contract: "CON-1", grand_total_minor: 20_000, taxes: [],
    items: [{ row_id: "R1", item_code: "ITEM-A", qty: 20, qty_micros: 20_000_000, uom: "Kg", rate: 10 }],
  };
  const prior = {
    tenant_id: "demo", doctype: "Purchase Order", name: "PO-OLD", owner: "buyer", docstatus: 1,
    status: "To Receive and Bill", version: 1, created_at: "2026-08-01T00:00:00.000Z", modified_at: "2026-08-01T00:00:00.000Z", children: [],
    data: { ...current, supplier_contract: "CON-1", grand_total_minor: 40_000, items: [{ ...current.items[0], qty: 50, qty_micros: 50_000_000 }] },
  };
  const result = evaluatePurchaseOrderSupplierContract("PO-NEW", current, "CON-1", contract, [prior]);
  assert.equal(result.released_qty_after_micros, 70_000_000);
  assert.equal(result.released_value_after_minor, 60_000);
});

test("delivery schedule uses line override and rejects dates before order", () => {
  const resolved = resolvePurchaseDeliverySchedule({
    supplier: "SUP-A", company: "ACME", currency: "USD", transaction_date: "2026-08-03", schedule_date: "2026-08-10",
    items: [
      { row_id: "R1", item_code: "ITEM-A", qty: 1, rate: 1 },
      { row_id: "R2", item_code: "ITEM-B", qty: 1, rate: 1, schedule_date: "2026-08-08" },
    ],
  });
  assert.equal(resolved[0].source, "header");
  assert.equal(resolved[1].schedule_date, "2026-08-08");
  assert.throws(() => resolvePurchaseDeliverySchedule({
    supplier: "SUP-A", company: "ACME", currency: "USD", transaction_date: "2026-08-03", schedule_date: "2026-08-01",
    items: [{ row_id: "R1", item_code: "ITEM-A", qty: 1, rate: 1 }],
  }), /cannot be before/);
});

test("price history and spend use submitted PO company-currency facts", () => {
  const orders = [
    { name: "PO-1", docstatus: 1, data: { supplier: "SUP-A", company: "ACME", currency: "USD", currency_scale: 2, company_currency: "USD", company_currency_scale: 2, conversion_rate_micros: 1_000_000, transaction_date: "2026-08-01", grand_total_minor: 10_000, base_grand_total_minor: 10_000, items: [{ row_id: "R1", item_code: "ITEM-A", qty: 10, qty_micros: 10_000_000, uom: "Kg", rate: 10, rate_minor: 1000 }] } },
    { name: "PO-2", docstatus: 1, data: { supplier: "SUP-A", company: "ACME", currency: "EUR", currency_scale: 2, company_currency: "USD", company_currency_scale: 2, conversion_rate_micros: 1_200_000, transaction_date: "2026-08-02", grand_total_minor: 9_000, base_grand_total_minor: 10_800, items: [{ row_id: "R1", item_code: "ITEM-A", qty: 10, qty_micros: 10_000_000, uom: "Kg", rate: 8, rate_minor: 800 }] } },
  ];
  const history = buildSupplierPriceHistory(orders);
  assert.equal(history.length, 1);
  assert.equal(history[0].observations[1].base_rate_minor, 960);
  assert.equal(history[0].latest_change_bps, -400);
  const spend = buildSupplierSpendSummary(orders);
  assert.equal(spend[0].base_grand_total_minor, 20_800);
});
