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
        return doctype === "Pricing Rule" ? rules : [];
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
    /document row must provide a matching selling UOM/,
  );
});
