import assert from "node:assert/strict";
import test from "node:test";
import {
  parseVatAccountMapping,
  reconcileVatInvoice,
  summarizeVatDataset,
} from "../dist/apps-src/vn-accounting-worker/src/vat-dataset.js";

const mapping = parseVatAccountMapping({
  input_vat: ["1331-KAIRO"],
  output_vat: ["33311-KAIRO"],
});

function salesInvoice(overrides = {}) {
  return {
    name: "SI-001",
    docstatus: 1,
    company: "Kairo",
    posting_at: "2026-08-03T08:00:00Z",
    currency: "VND",
    currency_scale: 0,
    company_currency: "VND",
    company_currency_scale: 0,
    conversion_rate_micros: 1_000_000,
    net_total_minor: 1_000_000,
    base_net_total_minor: 1_000_000,
    total_taxes_and_charges_minor: 100_000,
    base_total_taxes_and_charges_minor: 100_000,
    grand_total_minor: 1_100_000,
    base_grand_total_minor: 1_100_000,
    taxes: [{ row_id: "TAX-1", account: "33311-KAIRO", tax_amount_minor: 100_000 }],
    ...overrides,
  };
}

function purchaseInvoice(overrides = {}) {
  return {
    name: "PI-001",
    docstatus: 1,
    company: "Kairo",
    posting_at: "2026-08-03T09:00:00Z",
    currency: "VND",
    currency_scale: 0,
    company_currency: "VND",
    company_currency_scale: 0,
    conversion_rate_micros: 1_000_000,
    net_total_minor: 500_000,
    base_net_total_minor: 500_000,
    total_taxes_and_charges_minor: 50_000,
    base_total_taxes_and_charges_minor: 50_000,
    grand_total_minor: 550_000,
    base_grand_total_minor: 550_000,
    taxes: [{ row_id: "TAX-1", account: "1331-KAIRO", tax_amount_minor: 50_000 }],
    ...overrides,
  };
}

test("VAT reconciliation classifies output and input VAT from configured accounts", () => {
  const sales = reconcileVatInvoice("Sales Invoice", salesInvoice(), mapping);
  const purchase = reconcileVatInvoice("Purchase Invoice", purchaseInvoice(), mapping);
  assert.equal(sales.output_vat_minor, 100_000);
  assert.equal(sales.input_vat_minor, 0);
  assert.equal(sales.reconciliation_ok, true);
  assert.deepEqual(sales.unmapped_tax_accounts, []);
  assert.equal(purchase.input_vat_minor, 50_000);
  assert.equal(purchase.output_vat_minor, 0);
  assert.equal(purchase.reconciliation_ok, true);
});

test("VAT reconciliation converts each tax row to company currency with integer rounding", () => {
  const invoice = salesInvoice({
    currency: "USD",
    currency_scale: 2,
    company_currency: "VND",
    company_currency_scale: 0,
    conversion_rate_micros: 25_000_000_000,
    net_total_minor: 4_000,
    base_net_total_minor: 1_000_000,
    total_taxes_and_charges_minor: 400,
    base_total_taxes_and_charges_minor: 100_000,
    grand_total_minor: 4_400,
    base_grand_total_minor: 1_100_000,
    taxes: [{ account: "33311-KAIRO", tax_amount_minor: 400 }],
  });
  const row = reconcileVatInvoice("Sales Invoice", invoice, mapping);
  assert.equal(row.output_vat_minor, 100_000);
  assert.equal(row.tax_rows[0].base_tax_amount_minor, 100_000);
  assert.equal(row.reconciliation_ok, true);
});

test("VAT reconciliation surfaces unmapped tax accounts and arithmetic differences", () => {
  const row = reconcileVatInvoice("Sales Invoice", salesInvoice({
    base_total_taxes_and_charges_minor: 110_000,
    taxes: [
      { account: "33311-KAIRO", tax_amount_minor: 100_000 },
      { account: "OTHER-TAX", tax_amount_minor: 5_000 },
    ],
  }), mapping);
  assert.deepEqual(row.unmapped_tax_accounts, ["OTHER-TAX"]);
  assert.equal(row.tax_rows_base_total_minor, 105_000);
  assert.equal(row.reconciliation_difference_minor, -5_000);
  assert.equal(row.reconciliation_ok, false);
});

test("VAT dataset summary never hides invoice exceptions", () => {
  const sales = reconcileVatInvoice("Sales Invoice", salesInvoice(), mapping);
  const purchase = reconcileVatInvoice("Purchase Invoice", purchaseInvoice(), mapping);
  const clean = summarizeVatDataset([sales, purchase]);
  assert.equal(clean.output_vat_minor, 100_000);
  assert.equal(clean.input_vat_minor, 50_000);
  assert.equal(clean.net_vat_minor, 50_000);
  assert.equal(clean.ready_for_filing_dataset, true);

  const bad = reconcileVatInvoice("Sales Invoice", salesInvoice({
    taxes: [{ account: "UNMAPPED", tax_amount_minor: 100_000 }],
  }), mapping);
  const withException = summarizeVatDataset([bad, purchase], 1);
  assert.equal(withException.ready_for_filing_dataset, false);
  assert.equal(withException.exception_count, 2);
});

test("VAT account mapping and source evidence fail closed", () => {
  assert.throws(() => parseVatAccountMapping({ input_vat: ["1331"], output_vat: ["1331"] }), /both input and output/);
  assert.throws(() => parseVatAccountMapping({ input_vat: [], output_vat: [] }), /cannot be empty/);
  assert.throws(() => reconcileVatInvoice("Sales Invoice", salesInvoice({ docstatus: 0 }), mapping), /must be submitted/);
  assert.throws(() => reconcileVatInvoice("Sales Invoice", salesInvoice({ taxes: [{ account: "33311-KAIRO" }] }), mapping), /tax_amount_minor/);
});
