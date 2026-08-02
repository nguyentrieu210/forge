import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSupplierPriceHistory,
  buildSupplierSpendSummary,
} from "../dist/packages/clouderp-core/src/index.js";

function order(name, date, rate, total, options = {}) {
  const currency = options.currency ?? "USD";
  const currencyScale = options.currencyScale ?? 2;
  const companyCurrency = options.companyCurrency ?? "USD";
  const companyScale = options.companyScale ?? 2;
  const conversionRateMicros = options.conversionRateMicros ?? 1_000_000;
  return {
    name,
    docstatus: options.docstatus ?? 1,
    data: {
      supplier: options.supplier ?? "SUP-A",
      company: options.company ?? "ACME",
      currency,
      currency_scale: currencyScale,
      company_currency: companyCurrency,
      company_currency_scale: companyScale,
      conversion_rate: String(conversionRateMicros / 1_000_000),
      conversion_rate_micros: conversionRateMicros,
      transaction_date: date,
      taxes: [],
      base_grand_total_minor: total,
      grand_total_minor: total,
      items: [{
        row_id: "ROW-1",
        item_code: "ITEM-A",
        qty: 10,
        qty_micros: 10_000_000,
        uom: "Kg",
        rate,
        rate_minor: Math.round(rate * 10 ** currencyScale),
      }],
    },
  };
}

test("supplier price history uses submitted PO rates and reports latest company-currency variance", () => {
  const series = buildSupplierPriceHistory([
    order("PO-1", "2026-08-01", 10, 10_000),
    order("PO-2", "2026-08-02", 11, 11_000),
    order("PO-DRAFT", "2026-08-03", 50, 50_000, { docstatus: 0 }),
  ]);
  assert.equal(series.length, 1);
  assert.equal(series[0].observations.length, 2);
  assert.equal(series[0].latest_base_rate_minor, 1_100);
  assert.equal(series[0].previous_base_rate_minor, 1_000);
  assert.equal(series[0].latest_change_bps, 1_000);
});

test("supplier price history normalizes FX before comparing historical rates", () => {
  const series = buildSupplierPriceHistory([
    order("PO-USD", "2026-08-01", 10, 10_000),
    order("PO-EUR", "2026-08-02", 8, 9_600, {
      currency: "EUR",
      currencyScale: 2,
      companyCurrency: "USD",
      companyScale: 2,
      conversionRateMicros: 1_200_000,
    }),
  ]);
  assert.equal(series[0].observations[0].base_rate_minor, 1_000);
  assert.equal(series[0].observations[1].base_rate_minor, 960);
  assert.equal(series[0].latest_change_bps, -400);
});

test("price history separates incompatible company currencies and leaves zero-baseline variance undefined", () => {
  const split = buildSupplierPriceHistory([
    order("PO-USD", "2026-08-01", 10, 10_000, { companyCurrency: "USD" }),
    order("PO-VND", "2026-08-02", 250_000, 250_000, { currency: "VND", companyCurrency: "VND" }),
  ]);
  assert.equal(split.length, 2);

  const zero = buildSupplierPriceHistory([
    order("PO-ZERO", "2026-08-01", 0, 0),
    order("PO-NONZERO", "2026-08-02", 10, 10_000),
  ]);
  assert.equal(zero[0].latest_change_bps, null);
});

test("supplier spend summary aggregates submitted POs in company currency only", () => {
  const summary = buildSupplierSpendSummary([
    order("PO-1", "2026-08-01", 10, 12_000),
    order("PO-2", "2026-08-02", 11, 15_000),
    order("PO-CANCEL", "2026-08-03", 99, 99_000, { docstatus: 2 }),
    order("PO-B", "2026-08-04", 7, 8_000, { supplier: "SUP-B" }),
  ]);
  const a = summary.find((row) => row.supplier === "SUP-A");
  const b = summary.find((row) => row.supplier === "SUP-B");
  assert.equal(a.order_count, 2);
  assert.equal(a.base_grand_total_minor, 27_000);
  assert.equal(a.base_grand_total, "270.00");
  assert.equal(b.order_count, 1);
});
