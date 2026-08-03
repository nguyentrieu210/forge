import test from "node:test";
import assert from "node:assert/strict";
import {
  compareSupplierQuotations,
  evaluateThreeWayMatch,
  validateSupplierSelection,
} from "../dist/packages/clouderp-core/src/index.js";

function rfqFixture() {
  return {
    company: "ACME",
    transaction_date: "2026-08-01",
    suppliers: [
      { row_id: "SUP-1", supplier: "SUP-A" },
      { row_id: "SUP-2", supplier: "SUP-B" },
    ],
    items: [
      { row_id: "RFQ-1", item_code: "ITEM-A", qty: 10, qty_micros: 10_000_000, uom: "Kg" },
      { row_id: "RFQ-2", item_code: "ITEM-B", qty: 5, qty_micros: 5_000_000, uom: "Cái" },
    ],
  };
}

function quote(name, supplier, totalMinor, options = {}) {
  const rateA = options.rateA ?? 100_00;
  const rateB = options.rateB ?? 200_00;
  const items = [
    {
      row_id: `${name}-1`,
      request_for_quotation_item: "RFQ-1",
      item_code: "ITEM-A",
      qty: 10,
      qty_micros: 10_000_000,
      uom: "Kg",
      rate: rateA / 100,
      rate_minor: rateA,
    },
    ...(options.partial ? [] : [{
      row_id: `${name}-2`,
      request_for_quotation_item: "RFQ-2",
      item_code: "ITEM-B",
      qty: 5,
      qty_micros: 5_000_000,
      uom: "Cái",
      rate: rateB / 100,
      rate_minor: rateB,
    }]),
  ];
  return {
    name,
    docstatus: 1,
    data: {
      supplier,
      company: "ACME",
      currency: options.currency ?? "USD",
      currency_scale: 2,
      company_currency: "USD",
      company_currency_scale: 2,
      conversion_rate: "1.000000",
      conversion_rate_micros: 1_000_000,
      transaction_date: "2026-08-01",
      valid_till: options.validTill ?? "2026-08-31",
      request_for_quotation: "RFQ-001",
      items,
      taxes: [],
      net_total_minor: totalMinor,
      grand_total_minor: totalMinor,
      base_net_total_minor: totalMinor,
      base_grand_total_minor: totalMinor,
    },
  };
}

test("quotation comparison ranks only complete non-expired submitted quotes by base total", () => {
  const comparison = compareSupplierQuotations("RFQ-001", rfqFixture(), [
    quote("SQ-A", "SUP-A", 20_000),
    quote("SQ-B", "SUP-B", 18_000),
    quote("SQ-PARTIAL", "SUP-A", 9_000, { partial: true }),
  ], "2026-08-03");

  assert.deepEqual(comparison.complete_rank, ["SQ-B", "SQ-A"]);
  assert.equal(comparison.lines.length, 2);
  assert.equal(comparison.lines[0].offers.length, 3);
  assert.equal(comparison.quotations.find((row) => row.quotation === "SQ-PARTIAL")?.complete, false);
});

test("quotation comparison never mixes line-rate ranking across currencies", () => {
  const comparison = compareSupplierQuotations("RFQ-001", rfqFixture(), [
    quote("SQ-USD", "SUP-A", 20_000, { currency: "USD", rateA: 100_00 }),
    quote("SQ-VND", "SUP-B", 19_000, { currency: "VND", rateA: 2_000_000 }),
  ], "2026-08-03");
  const offers = comparison.lines[0].offers;
  assert.deepEqual(offers.map((row) => row.currency), ["USD", "VND"]);
  assert.deepEqual(comparison.complete_rank, ["SQ-VND", "SQ-USD"]);
});

test("quotation comparison rejects suppliers that were not invited", () => {
  assert.throws(() => compareSupplierQuotations("RFQ-001", rfqFixture(), [
    quote("SQ-X", "SUP-X", 20_000),
  ], "2026-08-03"), /was not invited/);
});

test("supplier selection is explicit, complete and reason-bound", () => {
  const comparison = compareSupplierQuotations("RFQ-001", rfqFixture(), [
    quote("SQ-A", "SUP-A", 20_000),
    quote("SQ-B", "SUP-B", 18_000),
  ], "2026-08-03");
  const decision = validateSupplierSelection(comparison, [
    { rfq_row_id: "RFQ-1", quotation: "SQ-B" },
    { rfq_row_id: "RFQ-2", quotation: "SQ-A" },
  ], "SUP-B is cheaper for ITEM-A; SUP-A has the accepted lead time for ITEM-B");
  assert.deepEqual(decision.lines.map((row) => [row.rfq_row_id, row.quotation]), [
    ["RFQ-1", "SQ-B"],
    ["RFQ-2", "SQ-A"],
  ]);
  assert.throws(() => validateSupplierSelection(comparison, [
    { rfq_row_id: "RFQ-1", quotation: "SQ-B" },
    { rfq_row_id: "RFQ-2", quotation: "SQ-A" },
  ], ""), /reason/);
});

test("three-way match allows partial invoice within received and ordered quantity", () => {
  const result = evaluateThreeWayMatch([{
    line_key: "PO-1:ROW-1",
    item_code: "ITEM-A",
    ordered_qty_micros: 100_000_000,
    received_qty_micros: 80_000_000,
    invoiced_qty_micros: 80_000_000,
    ordered_rate_minor: 10_000,
    invoice_rate_minor: 10_000,
    currency: "USD",
    currency_scale: 2,
  }]);
  assert.equal(result.status, "Match");
  assert.deepEqual(result.hold_reasons, []);
});

test("three-way match applies quantity and price tolerance deterministically", () => {
  const quantityOkPriceHold = evaluateThreeWayMatch([{
    line_key: "PO-1:ROW-1",
    item_code: "ITEM-A",
    ordered_qty_micros: 100_000_000,
    received_qty_micros: 80_000_000,
    invoiced_qty_micros: 81_000_000,
    ordered_rate_minor: 10_000,
    invoice_rate_minor: 10_400,
    currency: "USD",
    currency_scale: 2,
  }], { quantity_tolerance_bps: 200, price_tolerance_bps: 300 });
  assert.equal(quantityOkPriceHold.lines[0].quantity_within_tolerance, true);
  assert.equal(quantityOkPriceHold.lines[0].price_within_tolerance, false);
  assert.equal(quantityOkPriceHold.status, "Hold");

  const quantityHold = evaluateThreeWayMatch([{
    line_key: "PO-1:ROW-1",
    item_code: "ITEM-A",
    ordered_qty_micros: 100_000_000,
    received_qty_micros: 80_000_000,
    invoiced_qty_micros: 85_000_000,
    ordered_rate_minor: 10_000,
    invoice_rate_minor: 10_100,
    currency: "USD",
    currency_scale: 2,
  }], { quantity_tolerance_bps: 200, price_tolerance_bps: 300 });
  assert.equal(quantityHold.lines[0].quantity_within_tolerance, false);
  assert.match(quantityHold.hold_reasons.join("\n"), /received quantity tolerance/);
});
