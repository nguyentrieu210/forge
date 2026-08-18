import test from "node:test";
import assert from "node:assert/strict";
import { salesItemContext } from "../dist/apps-src/alumdoor-worker/src/sales-item-context.js";

function platform(records) {
  return async (path) => {
    const match = /^resource\/([^/]+)\/(.+)$/.exec(path);
    if (!match) return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    const doctype = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
    const record = records.get(`${doctype}:${name}`);
    if (!record) return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    return new Response(JSON.stringify({ data: record }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

test("canonical finished door may sell by m2 while stock UOM is Bộ using measurement_profile", async () => {
  const records = new Map([
    ["Item:TP-ALD-548N THO", {
      item_code: "TP-ALD-548N THO",
      item_name: "ĐỨC AL548N - MSK",
      item_group: "Cửa CN Đức",
      is_sales_item: 1,
      disabled: 0,
      is_stock_item: 1,
      stock_uom: "Bộ",
      default_sales_uom: "m2",
      measurement_profile: "Thành phẩm theo m2",
      uom_conversions: [],
    }],
  ]);

  const response = await salesItemContext(platform(records), {
    item_code: "TP-ALD-548N THO",
    uom: "m2",
    currency: "VND",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.allowed_uoms, ["Bộ", "m2"]);
  assert.equal(body.selected_uom, "m2");
  assert.equal(body.conversion_factor, null);
  assert.equal(body.inventory_mode, "Thành phẩm theo m2");
  assert.equal(body.measurement_profile, "Thành phẩm theo m2");
  assert.equal(body.door_type, "Cửa CN Đức");
});
