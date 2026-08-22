import assert from "node:assert/strict";
import test from "node:test";

import { previewChildRow } from "../dist/apps-src/alumdoor-worker/src/ui-child-preview.js";

const response = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});

test("Sales Order Item treats measurement_profile area as canonical and preserves the dealer PB field", async () => {
  const item = {
    item_code: "ITEM-AREA",
    item_name: "Cửa diện tích",
    item_group: "Cửa kiểm thử",
    measurement_profile: "Thành phẩm theo m2",
    stock_uom: "Bộ",
    default_sales_uom: "m2",
    is_sales_item: 1,
    disabled: 0,
    uom_conversions: [{ uom: "m2", conversion_factor: 1 }],
  };
  const call = async (path) => {
    if (path === "resource/Item/ITEM-AREA") return response({ data: item });
    if (path.startsWith("resource/")) return response({ data: [] });
    return response({ message: `unexpected ${path}` }, 404);
  };

  const result = await previewChildRow(call, {
    child_doctype: "Sales Order Item",
    child_fields: [
      "item_code", "item_name", "inventory_mode", "measurement_profile", "stock_uom", "uom",
      "width_pb_ray_m", "width_pb_nhua_m", "width_m", "height_m", "set_count", "qty", "stock_qty",
      "conversion_factor", "amount", "discount_amount", "color", "door_type",
    ],
    row: {
      item_code: "ITEM-AREA",
      uom: "m2",
      width_pb_ray_m: 1.8,
      width_pb_nhua_m: 2.2,
      height_m: 2,
      set_count: 1,
    },
    parent: { customer_group: "Đại lý" },
    changed_field: "width_pb_nhua_m",
  });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.patch.inventory_mode, "Thành phẩm theo m2");
  assert.equal(body.patch.width_m, 2.2);
  assert.equal(body.patch.qty, 4.4);
  assert.equal(body.field_overrides.width_pb_nhua_m.hidden, 0);
  assert.equal(body.field_overrides.width_pb_nhua_m.reqd, 1);
  assert.equal(body.field_overrides.width_pb_ray_m.hidden, 1);
  assert.equal(body.field_overrides.height_m.label, "Cao PB\n(m)");
  assert.equal(body.patch.width_pb_ray_m, undefined);
  assert.equal(body.patch.width_pb_nhua_m, undefined);
});

test("legacy width_m migrates once into the active dealer PB field before repricing", async () => {
  const item = {
    item_code: "ITEM-AREA-LEGACY",
    item_name: "Cửa diện tích cũ",
    item_group: "Cửa kiểm thử",
    measurement_profile: "Thành phẩm theo m2",
    stock_uom: "Bộ",
    default_sales_uom: "m2",
    is_sales_item: 1,
    disabled: 0,
    uom_conversions: [{ uom: "m2", conversion_factor: 1 }],
  };
  const call = async (path) => {
    if (path === "resource/Item/ITEM-AREA-LEGACY") return response({ data: item });
    if (path.startsWith("resource/")) return response({ data: [] });
    return response({ message: `unexpected ${path}` }, 404);
  };

  const result = await previewChildRow(call, {
    child_doctype: "Sales Order Item",
    child_fields: [
      "item_code", "item_name", "inventory_mode", "measurement_profile", "stock_uom", "uom",
      "width_pb_ray_m", "width_pb_nhua_m", "width_m", "height_m", "set_count", "qty", "stock_qty",
      "conversion_factor", "amount", "discount_amount", "color", "door_type",
    ],
    row: {
      item_code: "ITEM-AREA-LEGACY",
      uom: "m2",
      width_m: 2.2,
      height_m: 2,
      set_count: 1,
    },
    parent: { customer_group: "Đại lý" },
    changed_field: "parent_context",
  });

  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.patch.width_pb_nhua_m, 2.2);
  assert.equal(body.patch.width_m, 2.2);
  assert.equal(body.patch.qty, 4.4);
});

test("Dai Loan sales rows use PB ray for dealers and expose optional mesh height", async () => {
  const item = {
    item_code: "TP-CUADL8D-TRONBO",
    item_name: "CỬA ĐÀI LOAN 8D TRỌN BỘ",
    item_group: "Cửa Đài Loan",
    door_type: "Cửa Đài Loan",
    measurement_profile: "Thành phẩm theo m2",
    stock_uom: "Bộ",
    default_sales_uom: "m2",
    is_sales_item: 1,
    disabled: 0,
    uom_conversions: [{ uom: "m2", conversion_factor: 1 }],
  };
  const call = async (path) => {
    if (path === "resource/Item/TP-CUADL8D-TRONBO") return response({ data: item });
    if (path.startsWith("resource/")) return response({ data: [] });
    return response({ message: `unexpected ${path}` }, 404);
  };

  const result = await previewChildRow(call, {
    child_doctype: "Sales Order Item",
    child_fields: [
      "item_code", "item_name", "inventory_mode", "measurement_profile", "stock_uom", "uom",
      "width_pb_ray_m", "width_pb_nhua_m", "width_m", "height_m", "mesh_height_m", "set_count",
      "qty", "stock_qty", "conversion_factor", "amount", "color", "door_type",
    ],
    row: {
      item_code: "TP-CUADL8D-TRONBO",
      uom: "m2",
      width_pb_ray_m: 3,
      width_pb_nhua_m: 9,
      height_m: 2,
      mesh_height_m: 1.9,
      set_count: 1,
    },
    parent: { customer_group: "Đại lý" },
    changed_field: "width_pb_ray_m",
  });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.patch.width_m, 3);
  assert.equal(body.field_overrides.width_pb_ray_m.hidden, 0);
  assert.equal(body.field_overrides.width_pb_ray_m.reqd, 1);
  assert.equal(body.field_overrides.width_pb_ray_m.read_only, 0);
  assert.equal(body.field_overrides.width_pb_nhua_m.hidden, 1);
  assert.equal(body.field_overrides.width_pb_nhua_m.read_only, 1);
  assert.equal(body.field_overrides.mesh_height_m.hidden, 0);
  assert.equal(body.field_overrides.mesh_height_m.reqd, 0);
  assert.equal(body.field_overrides.mesh_height_m.label, "Cao lưới\n(m)");
});

