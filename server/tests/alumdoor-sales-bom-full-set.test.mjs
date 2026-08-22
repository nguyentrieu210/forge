import assert from "node:assert/strict";
import test from "node:test";

import {
  isFullSetSalesItemCode,
  previewDraftSalesBomRequirements,
} from "../dist/apps-src/alumdoor-worker/src/sales-production.js";

const response = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});

const preview = (call, args) => previewDraftSalesBomRequirements(
  (path, init) => path.startsWith("resource/BOM%20Rule?") ? response({ data: [] }) : call(path, init),
  args,
);

test("Sales BOM is eligible only for an Item code marked TRONBO", () => {
  assert.equal(isFullSetSalesItemCode("TP-CUADL1LY XN-VK_TRONBO_4-5m²"), true);
  assert.equal(isFullSetSalesItemCode("TP-LUOI-MV-STD - TRỌN BỘ"), true);
  assert.equal(isFullSetSalesItemCode("TP-TD-AL595 THÔ"), false);
  assert.equal(isFullSetSalesItemCode("TP-CUADL1LY"), false);
});

test("non-full-set sales Item returns a clean not-applicable preview without reading BOMs", async () => {
  const call = async (path) => {
    if (path === "resource/Item/TP-TD-AL595%20TH%C3%94") {
      return response({ data: {
        item_code: "TP-TD-AL595 THÔ",
        item_group: "Cửa CN Đức",
        measurement_profile: "Thành phẩm theo m2",
      } });
    }
    throw new Error(`unexpected BOM read: ${path}`);
  };

  const result = await preview(call, {
    item_code: "TP-TD-AL595 THÔ",
    customer_group: "Đại lý",
    width_m: 4,
    height_m: 2,
  });
  assert.equal(result.status, 200, await result.clone().text());
  const body = await result.json();
  assert.equal(body.bom_applicable, false);
  assert.deepEqual(body.components, []);
  assert.match(body.reason, /TRỌN BỘ/);
});

test("full-set static BOM derives child sales fields from the parent and ignores production quantity/UOM", async () => {
  const call = async (path) => {
    if (path === "resource/Item/TP-DOOR-TRONBO") return response({ data: {
      item_code: "TP-DOOR-TRONBO",
      item_group: "Cửa kiểm thử",
      measurement_profile: "Thành phẩm theo m2",
      stock_uom: "Bộ",
    } });
    if (path.startsWith("resource/Bill%20of%20Materials?")) return response({ data: [{
      name: "BOM-TEST",
      item: "TP-DOOR-TRONBO",
      is_active: 1,
    }] });
    if (path === "resource/Bill%20of%20Materials/BOM-TEST") return response({ data: {
      name: "BOM-TEST",
      items: [{ item_code: "COMP-AREA", stock_uom: "Kg", qty: 5 }],
    } });
    if (path === "resource/Item/COMP-AREA") return response({ data: {
      item_code: "COMP-AREA",
      inventory_mode: "Thành phẩm theo m2",
      stock_uom: "Kg",
      default_sales_uom: "m2",
      uom_conversions: [{ uom: "m2", conversion_factor: 2 }],
    } });
    throw new Error(`unexpected ${path}`);
  };

  const result = await preview(call, {
    item_code: "TP-DOOR-TRONBO",
    customer_group: "Đại lý",
    width_pb_nhua_m: 3,
    width_m: 3,
    height_m: 2,
    set_count: 2,
  });
  assert.equal(result.status, 200, await result.clone().text());
  const body = await result.json();
  assert.equal(body.static_bom, true);
  assert.equal(body.components.length, 1);
  assert.equal(body.components[0].set_count, 2);
  assert.equal(body.components[0].uom, "m2");
  assert.equal(body.components[0].qty, 12);
  assert.equal("production_qty" in body.components[0], false);
  assert.equal("production_uom" in body.components[0], false);
  assert.equal("stock_qty" in body.components[0], false);
  assert.equal(body.components[0].width_pb_nhua_m, 3);
  assert.equal(body.components[0].width_m, 3);
  assert.equal(body.components[0].height_m, 2);
});

test("full-set static BOM returns its composition before dimensions are entered", async () => {
  const call = async (path) => {
    if (path === "resource/Item/TP-DOOR-TRONBO") return response({ data: {
      item_code: "TP-DOOR-TRONBO",
      item_group: "Cửa Đài Loan",
      door_type: "Cửa Đài Loan",
      measurement_profile: "Thành phẩm theo m2",
      stock_uom: "Bộ",
    } });
    if (path.startsWith("resource/Bill%20of%20Materials?")) return response({ data: [{
      name: "BOM-IMMEDIATE",
      item: "TP-DOOR-TRONBO",
      is_active: 1,
    }] });
    if (path === "resource/Bill%20of%20Materials/BOM-IMMEDIATE") return response({ data: {
      name: "BOM-IMMEDIATE",
      items: [{ item_code: "COMP-RAY" }],
    } });
    if (path === "resource/Item/COMP-RAY") return response({ data: {
      item_code: "COMP-RAY",
      item_name: "RAY SẮT U70",
      item_group: "Ray và trục",
      default_sales_uom: "Mét",
    } });
    throw new Error(`unexpected ${path}`);
  };

  const result = await preview(call, {
    item_code: "TP-DOOR-TRONBO",
  });
  assert.equal(result.status, 200, await result.clone().text());
  const body = await result.json();
  assert.equal(body.static_bom, true);
  assert.equal(body.bom_no, "BOM-IMMEDIATE");
  assert.deepEqual(body.pending_fields ?? [], []);
  assert.equal(body.components.length, 1);
  assert.equal(body.components[0].item_code, "COMP-RAY");
  assert.equal(body.components[0].qty, null);
});

