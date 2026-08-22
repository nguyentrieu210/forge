import test from "node:test";
import assert from "node:assert/strict";
import { resolveServerPrice } from "../dist/packages/clouderp-pricing/src/index.js";

function context(masters, rules = []) {
  return {
    command: { tenant_id: "demo" },
    reader: {
      async getMasterRecordData(_tenant, doctype, name) {
        return masters.get(`${doctype}:${name}`) ?? null;
      },
      async listMasterRecordData(_tenant, doctype) {
        if (doctype === "Pricing Rule") return rules;
        const prefix = `${doctype}:`;
        return [...masters.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, data]) => ({ name: key.slice(prefix.length), data }));
      },
    },
  };
}

function base(uom) {
  return {
    itemCode: "ITEM-1", qtyMicros: 1_000_000, postingDate: "2026-07-31",
    priceList: "BANG-GIA", documentCurrency: "VND", uom,
    partyType: "Customer", party: "KH-1", customerGroup: "Đại lý",
  };
}

const currency = ["Currency:VND", { currency_scale: 2 }];

test("Item Price resolves independently for each sales UOM", async () => {
  const masters = new Map([
    currency,
    ["Item Price:BANG-GIA:ITEM-1:Cái", { uom: "Cái", currency: "VND", rate: "120000" }],
    ["Item Price:BANG-GIA:ITEM-1:Thùng", { uom: "Thùng", currency: "VND", rate: "1100000" }],
  ]);
  const each = await resolveServerPrice(context(masters), base("Cái"));
  const box = await resolveServerPrice(context(masters), base("Thùng"));
  assert.equal(each.rate, "120000.00");
  assert.equal(each.item_price, "BANG-GIA:ITEM-1:Cái");
  assert.equal(box.rate, "1100000.00");
  assert.equal(box.item_price, "BANG-GIA:ITEM-1:Thùng");
});

test("legacy two-part Item Price remains readable only for the matching UOM", async () => {
  const masters = new Map([
    currency,
    ["Item Price:BANG-GIA:ITEM-1", { uom: "Cái", currency: "VND", rate: "125000" }],
  ]);
  const result = await resolveServerPrice(context(masters), base("Cái"));
  assert.equal(result.item_price, "BANG-GIA:ITEM-1");
  await assert.rejects(
    resolveServerPrice(context(masters), base("Thùng")),
    /BANG-GIA:ITEM-1:Thùng does not exist/,
  );
});

test("untyped legacy Item Price remains compatible with an untyped sales row", async () => {
  const masters = new Map([
    currency,
    ["Item Price:BANG-GIA:ITEM-1", { currency: "VND", rate: "125000" }],
  ]);
  const result = await resolveServerPrice(context(masters), base(undefined));
  assert.equal(result.rate, "125000.00");
  assert.equal(result.item_price, "BANG-GIA:ITEM-1");
});

test("typed legacy Item Price requires an explicit matching sales UOM", async () => {
  const masters = new Map([
    currency,
    ["Item Price:BANG-GIA:ITEM-1", { uom: "Cái", currency: "VND", rate: "125000" }],
  ]);
  await assert.rejects(
    resolveServerPrice(context(masters), base(undefined)),
    /document row must provide a matching transaction UOM/,
  );
});

test("missing exact UOM price converts from the Item sales UOM", async () => {
  const masters = new Map([
    currency,
    ["Item:ITEM-1", {
      name: "ITEM-1", stock_uom: "Mét", default_sales_uom: "Mét",
      uom_conversions: [{ uom: "Cây", conversion_factor: 5.85 }],
    }],
    ["Item Price:BANG-GIA:ITEM-1:Mét", {
      item_code: "ITEM-1", price_list: "BANG-GIA", uom: "Mét", currency: "VND", rate: "120000",
    }],
  ]);
  const result = await resolveServerPrice(context(masters), base("Cây"));
  assert.equal(result.rate, "702000.00");
  assert.equal(result.uom, "Cây");
  assert.equal(result.source_uom, "Mét");
});

test("exact UOM price overrides the automatically converted price", async () => {
  const masters = new Map([
    currency,
    ["Item:ITEM-1", {
      name: "ITEM-1", stock_uom: "Mét", default_sales_uom: "Mét",
      uom_conversions: [{ uom: "Cây", conversion_factor: 5.85 }],
    }],
    ["Item Price:BANG-GIA:ITEM-1:Mét", {
      item_code: "ITEM-1", price_list: "BANG-GIA", uom: "Mét", currency: "VND", rate: "120000",
    }],
    ["Item Price:BANG-GIA:ITEM-1:Cây", {
      item_code: "ITEM-1", price_list: "BANG-GIA", uom: "Cây", currency: "VND", rate: "650000",
    }],
  ]);
  const result = await resolveServerPrice(context(masters), base("Cây"));
  assert.equal(result.rate, "650000.00");
  assert.equal(result.item_price, "BANG-GIA:ITEM-1:Cây");
  assert.equal(result.source_uom, undefined);
});

test("exact UOM record overrides a compatible legacy record", async () => {
  const masters = new Map([
    currency,
    ["Item Price:BANG-GIA:ITEM-1", {
      item_code: "ITEM-1", price_list: "BANG-GIA", uom: "Cây", currency: "VND", rate: "700000",
    }],
    ["Item Price:BANG-GIA:ITEM-1:Cây", {
      item_code: "ITEM-1", price_list: "BANG-GIA", uom: "Cây", currency: "VND", rate: "650000",
    }],
  ]);
  const result = await resolveServerPrice(context(masters), base("Cây"));
  assert.equal(result.rate, "650000.00");
  assert.equal(result.item_price, "BANG-GIA:ITEM-1:Cây");
});
