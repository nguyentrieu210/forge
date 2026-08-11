import test from "node:test";
import assert from "node:assert/strict";
import { resolveCommercialLine } from "../dist/packages/clouderp-selling/src/index.js";

function context({ itemPrices, adjustmentRules = [] }) {
  return {
    command: { tenant_id: "tenant-a" },
    reader: {
      async getMasterRecordData(_tenant, doctype, name) {
        if (doctype === "Currency" && name === "VND") return { currency_scale: 0 };
        if (doctype === "Item Price") {
          const match = itemPrices.find((row) => row.name === name);
          return match?.data ?? null;
        }
        return null;
      },
      async listMasterRecordData(_tenant, doctype) {
        if (doctype === "Item Price") return itemPrices;
        if (doctype === "Pricing Rule") return [];
        if (doctype === "Sales Adjustment Rule") {
          return adjustmentRules.map(({ name, data }) => ({ name, data }));
        }
        return [];
      },
      async getDocument(_tenant, doctype, name) {
        if (doctype !== "Sales Adjustment Rule") return null;
        const row = adjustmentRules.find((candidate) => candidate.name === name);
        if (!row) return null;
        return {
          tenant_id: "tenant-a",
          doctype,
          name,
          owner: "Administrator",
          docstatus: 0,
          status: "Draft",
          version: row.version,
          created_at: "2026-08-11T00:00:00.000Z",
          modified_at: "2026-08-11T00:00:00.000Z",
          data: row.data,
          children: [],
        };
      },
    },
  };
}

function itemPrice(name, variant, rate) {
  return {
    name,
    data: {
      name,
      price_list: "BAN-LE",
      item_code: "ITEM-DOOR",
      uom: "m2",
      currency: "VND",
      rate,
      price_variant: variant,
      disabled: 0,
    },
  };
}

test("commercial line may sell WITH_RAIL while discount basis remains STANDARD", async () => {
  const result = await resolveCommercialLine(context({
    itemPrices: [
      itemPrice("IP-BASE", "STANDARD", 1626000),
      itemPrice("IP-RAIL", "WITH_RAIL", 1701000),
    ],
    adjustmentRules: [
      {
        name: "SAR-FINISH",
        version: 4,
        data: {
          code: "PREMIUM_FINISH",
          rule_name: "Premium finish",
          currency: "VND",
          basis: "AREA_SQM",
          rate: 465000,
          valid_from: "2026-08-01",
          conditions: [
            { field: "finish_type", operator: "eq", value: "PREMIUM" },
          ],
        },
      },
    ],
  }), {
    itemCode: "ITEM-DOOR",
    priceList: "BAN-LE",
    documentCurrency: "VND",
    postingDate: "2026-08-11",
    uom: "m2",
    priceVariant: "WITH_RAIL",
    discountBasisVariant: "STANDARD",
    pricedQty: 10,
    discountPercentage: 15,
    partyType: "Customer",
    party: "KH-1",
    customerGroup: "RETAIL",
    facts: { finish_type: "PREMIUM" },
    area_sqm: 5.2,
  });

  assert.equal(result.selling_price.item_price, "IP-RAIL");
  assert.equal(result.selling_price.price_variant, "WITH_RAIL");
  assert.equal(result.selling_price.rate_minor, 1701000);
  assert.equal(result.discount_basis_price.item_price, "IP-BASE");
  assert.equal(result.discount_basis_variant, "STANDARD");
  assert.equal(result.discount_basis_price.rate_minor, 1626000);

  assert.equal(result.totals.gross_amount_minor, 17010000);
  assert.equal(result.totals.discount_basis_amount_minor, 16260000);
  assert.equal(result.totals.discount_amount_minor, 2439000);
  assert.equal(result.discount_amount, "2439000");
  assert.equal(result.totals.surcharge_amount_minor, 2418000);
  assert.equal(result.adjustment_amount, "2418000");
  assert.equal(result.totals.net_before_tax_minor, 16989000);
  assert.equal(result.net_before_tax, "16989000");

  assert.equal(result.applied_adjustments.length, 1);
  assert.equal(result.applied_adjustments[0].rule_code, "PREMIUM_FINISH");
  assert.equal(result.applied_adjustments[0].rule_name, "SAR-FINISH");
  assert.equal(result.applied_adjustments[0].rule_version, 4);
  assert.equal(result.applied_adjustments[0].basis, "AREA_SQM");
  assert.equal(result.applied_adjustments[0].basis_qty, "5.200000");
  assert.equal(result.applied_adjustments[0].amount_minor, 2418000);
});

test("when discount basis variant is omitted, selling variant is the basis", async () => {
  const result = await resolveCommercialLine(context({
    itemPrices: [itemPrice("IP-RAIL", "WITH_RAIL", 1701000)],
  }), {
    itemCode: "ITEM-DOOR",
    priceList: "BAN-LE",
    documentCurrency: "VND",
    postingDate: "2026-08-11",
    uom: "m2",
    priceVariant: "WITH_RAIL",
    pricedQty: 2,
    discountPercentage: 10,
    facts: {},
  });

  assert.equal(result.discount_basis_price.item_price, "IP-RAIL");
  assert.equal(result.totals.gross_amount_minor, 3402000);
  assert.equal(result.totals.discount_basis_amount_minor, 3402000);
  assert.equal(result.totals.discount_amount_minor, 340200);
  assert.equal(result.totals.net_before_tax_minor, 3061800);
});

test("commercial line fails closed when selected variant has no configured Item Price", async () => {
  await assert.rejects(
    resolveCommercialLine(context({
      itemPrices: [itemPrice("IP-BASE", "STANDARD", 1626000)],
    }), {
      itemCode: "ITEM-DOOR",
      priceList: "BAN-LE",
      documentCurrency: "VND",
      postingDate: "2026-08-11",
      uom: "m2",
      priceVariant: "WITH_RAIL",
      pricedQty: 1,
      facts: {},
    }),
    (error) => error instanceof Error && /does not exist for variant WITH_RAIL/.test(error.message),
  );
});