test("full-set child rows use parent sets and geometry with each child Item sales UOM", async () => {
  const call = async (path) => {
    if (path === "resource/Item/TP-DOOR-TRONBO") return response({ data: {
      item_code: "TP-DOOR-TRONBO",
      item_group: "Cửa kiểm thử",
      measurement_profile: "Thành phẩm theo m2",
      stock_uom: "Bộ",
    } });
    if (path.startsWith("resource/Bill%20of%20Materials?")) return response({ data: [{
      name: "BOM-COMPOSITION",
      item: "TP-DOOR-TRONBO",
      is_active: 1,
    }] });
    if (path === "resource/Bill%20of%20Materials/BOM-COMPOSITION") return response({ data: {
      name: "BOM-COMPOSITION",
      items: [
        { item_code: "COMP-RAY", stock_uom: "Kg", qty: 99 },
        { item_code: "COMP-SHAFT", stock_uom: "Kg", qty: 88 },
        { item_code: "COMP-PIECE", stock_uom: "Kg", qty: 77 },
      ],
    } });
    if (path === "resource/Item/COMP-RAY") return response({ data: {
      item_code: "COMP-RAY",
      item_name: "RAY SẮT U70",
      inventory_mode: "Hàng thường",
      stock_uom: "Kg",
      default_sales_uom: "Mét",
    } });
    if (path === "resource/Item/COMP-SHAFT") return response({ data: {
      item_code: "COMP-SHAFT",
      item_name: "TRỤC 114",
      inventory_mode: "Hàng thường",
      stock_uom: "Kg",
      default_sales_uom: "Mét",
    } });
    if (path === "resource/Item/COMP-PIECE") return response({ data: {
      item_code: "COMP-PIECE",
      item_name: "Phụ kiện",
      inventory_mode: "Hàng thường",
      stock_uom: "Kg",
      default_sales_uom: "Cái",
    } });
    throw new Error(`unexpected ${path}`);
  };

  const result = await preview(call, {
    item_code: "TP-DOOR-TRONBO",
    customer_group: "Đại lý",
    width_pb_nhua_m: 3,
    width_m: 3,
    height_m: 2,
    cut_width_m: 2.97,
    set_count: 2,
  });
  assert.equal(result.status, 200, await result.clone().text());
  const body = await result.json();
  assert.deepEqual(body.components.map((row) => ({
    item_code: row.item_code,
    set_count: row.set_count,
    uom: row.uom,
    qty: row.qty,
    length_m: row.length_m,
    height_m: row.height_m,
  })), [
    { item_code: "COMP-RAY", set_count: 2, uom: "Mét", qty: 4, length_m: 2, height_m: 2 },
    { item_code: "COMP-SHAFT", set_count: 2, uom: "Mét", qty: 6, length_m: 3, height_m: 2 },
    { item_code: "COMP-PIECE", set_count: 2, uom: "Cái", qty: 2, length_m: undefined, height_m: 2 },
  ]);
});

/**
 * Trước đây dòng ĐẦU TIÊN thuộc nhóm "Nan/lá cửa" bị giấu đi, coi là bán thành phẩm không bán rời.
 * Đem ra dữ liệu thật thì luật đó phản tác dụng: cả 4 BOM có lá đều để lá ở dòng đầu nên mất lá
 * 4/4, và BOM lá bán rời `DM-2026-0092` chỉ có đúng dòng lá nên xổ ra rỗng. Lá là vật tư chính
 * của bộ cửa, phải thấy. Giấu hay hiện cũng không đụng tiền: giá nằm ở mặt hàng cha, các dòng này
 * chỉ để xem vật tư/sản xuất.
 */
