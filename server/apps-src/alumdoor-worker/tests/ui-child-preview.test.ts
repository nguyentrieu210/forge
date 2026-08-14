import { describe, expect, it } from "vitest";
import { previewChildRow } from "../src/ui-child-preview.js";

type Json = Record<string, unknown>;

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function callWith(records: Record<string, Json>) {
  return Object.assign(async (path: string): Promise<Response> => {
    const key = decodeURIComponent(path.split("?")[0] ?? path);
    if (key in records) return response({ data: records[key] });
    if (key === "resource/Item Color") return response({ data: [] });
    if (key.startsWith("resource/Item Group/")) return response({ data: {} });
    return response({}, 404);
  }, { via: "test" });
}

describe("alumdoor.ui.preview_child_row", () => {
  it("hydrates and computes purchase aluminium barem on the server", async () => {
    const call = callWith({
      "resource/Item/AL-01": {
        item_code: "AL-01", item_name: "Nhôm AL-01", is_purchase_item: 1, disabled: 0,
        inventory_mode: "Nhôm cây/lá", stock_uom: "Kg", default_purchase_uom: "Kg",
        material_specification: "SPEC-AL", standard_rate: 50,
      },
      "resource/Material Specification/SPEC-AL": { theoretical_kg_per_m: 1.2 },
    });
    const res = await previewChildRow(call, {
      child_doctype: "Purchase Order Item",
      child_fields: ["item_code", "inventory_mode", "stock_uom", "uom", "conversion_factor", "length_m", "qty_bar", "theoretical_kg_per_m", "theoretical_kg", "qty", "rate", "amount", "stock_qty"],
      row: { item_code: "AL-01", length_m: 6, qty_bar: 10 },
      parent: { currency: "VND" },
      changed_field: "item_code",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { patch: Json };
    expect(body.patch.inventory_mode).toBe("Nhôm cây/lá");
    expect(body.patch.uom).toBe("Kg");
    expect(body.patch.conversion_factor).toBe(1);
    expect(body.patch.theoretical_kg_per_m).toBe(1.2);
    expect(body.patch.theoretical_kg).toBe(72);
    expect(body.patch.qty).toBe(72);
    expect(body.patch.rate).toBe(50);
    expect(body.patch.amount).toBe(3600);
    expect(body.patch.stock_qty).toBe(72);
  });

  it("hydrates an ordinary sales line, uses Item Price, and derives quantity from set count", async () => {
    const call = callWith({
      "resource/Item/MOTOR-01": {
        item_code: "MOTOR-01", item_name: "Motor", item_group: "Motor", is_sales_item: 1, disabled: 0,
        inventory_mode: "Hàng thường", stock_uom: "Cái", default_sales_uom: "Cái", uom_conversions: [],
      },
      "resource/Item Price/Bán lẻ:MOTOR-01": {
        name: "Bán lẻ:MOTOR-01", price_list: "Bán lẻ", item_code: "MOTOR-01", uom: "Cái", rate: 100000, currency: "VND", disabled: 0,
      },
    });
    const res = await previewChildRow(call, {
      child_doctype: "Sales Order Item",
      child_fields: ["item_code", "item_name", "inventory_mode", "stock_uom", "uom", "conversion_factor", "set_count", "qty", "rate", "standard_rate", "rate_requires_approval", "discount_percentage", "amount", "stock_qty"],
      row: { item_code: "MOTOR-01", set_count: 2 },
      parent: { selling_price_list: "Bán lẻ", currency: "VND" },
      changed_field: "item_code",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { patch: Json; clear: string[]; field_overrides: Record<string, Json> };
    expect(body.patch.uom).toBe("Cái");
    expect(body.patch.qty).toBe(2);
    expect(body.patch.rate).toBe(100000);
    expect(body.patch.standard_rate).toBe(100000);
    expect(body.patch.discount_percentage).toBeUndefined();
    expect(body.clear).toContain("discount_percentage");
    expect(body.patch.amount).toBe(200000);
    expect(body.patch.stock_qty).toBe(2);
    expect(body.field_overrides.set_count?.reqd).toBe(1);
    expect(body.field_overrides.set_count?.label).toBe("Số cái");
    expect(body.field_overrides.qty?.read_only).toBe(1);
    expect(body.field_overrides.qty?.label).toBe("SL tính giá");
  });

  it("replaces a stale sales UOM with the Item default before autofill", async () => {
    const call = callWith({
      "resource/Item/TP-TD327": {
        item_code: "TP-TD327", item_name: "LÁ YẾM", item_group: "Nan/lá cửa", is_sales_item: 1, disabled: 0,
        inventory_mode: "Nhôm cây/lá", stock_uom: "Kg", default_sales_uom: "Mét",
        uom_conversions: [{ uom: "Mét", conversion_factor: 0.153 }],
      },
    });
    const res = await previewChildRow(call, {
      child_doctype: "Sales Order Item",
      child_fields: ["item_code", "inventory_mode", "stock_uom", "uom", "conversion_factor"],
      // "Cái" belongs to the previous row/item and is not configured on TP-TD327.
      row: { item_code: "TP-TD327", uom: "Cái" },
      parent: { currency: "VND" },
      changed_field: "item_code",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { patch: Json };
    expect(body.patch.uom).toBe("Mét");
    expect(body.patch.conversion_factor).toBe(0.153);
  });

  it("keeps German discount authoritative while exposing the physical set quantity", async () => {
    const call = callWith({
      "resource/Item/DUC-01": {
        item_code: "DUC-01", item_name: "Đức 01", item_group: "Cửa CN Đức", door_type: "Cửa Đức",
        is_sales_item: 1, disabled: 0, inventory_mode: "Thành phẩm theo m2", stock_uom: "Bộ",
        default_sales_uom: "m2", uom_conversions: [],
      },
      "resource/Item Price/Bán lẻ:DUC-01": {
        name: "Bán lẻ:DUC-01", price_list: "Bán lẻ", item_code: "DUC-01", uom: "m2", rate: 1626000, currency: "VND", disabled: 0,
      },
    });
    const res = await previewChildRow(call, {
      child_doctype: "Sales Order Item",
      child_fields: ["item_code", "door_type", "inventory_mode", "stock_uom", "uom", "rate", "standard_rate", "discount_percentage", "set_count", "qty", "amount"],
      row: { item_code: "DUC-01", set_count: 1 },
      parent: { selling_price_list: "Bán lẻ", currency: "VND", customer_group: "Lẻ" },
      changed_field: "item_code",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { patch: Json; clear: string[]; field_overrides: Record<string, Json> };
    expect(body.patch.door_type).toBe("Cửa Đức");
    expect(body.patch.discount_percentage).toBeUndefined();
    expect(body.clear).toContain("discount_percentage");
    expect(body.patch.rate).toBe(1626000);
    expect(body.field_overrides.set_count?.label).toBe("Số bộ");
    expect(body.field_overrides.qty?.label).toBe("SL tính giá");
  });
});
