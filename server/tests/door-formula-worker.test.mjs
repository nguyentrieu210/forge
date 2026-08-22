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
    if (path.endsWith("/resource/Customer/CUST-DEALER")) return Promise.resolve(Response.json({ data: { price_group: "Đại lý" } }));
    if (path.endsWith("/resource/Customer/CUST-RETAIL")) return Promise.resolve(Response.json({ data: { price_group: "Lẻ" } }));
    if (path.endsWith("/resource/Customer/CUST-NO-GROUP")) return Promise.resolve(Response.json({ data: { price_group: "" } }));
    if (path.endsWith("/resource/Surface Finish")) return Promise.resolve(Response.json({ data: [{ name: "SON", finish_name: "Sơn", requires_color: 1, applies_to_all_groups: 1, disabled: 0, usage_scope: "Mua & bán" }] }));
    if (path.endsWith("/resource/Surface Finish/SON")) return Promise.resolve(Response.json({ data: { name: "SON", finish_name: "Sơn", requires_color: 1, applies_to_all_groups: 1, disabled: 0, usage_scope: "Mua & bán" } }));
    if (path.endsWith("/resource/Item Color")) return Promise.resolve(Response.json({ data: [{ name: "GS", color_code: "GS", disabled: 0, usage_scope: "Mua & bán" }] }));
    if (path.endsWith("/resource/Item Color/GS")) return Promise.resolve(Response.json({ data: { name: "GS", color_code: "GS", surface_finish: "SON", disabled: 0, usage_scope: "Mua & bán" } }));
    if (path.endsWith("/resource/Item Group/Cửa Lưới")) return Promise.resolve(Response.json({ data: { name: "Cửa Lưới", parent_item_group: "" } }));
    return Promise.resolve(Response.json({ message: "not found" }, { status: 404 }));
  },
};

function request(
  qty,
  customerGroup = "Đại lý",
  customer = customerGroup ? "CUST-DEALER" : "CUST-NO-GROUP",
) {
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
        customer,
        customer_group: customerGroup,
        items: [{
          item_code: "CUA-LUOI-TEST",
          inventory_mode: "Thành phẩm theo m2",
          width_m: 4,
          height_m: 3,
          // Cửa Lưới mua vật tư theo Cao lưới; ghi sổ đơn bán bắt buộc có ô này.
          mesh_height_m: 2.8,
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

test("Worker cho phép snapshot Nhóm giá hợp lệ khác mặc định hồ sơ khách", async () => {
  const response = await alumdoorWorker.fetch(request(11.91, "Đại lý", "CUST-RETAIL"), { PLATFORM: platform }, {});
  assert.equal(response.status, 200, await response.text());
});

/**
 * Cao lưới không suy được từ Cao phủ bì. Thiếu nó thì khâu PHÁT LỆNH SẢN XUẤT mới vỡ với
 * "Cao lưới phải lớn hơn 0" — tức là sau khi đã hứa ngày giao với khách. Cổng phải nằm ở
 * lúc ghi sổ đơn, và phải KHÔNG nằm ở báo giá hay bản nháp.
 */
function meshRequest(doctype, action) {
  return new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://tenant.test/_app/",
    },
    body: JSON.stringify({
      doctype,
      name: `NEW-${doctype.replace(/\s+/g, "-").toUpperCase()}`,
      action,
      payload: {
        customer: "CUST-DEALER",
        customer_group: "Đại lý",
        items: [{
          item_code: "CUA-LUOI-TEST",
          inventory_mode: "Thành phẩm theo m2",
          width_m: 4,
          height_m: 3,
          set_count: 1,
          sales_mode: "Tách món",
          color: "GS",
          uom: "m2",
          qty: 11.91,
          conversion_factor: 1,
          stock_qty: 11.91,
        }],
      },
    }),
  });
}

test("ghi sổ đơn bán Cửa Lưới thiếu Cao lưới bị chặn ngay, không để vỡ ở khâu sản xuất", async () => {
  const response = await alumdoorWorker.fetch(meshRequest("Sales Order", "submit"), { PLATFORM: platform }, {});
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.match(body.message, /Cao lưới/);
});

test("báo giá và bản nháp vẫn để trống Cao lưới được — lúc đó người bán chưa ra tận nơi đo", async () => {
  for (const [doctype, action] of [["Quotation", "submit"], ["Sales Order", "save"]]) {
    const response = await alumdoorWorker.fetch(meshRequest(doctype, action), { PLATFORM: platform }, {});
    assert.equal(response.status, 200, `${doctype}/${action}: ${await response.text()}`);
  }
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
      width_m: 4,
      height_m: 3,
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

function salesLineRequest(row) {
  return new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://tenant.test/_app/",
    },
    body: JSON.stringify({
      doctype: "Sales Order",
      name: "NEW-SALES-LINE",
      action: "save",
      payload: { customer_group: "Đại lý", items: [row] },
    }),
  });
}

function salesLinePlatform(items) {
  return {
    fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      if (path.endsWith("/resource/Cutting Policy")) return Promise.resolve(Response.json({ data: [] }));
      const parts = path.split("/").filter(Boolean);
      const doctype = parts.at(-2);
      const name = parts.at(-1);
      if (doctype === "Item" && items[name]) return Promise.resolve(Response.json({ data: items[name] }));
      if (doctype === "Item Color" && name === "GS") return Promise.resolve(Response.json({ data: { disabled: 0 } }));
      return Promise.resolve(Response.json({ message: "not found" }, { status: 404 }));
    },
  };
}

test("ray/trục bán Mét bắt buộc qty = chiều dài × số cây", async () => {
  const env = { PLATFORM: salesLinePlatform({
    "TRUC-114": {
      item_code: "TRUC-114",
      inventory_mode: "Nhôm cây/lá",
      stock_uom: "Kg",
      default_sales_uom: "Mét",
      uom_conversions: [{ uom: "Mét", conversion_factor: 2.1 }],
      is_sales_item: 1,
    },
  }) };
  const line = {
    item_code: "TRUC-114", uom: "Mét", width_m: 5.3, set_count: 3,
    qty: 15.9, conversion_factor: 2.1, stock_qty: 33.39,
  };
  const accepted = await alumdoorWorker.fetch(salesLineRequest(line), env, {});
  assert.equal(accepted.status, 200, await accepted.text());

  const rejected = await alumdoorWorker.fetch(salesLineRequest({ ...line, qty: 3, stock_qty: 6.3 }), env, {});
  const body = await rejected.json();
  assert.equal(rejected.status, 422);
  assert.match(body.message, /15\.900000 Mét/);
});

test("phụ kiện giữ qty trực tiếp theo đúng ĐVT bán", async () => {
  const env = { PLATFORM: salesLinePlatform({
    "BO-TU-DUNG": {
      item_code: "BO-TU-DUNG",
      inventory_mode: "Hàng thường",
      stock_uom: "Bộ",
      default_sales_uom: "Bộ",
      is_sales_item: 1,
    },
  }) };
  const response = await alumdoorWorker.fetch(salesLineRequest({
    item_code: "BO-TU-DUNG", uom: "Bộ", qty: 2, conversion_factor: 1, stock_qty: 2,
  }), env, {});
  assert.equal(response.status, 200, await response.text());
});
