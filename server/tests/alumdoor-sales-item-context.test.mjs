import test from "node:test";
import assert from "node:assert/strict";
import { salesItemContext } from "../dist/apps-src/alumdoor-worker/src/sales-item-context.js";

function platform(records, report = []) {
  const calls = [];
  const call = async (path, init = {}) => {
    calls.push({ path, init });
    if (path === "method/frappe.desk.query_report.run") {
      return new Response(JSON.stringify({ message: { result: report } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
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
  call.calls = calls;
  return call;
}

function item(overrides = {}) {
  return {
    item_name: "Hàng thử",
    is_sales_item: 1,
    disabled: 0,
    is_stock_item: 1,
    stock_uom: "Cái",
    default_sales_uom: "Thùng",
    default_warehouse: "Kho A",
    uom_conversions: [{ uom: "Thùng", conversion_factor: 10 }],
    ...overrides,
  };
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

test("sales item context returns exact UOM price and converted warehouse stock", async () => {
  const records = new Map([
    ["Item:ITEM-1", item()],
    ["Item Price:BẢNG GIÁ:ITEM-1:Thùng", { uom: "Thùng", currency: "VND", rate: "1200000" }],
  ]);
  const call = platform(records, [{ item_code: "ITEM-1", warehouse: "Kho A", actual_qty: 35 }]);
  const result = await read(await salesItemContext(call, {
    item_code: "ITEM-1",
    uom: "Thùng",
    warehouse: "Kho A",
    price_list: "BẢNG GIÁ",
    currency: "VND",
  }));

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.allowed_uoms, ["Cái", "Thùng"]);
  assert.equal(result.body.conversion_factor, 10);
  assert.equal(result.body.available_stock_qty, 35);
  assert.equal(result.body.available_qty, 3.5);
  assert.equal(result.body.rate, 1200000);
  assert.equal(result.body.price_missing, false);
  assert.match(result.body.availability_status, /Còn 3,5 Thùng/);
  assert.match(result.body.availability_status, /Giá Thùng: 1\.200\.000 VND/);
});

test("sales item context rejects an Item Price whose currency differs from the document", async () => {
  const records = new Map([
    ["Item:ITEM-1", item()],
    ["Item Price:BẢNG GIÁ:ITEM-1:Thùng", { uom: "Thùng", currency: "USD", rate: "50" }],
  ]);
  const result = await read(await salesItemContext(platform(records), {
    item_code: "ITEM-1",
    uom: "Thùng",
    warehouse: "Kho A",
    price_list: "BẢNG GIÁ",
    currency: "VND",
  }));

  assert.equal(result.status, 200);
  assert.equal(result.body.rate, null);
  assert.equal(result.body.price_missing, true);
  assert.equal(result.body.price_error, "Giá Thùng dùng USD, chứng từ dùng VND.");
  assert.match(result.body.availability_status, /Giá Thùng dùng USD/);
});

test("disabled and malformed preview prices never become a usable row rate", async () => {
  const disabled = new Map([
    ["Item:ITEM-1", item()],
    ["Item Price:BẢNG GIÁ:ITEM-1:Thùng", { uom: "Thùng", currency: "VND", rate: "1200000", disabled: 1 }],
  ]);
  const disabledResult = await read(await salesItemContext(platform(disabled), {
    item_code: "ITEM-1", uom: "Thùng", price_list: "BẢNG GIÁ", currency: "VND",
  }));
  assert.equal(disabledResult.body.rate, null);
  assert.equal(disabledResult.body.price_missing, true);
  assert.equal(disabledResult.body.price_error, "Giá Thùng đã ngừng áp dụng.");

  const malformed = new Map([
    ["Item:ITEM-1", item()],
    ["Item Price:BẢNG GIÁ:ITEM-1:Thùng", { uom: "Thùng", currency: "VND", rate: "không-phải-số" }],
  ]);
  const malformedResult = await read(await salesItemContext(platform(malformed), {
    item_code: "ITEM-1", uom: "Thùng", price_list: "BẢNG GIÁ", currency: "VND",
  }));
  assert.equal(malformedResult.body.rate, null);
  assert.equal(malformedResult.body.price_missing, true);
  assert.equal(malformedResult.body.price_error, "Đơn giá Thùng không hợp lệ.");
});

test("legacy Item Price is accepted only when its declared UOM matches", async () => {
  const matching = new Map([
    ["Item:ITEM-1", item()],
    ["Item Price:BẢNG GIÁ:ITEM-1", { uom: "Thùng", currency: "VND", rate: "1100000" }],
  ]);
  const matchingResult = await read(await salesItemContext(platform(matching), {
    item_code: "ITEM-1", uom: "Thùng", price_list: "BẢNG GIÁ", currency: "VND",
  }));
  assert.equal(matchingResult.body.item_price, "BẢNG GIÁ:ITEM-1");
  assert.equal(matchingResult.body.rate, 1100000);
  assert.equal(matchingResult.body.price_missing, false);

  const mismatching = new Map([
    ["Item:ITEM-1", item()],
    ["Item Price:BẢNG GIÁ:ITEM-1", { uom: "Cái", currency: "VND", rate: "100000" }],
  ]);
  const mismatchingResult = await read(await salesItemContext(platform(mismatching), {
    item_code: "ITEM-1", uom: "Thùng", price_list: "BẢNG GIÁ", currency: "VND",
  }));
  assert.equal(mismatchingResult.body.rate, null);
  assert.equal(mismatchingResult.body.price_missing, true);
  assert.equal(mismatchingResult.body.item_price, "BẢNG GIÁ:ITEM-1:Thùng");
});

test("an undeclared sales UOM is rejected before price or stock lookup", async () => {
  const call = platform(new Map([["Item:ITEM-1", item()]]));
  const result = await read(await salesItemContext(call, {
    item_code: "ITEM-1", uom: "Mét", price_list: "BẢNG GIÁ", currency: "VND",
  }));

  assert.equal(result.status, 422);
  assert.deepEqual(result.body.allowed_uoms, ["Cái", "Thùng"]);
  assert.match(result.body.message, /ĐVT "Mét" chưa được khai/);
  assert.equal(call.calls.some(({ path }) => path.includes("Item Price")), false);
});
