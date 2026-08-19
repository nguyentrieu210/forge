import test from "node:test";
import assert from "node:assert/strict";
import { resolveCommercialLine } from "../dist/packages/clouderp-selling/src/commercial-line-resolver.js";
import { calculateSalesTotals } from "../dist/packages/clouderp-selling/src/totals.js";

function context() {
  const price = {
    price_list: "DEALER",
    item_code: "DOOR-1",
    uom: "m2",
    currency: "VND",
    rate: 1_626_000,
    disabled: 0,
  };
  const rules = [
    {
      name: "DISCOUNT-15",
      data: { price_list: "DEALER", item_code: "DOOR-1", discount_percentage: 15, priority: 100 },
    },
    {
      name: "WOOD-GRAIN",
      data: {
        effect_type: "ADJUSTMENT",
        adjustment_basis: "AREA_SQM",
        adjustment_rate: 465000,
        conditions: [{ field: "finish_class", operator: "eq", value: "WOOD_GRAIN" }],
        priority: 100,
        taxable: true,
      },
    },
  ];
  return {
    command: { tenant_id: "demo" },
    reader: {
      async getMasterRecordData(_tenant, doctype, name) {
        if (doctype === "Item Price" && name === "DEALER:DOOR-1:m2") return price;
        if (doctype === "Currency" && name === "VND") return { currency_scale: 0 };
        return null;
      },
      async listMasterRecordData(_tenant, doctype) {
        if (doctype === "Item Price") return [{ name: "DEALER:DOOR-1:m2", data: price }];
        if (doctype === "Pricing Rule") return rules;
        return [];
      },
      async getDocument(_tenant, doctype, name) {
        if (doctype !== "Pricing Rule") return null;
        const row = rules.find((rule) => rule.name === name);
        return row ? { name, version: name === "DISCOUNT-15" ? 3 : 8, data: row.data } : null;
      },
    },
  };
}

test("commercial line calculates gross, line discount, adjustment and net on the server", async () => {
  const result = await resolveCommercialLine(context(), {
    itemCode: "DOOR-1",
    priceList: "DEALER",
    documentCurrency: "VND",
    postingDate: "2026-08-11",
    uom: "m2",
    pricedQty: 10,
    partyType: "Customer",
    party: "KH-1",
    customerGroup: "Đại lý",
    facts: { finish_class: "WOOD_GRAIN" },
    areaSqm: 5.2,
  });

  assert.equal(result.gross_amount_minor, 16_260_000);
  assert.equal(result.discount_amount_minor, 2_439_000);
  assert.equal(result.adjustment_amount_minor, 2_418_000);
  assert.equal(result.net_before_tax_minor, 16_239_000);
  assert.equal(result.pricing_rule_snapshots.length, 2);
});

test("manual percentage changes money but never accepts a client discount amount", async () => {
  const result = await resolveCommercialLine(context(), {
    itemCode: "DOOR-1",
    priceList: "DEALER",
    documentCurrency: "VND",
    postingDate: "2026-08-11",
    uom: "m2",
    pricedQty: 10,
    partyType: "Customer",
    party: "KH-1",
    customerGroup: "Đại lý",
    facts: {},
    discountPercentageOverride: 10,
  });
  assert.equal(result.discount_amount_minor, 1_626_000);
  assert.equal(result.net_before_tax_minor, 14_634_000);
});

test("ordinary item amount always multiplies the latest entered quantity", async () => {
  const price = {
    price_list: "DEALER",
    item_code: "MOTOR-1",
    uom: "Cái",
    currency: "VND",
    rate: 2_700_000,
    disabled: 0,
  };
  const ordinaryContext = {
    command: { tenant_id: "demo" },
    reader: {
      async getMasterRecordData(_tenant, doctype, name) {
        if (doctype === "Item Price" && name === "DEALER:MOTOR-1:Cái") return price;
        if (doctype === "Currency" && name === "VND") return { currency_scale: 0 };
        return null;
      },
      async listMasterRecordData(_tenant, doctype) {
        if (doctype === "Item Price") return [{ name: "DEALER:MOTOR-1:Cái", data: price }];
        return [];
      },
      async getDocument() { return null; },
    },
  };

  const result = await resolveCommercialLine(ordinaryContext, {
    itemCode: "MOTOR-1",
    priceList: "DEALER",
    documentCurrency: "VND",
    postingDate: "2026-08-19",
    uom: "Cái",
    pricedQty: 2,
    facts: { inventory_mode: "Hàng thường", set_count: 2 },
    setCount: 2,
  });

  assert.equal(result.priced_qty, "2.000000");
  assert.equal(result.selling_rate, "2700000");
  assert.equal(result.gross_amount, "5400000");
});

test("sales totals reconcile policy-derived line money without a client header discount", () => {
  const totals = calculateSalesTotals([{
    row_id: "R1",
    item_code: "DOOR-1",
    qty: 10,
    priced_qty_micros: 10_000_000,
    rate: 1_626_000,
    discount_amount_minor: 2_439_000,
    adjustment_amount_minor: 2_418_000,
  }], [], 0, {
    use_priced_quantity: true,
    use_server_line_money: true,
  });

  assert.equal(totals.items[0].amount_minor, 16_260_000);
  assert.equal(totals.items[0].net_amount_minor, 16_239_000);
  assert.equal(totals.net_total_minor, 16_239_000);
  assert.equal(totals.discount_amount_minor, 2_439_000);
  assert.equal(totals.grand_total_minor, 16_239_000);
});
