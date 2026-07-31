import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/apps-src/alumdoor-worker/src/index.js";

function platformFetcher(records = {}) {
  const masters = new Map(Object.entries(records));
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const parts = url.pathname.replace(/^\/+/, "").split("/");
      if (parts[0] !== "resource" || parts.length < 3) {
        return Response.json({ message: "not found" }, { status: 404 });
      }
      const doctype = decodeURIComponent(parts[1]);
      const name = decodeURIComponent(parts.slice(2).join("/"));
      const data = masters.get(`${doctype}:${name}`);
      if (!data || data.disabled === true || data.disabled === 1) {
        return Response.json({ message: "not found" }, { status: 404 });
      }
      return Response.json({ data });
    },
  };
}

async function validateItem(payload, {
  action = "create",
  name = String(payload.item_code ?? "ITEM"),
  masters = {},
} = {}) {
  const request = new Request("https://alumdoor.test/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "alu",
      "x-cloudforge-callback": "https://platform.test/",
    },
    body: JSON.stringify({ doctype: "Item", name, action, payload }),
  });
  return worker.fetch(
    request,
    { PLATFORM: platformFetcher(masters) },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

const leafGroup = { "Item Group:Nguyên vật liệu": { item_group_name: "Nguyên vật liệu", is_group: 0 } };

function validRawItem() {
  return {
    item_code: "RAW",
    item_group: "Nguyên vật liệu",
    item_nature: "Hàng tồn kho",
    material_stage: "Nguyên vật liệu",
    supply_type: "Mua ngoài",
    is_stock_item: 1,
    is_purchase_item: 1,
    include_item_in_manufacturing: 1,
    inventory_mode: "Hàng thường",
    stock_uom: "Kg",
    default_purchase_uom: "Kg",
  };
}

async function message(response) {
  return String((await response.json()).message ?? "");
}

test("Item validator accepts a valid raw material", async () => {
  const response = await validateItem(validRawItem(), { masters: leafGroup });
  assert.equal(response.status, 200, await message(response));
});

test("Item validator rejects service stock configuration", async () => {
  const response = await validateItem({
    item_code: "SERVICE",
    item_group: "Nguyên vật liệu",
    item_nature: "Dịch vụ",
    is_stock_item: 1,
    inventory_mode: "Hàng thường",
  }, { masters: leafGroup });
  assert.equal(response.status, 422);
  assert.match(await message(response), /dịch vụ không được bật Quản lý tồn kho/i);
});

test("Item validator requires an active Measurement Profile for dimensioned stock", async () => {
  const response = await validateItem({
    ...validRawItem(),
    inventory_mode: "Nhôm cây/lá",
    measurement_profile: "Nhôm cây/lá",
  }, { masters: leafGroup });
  assert.equal(response.status, 422);
  assert.match(await message(response), /Bộ quy cách Nhôm cây\/lá không tồn tại/i);
});

test("Item validator rejects missing transaction UOM conversion", async () => {
  const response = await validateItem({
    ...validRawItem(),
    default_purchase_uom: "Cây",
    uom_conversions: [],
  }, { masters: leafGroup });
  assert.equal(response.status, 422);
  assert.match(await message(response), /chưa có hệ số quy đổi/i);
});

test("Item validator rejects a disabled Item Group", async () => {
  const response = await validateItem(validRawItem(), {
    masters: { "Item Group:Nguyên vật liệu": { item_group_name: "Nguyên vật liệu", is_group: 0, disabled: 1 } },
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /không tồn tại hoặc đã ngừng dùng/i);
});

test("Item validator merges partial saves with the current Item before validation", async () => {
  const current = validRawItem();
  const response = await validateItem({ inventory_mode: "Nhôm cây/lá" }, {
    action: "save",
    name: "RAW",
    masters: {
      ...leafGroup,
      "Item:RAW": current,
    },
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /phải có Bộ quy cách/i);
});
