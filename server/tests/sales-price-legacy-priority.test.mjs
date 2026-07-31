import test from "node:test";
import assert from "node:assert/strict";
import { salesItemContext } from "../dist/apps-src/alumdoor-worker/src/sales-item-context.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json" },
});

test("sales preview uses the authoritative legacy Item Price before probing an exact Unicode-UOM name", async () => {
  const calls = [];
  const call = async (path) => {
    calls.push(path);
    if (path === "resource/Item/TR%E1%BB%A4C%20114_1.8LY") {
      return json({ data: {
        item_name: "TRỤC 114_1.8LY",
        is_sales_item: 1,
        disabled: 0,
        is_stock_item: 0,
        stock_uom: "Mét",
        default_sales_uom: "Mét",
        uom_conversions: [],
      } });
    }
    if (path === "resource/Item%20Price/Gi%C3%A1%20ni%C3%AAm%20y%E1%BA%BFt%3ATR%E1%BB%A4C%20114_1.8LY") {
      return json({ data: {
        name: "Giá niêm yết:TRỤC 114_1.8LY",
        price_list: "Giá niêm yết",
        item_code: "TRỤC 114_1.8LY",
        uom: "Mét",
        currency: "VND",
        rate: 180000,
        disabled: 0,
      } });
    }
    if (path.includes("%3AM%C3%A9t")) {
      return json({ message: "callback cannot route the Unicode exact-name probe" }, 400);
    }
    return json({ message: "not found" }, 404);
  };

  const response = await salesItemContext(call, {
    item_code: "TRỤC 114_1.8LY",
    uom: "Mét",
    price_list: "Giá niêm yết",
    currency: "VND",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.rate, 180000);
  assert.equal(body.price_missing, false);
  assert.equal(body.item_price, "Giá niêm yết:TRỤC 114_1.8LY");
  assert.equal(calls.some((path) => path.includes("%3AM%C3%A9t")), false,
    "a valid authoritative legacy record must stop the risky exact-name probe");
});
