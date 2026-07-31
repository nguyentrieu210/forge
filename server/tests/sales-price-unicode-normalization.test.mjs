import test from "node:test";
import assert from "node:assert/strict";
import { salesItemContext } from "../dist/apps-src/alumdoor-worker/src/sales-item-context.js";
import { resolveServerPrice } from "../dist/packages/clouderp-pricing/src/index.js";

const composedUom = "Mét";
const decomposedUom = "Me\u0301t";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json" },
});

function item() {
  return {
    item_name: "TRỤC 114_1.8LY",
    is_sales_item: 1,
    disabled: 0,
    is_stock_item: 0,
    stock_uom: composedUom,
    default_sales_uom: composedUom,
    uom_conversions: [],
  };
}

function price(name, uom = decomposedUom) {
  return {
    name,
    price_list: "Giá niêm yết",
    item_code: "TRỤC 114_1.8LY",
    uom,
    currency: "VND",
    rate: 180000,
    disabled: 0,
  };
}

test("legacy Item Price accepts a canonically equivalent Unicode UOM", async () => {
  const calls = [];
  const call = async (path) => {
    calls.push(path);
    if (path === "resource/Item/TR%E1%BB%A4C%20114_1.8LY") return json({ data: item() });
    if (path === "resource/Item%20Price/Gi%C3%A1%20ni%C3%AAm%20y%E1%BA%BFt%3ATR%E1%BB%A4C%20114_1.8LY") {
      return json({ data: price("Giá niêm yết:TRỤC 114_1.8LY") });
    }
    if (path.includes("%3AM%C3%A9t")) return json({ message: "exact probe must not be called" }, 400);
    return json({ message: "not found" }, 404);
  };

  const response = await salesItemContext(call, {
    item_code: "TRỤC 114_1.8LY",
    uom: composedUom,
    price_list: "Giá niêm yết",
    currency: "VND",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.rate, 180000);
  assert.equal(body.selected_uom, composedUom);
  assert.equal(body.price_missing, false);
  assert.equal(calls.some((path) => path.includes("%3AM%C3%A9t")), false);
});

test("field fallback survives a failed exact Unicode-name probe", async () => {
  const calls = [];
  const call = async (path) => {
    calls.push(path);
    if (path === "resource/Item/TR%E1%BB%A4C%20114_1.8LY") return json({ data: item() });
    if (path === "resource/Item%20Price/Gi%C3%A1%20ni%C3%AAm%20y%E1%BA%BFt%3ATR%E1%BB%A4C%20114_1.8LY") {
      return json({ message: "not found" }, 404);
    }
    if (path.includes("%3AM%C3%A9t")) return json({ message: "callback routing failure" }, 400);
    if (path.startsWith("resource/Item%20Price?")) {
      return json({ data: [price("IP-PRODUCTION-1")] });
    }
    return json({ message: "not found" }, 404);
  };

  const response = await salesItemContext(call, {
    item_code: "TRỤC 114_1.8LY",
    uom: composedUom,
    price_list: "Giá niêm yết",
    currency: "VND",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.rate, 180000);
  assert.equal(body.item_price, "IP-PRODUCTION-1");
  assert.equal(body.price_missing, false);
  assert.equal(calls.some((path) => path.startsWith("resource/Item%20Price?")), true);
});

test("authoritative pricing uses the same Unicode normalization", async () => {
  const result = await resolveServerPrice({
    command: { tenant_id: "alu" },
    reader: {
      async getMasterRecordData(_tenant, doctype, name) {
        if (doctype === "Currency" && name === "VND") return { currency_scale: 2 };
        return null;
      },
      async listMasterRecordData(_tenant, doctype) {
        if (doctype === "Item Price") {
          return [{ name: "IP-PRODUCTION-1", data: price("IP-PRODUCTION-1") }];
        }
        if (doctype === "Pricing Rule") return [];
        return [];
      },
    },
  }, {
    itemCode: "TRỤC 114_1.8LY",
    qtyMicros: 1_000_000,
    postingDate: "2026-07-31",
    priceList: "Giá niêm yết",
    documentCurrency: "VND",
    uom: composedUom,
    partyType: "Customer",
    party: "KH-1",
    customerGroup: "Đại lý",
  });

  assert.equal(result.rate, "180000.00");
  assert.equal(result.item_price, "IP-PRODUCTION-1");
  assert.equal(result.uom, composedUom);
});