test("ordinary Sales Order Item mirrors set count into priced quantity", async () => {
  const item = {
    item_code: "MOTOR-TEST",
    item_name: "Motor kiểm thử",
    item_group: "Phụ kiện",
    inventory_mode: "Hàng thường",
    stock_uom: "Cái",
    default_sales_uom: "Cái",
    is_sales_item: 1,
    disabled: 0,
    uom_conversions: [{ uom: "Cái", conversion_factor: 1 }],
  };
  const call = async (path) => {
    if (path === "resource/Item/MOTOR-TEST") return response({ data: item });
    if (path === "resource/Item%20Price/ALUMDOOR-SELLING%3AMOTOR-TEST%3AC%C3%A1i") return response({ data: {
      item_code: "MOTOR-TEST", price_list: "ALUMDOOR-SELLING", uom: "Cái", currency: "VND", rate: 2_700_000,
    } });
    if (path.startsWith("resource/Item%20Price/")) return response({ message: "not found" }, 404);
    if (path.startsWith("resource/")) return response({ data: [] });
    return response({ message: `unexpected ${path}` }, 404);
  };

  const result = await previewChildRow(call, {
    child_doctype: "Sales Order Item",
    child_fields: [
      "item_code", "item_name", "inventory_mode", "stock_uom", "uom", "set_count", "qty",
      "stock_qty", "conversion_factor", "rate", "standard_rate", "amount", "standard_amount",
      "discount_percentage", "discount_amount",
    ],
    row: {
      item_code: "MOTOR-TEST",
      uom: "Cái",
      set_count: 2,
      qty: 1,
      rate: 2_700_000,
      discount_percentage: 0,
    },
    parent: { customer_group: "Lẻ", selling_price_list: "ALUMDOOR-SELLING", currency: "VND" },
    changed_field: "set_count",
  });

  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.patch.qty, 2);
  assert.equal(body.patch.amount, 5_400_000);
});

test("legacy ordinary Item without inventory_mode still keeps SL, priced quantity and amount together", async () => {
  const item = {
    item_code: "LEGACY-PIECE",
    item_name: "Phụ kiện cũ",
    item_group: "Phụ kiện",
    stock_uom: "Cái",
    default_sales_uom: "Cái",
    is_sales_item: 1,
    disabled: 0,
    uom_conversions: [{ uom: "Cái", conversion_factor: 1 }],
  };
  const call = async (path) => {
    if (path === "resource/Item/LEGACY-PIECE") return response({ data: item });
    if (path === "resource/Item%20Price/ALUMDOOR-SELLING%3ALEGACY-PIECE%3AC%C3%A1i") return response({ data: {
      item_code: "LEGACY-PIECE", price_list: "ALUMDOOR-SELLING", uom: "Cái", currency: "VND", rate: 2_700_000,
    } });
    if (path.startsWith("resource/Item%20Price/")) return response({ message: "not found" }, 404);
    if (path.startsWith("resource/")) return response({ data: [] });
    return response({ message: `unexpected ${path}` }, 404);
  };

  const result = await previewChildRow(call, {
    child_doctype: "Sales Order Item",
    child_fields: [
      "item_code", "item_name", "inventory_mode", "stock_uom", "uom", "set_count", "qty",
      "stock_qty", "conversion_factor", "rate", "standard_rate", "amount", "standard_amount",
      "discount_percentage", "discount_amount",
    ],
    row: {
      item_code: "LEGACY-PIECE",
      uom: "Cái",
      set_count: 2,
      qty: 1,
      rate: 2_700_000,
      discount_percentage: 0,
    },
    parent: { customer_group: "Lẻ", selling_price_list: "ALUMDOOR-SELLING", currency: "VND" },
    changed_field: "set_count",
  });

  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.patch.inventory_mode, "Hàng thường");
  assert.equal(body.patch.qty, 2);
  assert.equal(body.patch.stock_qty, 2);
  assert.equal(body.patch.amount, 5_400_000);
});
