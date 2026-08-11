import test from "node:test";
import assert from "node:assert/strict";
import {
  STANDARD_PRICE_VARIANT,
  normalizePriceVariant,
  resolveServerPrice,
} from "../dist/packages/clouderp-pricing/src/index.js";

function priceRow(name, overrides = {}) {
  return {
    name,
    price_list: "BANG-GIA",
    item_code: "ITEM-1",
    uom: "m2",
    currency: "VND",
    rate: "1626000",
    disabled: 0,
    ...overrides,
  };
}

function pricingContext(itemPrices) {
  return {
    command: { tenant_id: "demo" },
    reader: {
      async getMasterRecordData(_tenant, doctype, name) {
        if (doctype === "Currency" && name === "VND") return { currency_scale: 0 };
        if (doctype === "Item Price") {
          const match = itemPrices.find((entry) => entry.name === name);
          return match?.data ?? null;
        }
        return null;
      },
      async listMasterRecordData(_tenant, doctype) {
        if (doctype === "Item Price") return itemPrices;
        if (doctype === "Pricing Rule") return [];
        return [];
      },
    },
  };
}

function listed(...rows) {
  return rows.map((data) => ({ name: data.name, data }));
}

function request(overrides = {}) {
  return {
    itemCode: "ITEM-1",
    qtyMicros: 1_000_000,
    postingDate: "2026-08-11",
    priceList: "BANG-GIA",
    documentCurrency: "VND",
    uom: "m2",
    partyType: "Customer",
    party: "KH-1",
    ...overrides,
  };
}

test("legacy Item Price without price_variant remains canonical STANDARD", async () => {
  const result = await resolveServerPrice(
    pricingContext(listed(priceRow("IP-STANDARD"))),
    request(),
  );

  assert.equal(result.price_variant, STANDARD_PRICE_VARIANT);
  assert.equal(result.item_price, "IP-STANDARD");
  assert.equal(result.rate, "1626000");
});

test("same Price List + Item + UOM can carry independent STANDARD and WITH_RAIL prices", async () => {
  const rows = listed(
    priceRow("IP-STANDARD"),
    priceRow("IP-WITH-RAIL", { price_variant: "WITH_RAIL", rate: "1701000" }),
  );

  const standard = await resolveServerPrice(pricingContext(rows), request());
  const withRail = await resolveServerPrice(
    pricingContext(rows),
    request({ priceVariant: "WITH_RAIL" }),
  );

  assert.equal(standard.item_price, "IP-STANDARD");
  assert.equal(standard.rate, "1626000");
  assert.equal(standard.price_variant, "STANDARD");
  assert.equal(withRail.item_price, "IP-WITH-RAIL");
  assert.equal(withRail.rate, "1701000");
  assert.equal(withRail.price_variant, "WITH_RAIL");
});

test("requested non-standard variant never silently falls back to STANDARD", async () => {
  await assert.rejects(
    resolveServerPrice(
      pricingContext(listed(priceRow("IP-STANDARD"))),
      request({ priceVariant: "WITH_RAIL" }),
    ),
    (error) => error instanceof Error && /does not exist for variant WITH_RAIL/.test(error.message),
  );
});

test("duplicate active records are rejected within the same exact variant only", async () => {
  const duplicate = listed(
    priceRow("IP-RAIL-1", { price_variant: "WITH_RAIL", rate: "1701000" }),
    priceRow("IP-RAIL-2", { price_variant: "WITH_RAIL", rate: "1702000" }),
    priceRow("IP-STANDARD", { rate: "1626000" }),
  );

  await assert.rejects(
    resolveServerPrice(pricingContext(duplicate), request({ priceVariant: "WITH_RAIL" })),
    (error) => error instanceof Error && /Multiple active Item Price records match/.test(error.message),
  );

  const standard = await resolveServerPrice(pricingContext(duplicate), request());
  assert.equal(standard.item_price, "IP-STANDARD");
});

test("variant identifiers are canonical and reject translated/free-form labels", () => {
  assert.equal(normalizePriceVariant(undefined), "STANDARD");
  assert.equal(normalizePriceVariant("with_rail"), "WITH_RAIL");
  assert.throws(() => normalizePriceVariant("Có ray"), /variant must use/);
});
