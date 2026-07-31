import test from "node:test";
import assert from "node:assert/strict";
import { salesItemContext } from "../dist/apps-src/alumdoor-worker/src/sales-item-context.js";
import { resolveServerPrice } from "../dist/packages/clouderp-pricing/src/index.js";

function workerPlatform(itemPriceRows) {
  const item = {
    item_name: "Hàng thử",
    is_sales_item: 1,
    disabled: 0,
    is_stock_item: 0,
    stock_uom: "Cái",
    default_sales_uom: "Cái",
    uom_conversions: [],
  };
  const call = async (path) => {
    if (path === "resource/Item/ITEM-1") {
      return new Response(JSON.stringify({ data: item }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (path.startsWith("resource/Item%20Price?")) {
      return new Response(JSON.stringify({ data: itemPriceRows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (path === "method/frappe.desk.query_report.run") {
      return new Response(JSON.stringify({ message: { result: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ message: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };
  return call;
}

function priceRow(name, overrides = {}) {
  return {
    name,
    price_list: "BANG-GIA",
    item_code: "ITEM-1",
    uom: "Cái",
    currency: "VND",
    rate: "125000",
    disabled: 0,
    ...overrides,
  };
}

test("sales item preview resolves a valid Item Price even when its record name is noncanonical", async () => {
  const response = await salesItemContext(workerPlatform([priceRow("IP-0007")]), {
    item_code: "ITEM-1",
    uom: "Cái",
    price_list: "BANG-GIA",
    currency: "VND",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.rate, 125000);
  assert.equal(body.item_price, "IP-0007");
  assert.equal(body.price_missing, false);
  assert.match(body.availability_status, /Giá Cái: 125\.000 VND/);
});

test("sales item preview reports duplicate active field matches instead of silently choosing one", async () => {
  const response = await salesItemContext(workerPlatform([
    priceRow("IP-0007"),
    priceRow("IP-0008", { rate: "126000" }),
  ]), {
    item_code: "ITEM-1",
    uom: "Cái",
    price_list: "BANG-GIA",
    currency: "VND",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.rate, null);
  assert.equal(body.price_missing, true);
  assert.match(body.price_error, /Có nhiều đơn giá đang hoạt động/);
});

function pricingContext(itemPrices) {
  return {
    command: { tenant_id: "demo" },
    reader: {
      async getMasterRecordData(_tenant, doctype, name) {
        if (doctype === "Currency" && name === "VND") return { currency_scale: 2 };
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

test("authoritative server pricing uses the same field-based Item Price fallback", async () => {
  const result = await resolveServerPrice(pricingContext([
    { name: "IP-0007", data: priceRow("IP-0007") },
  ]), {
    itemCode: "ITEM-1",
    qtyMicros: 1_000_000,
    postingDate: "2026-07-31",
    priceList: "BANG-GIA",
    documentCurrency: "VND",
    uom: "Cái",
    partyType: "Customer",
    party: "KH-1",
    customerGroup: "Đại lý",
  });

  assert.equal(result.rate, "125000.00");
  assert.equal(result.item_price, "IP-0007");
  assert.equal(result.uom, "Cái");
});