test("sales composition keeps the TP LA leaf — it is the door's main material", async () => {
  const call = async (path) => {
    if (path === "resource/Item/TP-DOOR-TRONBO") return response({ data: {
      item_code: "TP-DOOR-TRONBO",
      item_group: "Cửa cuốn Đài Loan",
      measurement_profile: "Thành phẩm theo m2",
    } });
    if (path.startsWith("resource/Bill%20of%20Materials?")) return response({ data: [{
      name: "BOM-WITH-INTERMEDIATE-LEAF",
      item: "TP-DOOR-TRONBO",
      is_active: 1,
    }] });
    if (path === "resource/Bill%20of%20Materials/BOM-WITH-INTERMEDIATE-LEAF") return response({ data: {
      name: "BOM-WITH-INTERMEDIATE-LEAF",
      items: [
        { item_code: "NVL-LEAF" },
        { item_code: "NVL-RAY" },
      ],
    } });
    if (path === "resource/Item/NVL-LEAF") return response({ data: {
      item_code: "NVL-LEAF",
      item_name: "TP LÁ ĐÀI LOAN 8D_XN-VK",
      item_group: "Nan/lá cửa",
      default_sales_uom: "Kg",
    } });
    if (path === "resource/Item/NVL-RAY") return response({ data: {
      item_code: "NVL-RAY",
      item_name: "RAY SẮT U70 (CÓ RON)",
      item_group: "Vật tư cửa",
      default_sales_uom: "Mét",
    } });
    throw new Error(`unexpected ${path}`);
  };

  const result = await preview(call, {
    item_code: "TP-DOOR-TRONBO",
    customer_group: "Đại lý",
    width_pb_nhua_m: 3,
    width_m: 3,
    height_m: 2,
  });
  assert.equal(result.status, 200, await result.clone().text());
  const body = await result.json();
  assert.deepEqual(body.components.map((row) => row.item_code), ["NVL-LEAF", "NVL-RAY"]);
  assert.equal(body.components[1].qty, 2);
});

test("legacy full-set rows project normalized width into the correct customer PB field", async () => {
  const call = async (path) => {
    if (path === "resource/Item/TP-DOOR-TRONBO") return response({ data: {
      item_code: "TP-DOOR-TRONBO",
      measurement_profile: "Thành phẩm theo m2",
      stock_uom: "Bộ",
    } });
    if (path.startsWith("resource/Bill%20of%20Materials?")) return response({ data: [{ name: "BOM-LEGACY", item: "TP-DOOR-TRONBO", is_active: 1 }] });
    if (path === "resource/Bill%20of%20Materials/BOM-LEGACY") return response({ data: { items: [{ item_code: "COMP" }] } });
    if (path === "resource/Item/COMP") return response({ data: { item_code: "COMP", default_sales_uom: "Cái" } });
    throw new Error(`unexpected ${path}`);
  };

  const result = await preview(call, {
    item_code: "TP-DOOR-TRONBO",
    customer_group: "Đại lý",
    width_m: 3,
    height_m: 2,
    set_count: 1,
  });
  assert.equal(result.status, 200, await result.clone().text());
  const body = await result.json();
  assert.equal(body.components[0].width_pb_nhua_m, 3);
  assert.equal("width_pb_ray_m" in body.components[0], false);
});

test("full-set preview prefers the BOM whose Item code matches exactly over a normalized legacy alias", async () => {
  const itemCode = "TP-CUADL1LY XN-VK_TRONBO_3-4m²";
  let requestedFields = [];
  const call = async (path) => {
    if (path === `resource/Item/${encodeURIComponent(itemCode)}`) return response({ data: {
      item_code: itemCode,
      item_group: "Cửa tấm liền Úc",
      measurement_profile: "Thành phẩm theo m2",
      stock_uom: "m2",
    } });
    if (path.startsWith("resource/Bill%20of%20Materials?")) {
      const url = new URL(path, "http://local.test/");
      requestedFields = JSON.parse(url.searchParams.get("fields"));
      return response({ data: [
        {
          name: "DM-LEGACY",
          item: "TP-CUADL1LY-XN-VK_TRONBO_3-4M",
          docstatus: 0,
          bom_status: "Draft",
          is_active: 1,
        },
        {
          name: "DM-EXACT",
          item: itemCode,
          docstatus: 0,
          bom_status: "Draft",
          is_active: 1,
        },
      ] });
    }
    if (path === "resource/Bill%20of%20Materials/DM-EXACT") return response({ data: {
      name: "DM-EXACT",
      items: [{ item_code: "NVL-EXACT", stock_uom: "Mét", qty: 2 }],
    } });
    if (path === "resource/Item/NVL-EXACT") return response({ data: {
      item_code: "NVL-EXACT",
      stock_uom: "Mét",
      default_sales_uom: "Mét",
    } });
    throw new Error(`unexpected ${path}`);
  };

  const result = await preview(call, {
    item_code: itemCode,
    customer_group: "Đại lý",
    color: "XANH NGỌC - VÀNG KEM",
    width_pb_nhua_m: 3,
    width_m: 3,
    height_m: 1.2,
  });

  assert.equal(result.status, 200, await result.clone().text());
  const body = await result.json();
  assert.equal(body.bom_no, "DM-EXACT");
  assert.equal(body.components[0].item_code, "NVL-EXACT");
  for (const field of ["name", "item", "color", "docstatus", "is_active", "generated_by_configurator"]) {
    assert.ok(requestedFields.includes(field), `BOM list must request ${field}`);
  }
  for (const field of ["bom_status", "revision", "effective_from", "effective_to"]) {
    assert.equal(requestedFields.includes(field), false, `BOM list must hydrate payload-only field ${field}`);
  }
});
