import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/apps-src/alumdoor-worker/src/entry.js";

function platformFetcher(records = {}) {
  const masters = new Map(Object.entries(records));
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const parts = url.pathname.replace(/^\/+/, "").split("/");
      if (parts[0] !== "resource" || parts.length < 3) return Response.json({ message: "not found" }, { status: 404 });
      const doctype = decodeURIComponent(parts[1]);
      const name = decodeURIComponent(parts.slice(2).join("/"));
      const data = masters.get(`${doctype}:${name}`);
      if (!data || data.disabled === true || data.disabled === 1) return Response.json({ message: "not found" }, { status: 404 });
      return Response.json({ data });
    },
  };
}

const masters = {
  "Item Group:Nguyên vật liệu": { item_group_name: "Nguyên vật liệu", is_group: 0 },
  "UOM:Cây": { uom_name: "Cây", disabled: 0 },
  "UOM:Kg": { uom_name: "Kg", disabled: 0 },
  "Measurement Profile:Nhôm cây/lá": {
    profile_name: "Nhôm cây/lá",
    inventory_mode: "Nhôm cây/lá",
    stock_uom: "Cây",
    track_dimension_lot: 1,
    require_color: 1,
    require_condition: 1,
    require_length: 1,
    require_piece_qty: 1,
  },
};

function canonicalItem(overrides = {}) {
  return {
    item_code: "AL71",
    item_name: "Nhôm AL71",
    item_group: "Nguyên vật liệu",
    item_nature: "Hàng tồn kho",
    material_stage: "Nguyên vật liệu",
    supply_type: "Mua ngoài",
    is_stock_item: 1,
    is_purchase_item: 1,
    include_item_in_manufacturing: 1,
    inventory_mode: "Nhôm cây/lá",
    measurement_profile: "Nhôm cây/lá",
    stock_uom: "Cây",
    default_purchase_uom: "Kg",
    has_batch_no: 1,
    has_catch_weight: 1,
    weight_uom: "Kg",
    purchase_stock_qty_field: "qty_bar",
    purchase_allocation_qty_field: "qty_bar",
    purchase_allocation_uom: "Cây",
    allow_negative_stock: 0,
    uom_conversions: [],
    ...overrides,
  };
}

async function validate(payload, records = masters) {
  const request = new Request("https://alumdoor.test/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "alu",
      "x-cloudforge-callback": "https://platform.test/",
    },
    body: JSON.stringify({ doctype: "Item", name: payload.item_code, action: "create", payload }),
  });
  return worker.fetch(request, { PLATFORM: platformFetcher(records) }, { waitUntil() {}, passThroughOnException() {} });
}

async function message(response) {
  const payload = await response.clone().json().catch(() => ({}));
  return String(payload.message ?? "");
}

test("canonical catch-weight aluminum may buy in Kg without a static Kg-to-piece conversion", async () => {
  const response = await validate(canonicalItem());
  assert.equal(response.status, 200, await message(response));
  const payload = await response.json();
  assert.equal(payload.aluminum_contract, true);
  assert.equal(payload.stock_uom, "Cây");
});

test("canonical override never bypasses earlier Measurement Profile validation", async () => {
  const response = await validate(canonicalItem(), {
    "Item Group:Nguyên vật liệu": masters["Item Group:Nguyên vật liệu"],
    "UOM:Cây": masters["UOM:Cây"],
    "UOM:Kg": masters["UOM:Kg"],
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /Bộ quy cách Nhôm cây\/lá không tồn tại/i);
});

test("static Kg-to-piece conversion is rejected even when the historical validator would accept it", async () => {
  const response = await validate(canonicalItem({
    uom_conversions: [{ row_id: "KG", uom: "Kg", conversion_factor: 1 }],
  }));
  assert.equal(response.status, 422);
  assert.match(await message(response), /không được khai hệ số quy đổi Kg↔Cây tĩnh/i);
});

test("canonical override never bypasses invalid Item Group", async () => {
  const response = await validate(canonicalItem(), {
    ...masters,
    "Item Group:Nguyên vật liệu": { item_group_name: "Nguyên vật liệu", is_group: 1 },
  });
  assert.equal(response.status, 422);
  assert.match(await message(response), /là nhóm chứa/i);
});
