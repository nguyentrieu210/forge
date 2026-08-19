import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    const listMatch = /^resource\/([^/?]+)\?(.*)$/.exec(path);
    if (listMatch) {
      const doctype = decodeURIComponent(listMatch[1]);
      const query = new URLSearchParams(listMatch[2]);
      const filters = JSON.parse(query.get("filters") ?? "[]");
      const prefix = `${doctype}:`;
      const data = [...records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ name: key.slice(prefix.length), ...value }))
        .filter((row) => filters.every((filter) => row[filter[1]] === filter[3]));
      return new Response(JSON.stringify({ data }), {
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
  assert.equal(result.body.inventory_mode, "Hàng thường");
  assert.match(result.body.availability_status, /Còn 3,5 Thùng/);
  assert.match(result.body.availability_status, /Giá Thùng: 1\.200\.000 VND/);
});

test("sales item context converts the base sales price when exact UOM price is absent", async () => {
  const records = new Map([
    ["Item:ITEM-1", item({
      stock_uom: "Mét",
      default_sales_uom: "Mét",
      uom_conversions: [{ uom: "Cây", conversion_factor: 5.85 }],
    })],
    ["Item Price:BẢNG GIÁ:ITEM-1:Mét", {
      item_code: "ITEM-1", price_list: "BẢNG GIÁ", uom: "Mét", currency: "VND", rate: "120000",
    }],
  ]);
  const result = await read(await salesItemContext(platform(records), {
    item_code: "ITEM-1", uom: "Cây", price_list: "BẢNG GIÁ", currency: "VND",
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.rate, 702000);
  assert.equal(result.body.price_missing, false);
  assert.equal(result.body.item_price, "BẢNG GIÁ:ITEM-1:Mét");
});

test("door sold by m² remains selectable when stock is managed by Bộ", async () => {
  const records = new Map([
    ["Item:CUA-DUC", item({
      inventory_mode: "Thành phẩm theo m2",
      stock_uom: "Bộ",
      default_sales_uom: "m2",
      uom_conversions: [],
    })],
    ["Item Price:BẢNG GIÁ:CUA-DUC:m2", {
      item_code: "CUA-DUC", price_list: "BẢNG GIÁ", uom: "m2", currency: "VND", rate: "350000",
    }],
  ]);
  const result = await read(await salesItemContext(platform(records, [{
    item_code: "CUA-DUC", warehouse: "Kho A", actual_qty: 4,
  }]), {
    item_code: "CUA-DUC", uom: "m2", warehouse: "Kho A", price_list: "BẢNG GIÁ", currency: "VND",
  }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.allowed_uoms, ["Bộ", "m2"]);
  assert.equal(result.body.conversion_factor, null);
  assert.equal(result.body.rate, 350000);
  assert.equal(result.body.available_stock_qty, 4);
  assert.equal(result.body.available_qty, null);
  assert.match(result.body.availability_status, /quy đổi theo kích thước dòng/);
});

test("sales item context prefers an exact UOM price over conversion", async () => {
  const records = new Map([
    ["Item:ITEM-1", item({
      stock_uom: "Mét",
      default_sales_uom: "Mét",
      uom_conversions: [{ uom: "Cây", conversion_factor: 5.85 }],
    })],
    ["Item Price:BẢNG GIÁ:ITEM-1:Mét", {
      item_code: "ITEM-1", price_list: "BẢNG GIÁ", uom: "Mét", currency: "VND", rate: "120000",
    }],
    ["Item Price:BẢNG GIÁ:ITEM-1", {
      item_code: "ITEM-1", price_list: "BẢNG GIÁ", uom: "Cây", currency: "VND", rate: "700000",
    }],
    ["Item Price:BẢNG GIÁ:ITEM-1:Cây", {
      item_code: "ITEM-1", price_list: "BẢNG GIÁ", uom: "Cây", currency: "VND", rate: "650000",
    }],
  ]);
  const result = await read(await salesItemContext(platform(records), {
    item_code: "ITEM-1", uom: "Cây", price_list: "BẢNG GIÁ", currency: "VND",
  }));
  assert.equal(result.body.rate, 650000);
  assert.equal(result.body.item_price, "BẢNG GIÁ:ITEM-1:Cây");
});

test("sales item context skips empty stock columns before using the populated balance", async () => {
  const records = new Map([
    ["Item:ITEM-1", item()],
    ["Item Price:BẢNG GIÁ:ITEM-1:Thùng", { uom: "Thùng", currency: "VND", rate: "1200000" }],
  ]);
  const call = platform(records, [{
    item_code: "ITEM-1",
    warehouse: "Kho A",
    actual_qty: null,
    balance_qty: 35,
  }]);
  const result = await read(await salesItemContext(call, {
    item_code: "ITEM-1",
    uom: "Thùng",
    warehouse: "Kho A",
    price_list: "BẢNG GIÁ",
    currency: "VND",
  }));

  assert.equal(result.status, 200);
  assert.equal(result.body.available_stock_qty, 35);
  assert.equal(result.body.available_qty, 3.5);
});

test("sales grid clears authoritative preview values when item context cannot be read", () => {
  const source = readFileSync(
    new URL("../../client/packages/views/src/form/ChildGrid.tsx", import.meta.url),
    "utf8",
  );
  const computeItemPatchStart = source.indexOf("const computeItemPatch");
  const failureStart = source.indexOf("} catch {", computeItemPatchStart);
  const failureEnd = source.indexOf("\n    // Item", failureStart);
  assert.ok(computeItemPatchStart >= 0 && failureStart >= 0 && failureEnd > failureStart, "sales item context failure handler must remain present");
  const failureBlock = source.slice(failureStart, failureEnd);
  assert.match(failureBlock, /patch\.available_qty = undefined/);
  assert.match(failureBlock, /patch\.available_stock_qty = undefined/);
  assert.match(failureBlock, /patch\.available_stock_uom = undefined/);
  assert.match(failureBlock, /patch\.rate = undefined/);
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
