import assert from "node:assert/strict";
import test from "node:test";

import { applyPurchaseOrderCommercialTotals } from "../dist/packages/clouderp-core/src/purchase-order-commercial-controller.js";

test("Purchase Order applies order-level percentage discount before additive VAT", () => {
  const result = applyPurchaseOrderCommercialTotals({
    supplier: "NCC-01",
    company: "ALUMDOOR",
    currency: "VND",
    currency_scale: 2,
    company_currency: "VND",
    company_currency_scale: 2,
    conversion_rate: "1.000000",
    conversion_rate_micros: 1_000_000,
    transaction_date: "2026-08-05",
    apply_discount_on: "Net Total",
    additional_discount_percentage: 10,
    items: [{
      row_id: "ROW-1",
      item_code: "PK-01",
      qty: 2,
      rate: 10000,
      uom: "Cái",
      stock_uom: "Cái",
      conversion_factor: 1,
      stock_qty: "2.000000",
    }],
    taxes: [{
      row_id: "VAT",
      account: "VAT-MUA-ALUMDOOR",
      rate: 8,
      charge_type: "On Net Total",
      add_deduct_tax: "Add",
    }],
  });

  assert.equal(result.net_total, "18000.00");
  assert.equal(result.discount_amount, "2000.00");
  assert.equal(result.additional_discount_percentage, "10.000000");
  assert.equal(result.total_taxes_and_charges, "1440.00");
  assert.equal(result.grand_total, "19440.00");
  assert.equal(result.base_net_total, "18000.00");
  assert.equal(result.base_total_taxes_and_charges, "1440.00");
  assert.equal(result.base_grand_total, "19440.00");
  assert.equal(result.items[0].net_amount, "18000.00");
});
