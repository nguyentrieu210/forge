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
    return new Response(JSON.stringify({ data: record }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

function salesItem(overrides = {}) {
  return {
    item_name: "Hàng bán",
    is_sales_item: 1,
    disabled: 0,
    is_stock_item: 0,
    stock_uom: "M",
    default_sales_uom: "M",
    item_group: "Phụ kiện",
    ...overrides,
  };
}

test("shaft in combined Ray và trục group uses WIDTH, never HEIGHT", async () => {
  const records = new Map([
    ["Item:TRUC-114", salesItem({ item_group: "Ray và trục" })],
    ["Item Price:Giá niêm yết:TRUC-114", { uom: "M", currency: "VND", rate: "140000" }],
  ]);
  const result = await read(await salesItemContext(platform(records), {
    item_code: "TRUC-114", quantity: 3, width_m: 5.3, currency: "VND",
  }));

  assert.equal(result.status, 200);
  assert.equal(result.body.calculation_mode, "WIDTH");
  assert.equal(result.body.billable_qty, 15.9);
  assert.equal(result.body.gross_amount, 2226000);
});

test("ray uses HEIGHT and fills amount automatically", async () => {
  const records = new Map([
    ["Item:RAY-HOP-TD", salesItem({ item_group: "Ray và trục" })],
    ["Item Price:Giá niêm yết:RAY-HOP-TD", { uom: "M", currency: "VND", rate: "165000" }],
  ]);
  const result = await read(await salesItemContext(platform(records), {
    item_code: "RAY-HOP-TD", quantity: 6, height_m: 3.1, currency: "VND",
  }));

  assert.equal(result.status, 200);
  assert.equal(result.body.calculation_mode, "HEIGHT");
  assert.equal(result.body.billable_qty, 18.6);
  assert.equal(result.body.gross_amount, 3069000);
});

test("German door uses authoritative billable area and defaults the visible 15 percent line discount", async () => {
  const records = new Map([
    ["Item:CUA-DUC-AL501N", salesItem({
      item_group: "Cửa Đức",
      door_type: "Cửa Đức",
      inventory_mode: "Thành phẩm theo m2",
      stock_uom: "Bộ",
      default_sales_uom: "M2",
    })],
    ["Item Price:Giá niêm yết:CUA-DUC-AL501N", { uom: "M2", currency: "VND", rate: "1066000" }],
  ]);
  const result = await read(await salesItemContext(platform(records), {
    item_code: "CUA-DUC-AL501N", quantity: 3, height_m: 3.2, width_m: 5.15,
    billable_area_sqm: 49.44, currency: "VND",
  }));

  assert.equal(result.status, 200);
  assert.equal(result.body.calculation_mode, "AREA");
  assert.equal(result.body.billable_qty, 49.44);
  assert.equal(result.body.rate, 1066000);
  assert.equal(result.body.discount_percentage, 15);
  assert.equal(result.body.gross_amount, 52703040);
  assert.equal(result.body.discount_amount, 7905456);
  assert.equal(result.body.net_amount, 44797584);
});
