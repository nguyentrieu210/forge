import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import alumdoorWorker from "../dist/apps-src/alumdoor-worker/src/index.js";

const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));
const policies = brief.fixtures
  .filter((entry) => entry.type === "Cutting Policy")
  .map((entry) => ({ name: entry.name, ...entry.data }));

const item = {
  item_code: "CUA-LUOI-TEST",
  item_group: "Cửa Lưới",
  inventory_mode: "Thành phẩm theo m2",
  stock_uom: "m2",
  default_sales_uom: "m2",
  is_sales_item: true,
  min_area_sqm: 0,
};

const platform = {
  fetch(request) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    if (path.endsWith("/resource/Cutting Policy")) return Promise.resolve(Response.json({ data: policies }));
    if (path.endsWith("/resource/Item/CUA-LUOI-TEST")) return Promise.resolve(Response.json({ data: item }));
    if (path.endsWith("/resource/Item Color/GS")) return Promise.resolve(Response.json({ data: { color_code: "GS", disabled: false } }));
    return Promise.resolve(Response.json({ message: "not found" }, { status: 404 }));
  },
};

function request(qty, customerGroup = "Đại lý") {
  return new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://tenant.test/_app/",
    },
    body: JSON.stringify({
      doctype: "Sales Order",
      name: "NEW-SALES-ORDER",
      action: "submit",
      payload: {
        customer_group: customerGroup,
        items: [{
          item_code: "CUA-LUOI-TEST",
          inventory_mode: "Thành phẩm theo m2",
          width_mm: 4_000,
          height_mm: 3_000,
          set_count: 1,
          sales_mode: "Tách món",
          color: "GS",
          uom: "m2",
          qty,
          conversion_factor: 1,
          stock_qty: qty,
        }],
      },
    }),
  });
}

test("Worker dùng Công thức cửa cho qty bán, không còn width × height chung", async () => {
  const accepted = await alumdoorWorker.fetch(request(11.91), { PLATFORM: platform }, {});
  assert.equal(accepted.status, 200, await accepted.text());

  const rejected = await alumdoorWorker.fetch(request(12), { PLATFORM: platform }, {});
  const body = await rejected.json();
  assert.equal(rejected.status, 422);
  assert.match(body.message, /11\.910000 m2/);
});

test("Worker từ chối cửa khi khách chưa có Nhóm giá", async () => {
  const response = await alumdoorWorker.fetch(request(11.91, ""), { PLATFORM: platform }, {});
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.match(body.message, /chưa có Nhóm giá/);
});

test("method tính thử trả cùng rộng cắt và m2 với validator", async () => {
  const response = await alumdoorWorker.fetch(new Request("https://app.internal/api/method/alumdoor.door.calculate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://tenant.test/_app/",
    },
    body: JSON.stringify({ args: {
      item_code: "CUA-LUOI-TEST",
      customer_group: "Đại lý",
      sales_mode: "Tách món",
      width_mm: 4_000,
      height_mm: 3_000,
      set_count: 1,
      purpose: "Bán hàng",
    } }),
  }), { PLATFORM: platform }, {});
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.cut_width_m, 3.97);
  assert.equal(body.billable_area_sqm, 11.91);
  assert.equal(body.results.find((row) => row.chỉ_tiêu === "Diện tích tính tiền").kết_quả, 11.91);
});
