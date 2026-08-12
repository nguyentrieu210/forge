import { describe, expect, it } from "vitest";
import { previewChildRow } from "../src/ui-child-preview.js";

type Json = Record<string, unknown>;

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function callWith(records: Record<string, unknown>) {
  return Object.assign(async (path: string, init?: RequestInit): Promise<Response> => {
    const decoded = decodeURIComponent(path.split("?")[0] ?? path);
    if (decoded === "method/metaforge.api.preview_sales_commercial_line") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { line?: Json };
      const line = body.line ?? {};
      const option = String(line.sales_option ?? "");
      if (option === "DUC-CO-RAY") {
        return response({ message: {
          sales_option: option,
          sales_option_code: "CO_RAY",
          sales_option_label: "Có ray",
          price_variant: "WITH_RAIL",
          discount_basis_variant: "STANDARD",
          item_price: "Bán lẻ:DUC-01:m2:WITH_RAIL",
          rate: "1701000",
          base_rate: "1701000",
          discount_percentage: "15",
          discount_amount: "243900",
          adjustment_amount: "0",
          net_amount: "1457100",
          amount: "1457100",
        } });
      }
      if (option === "AU-FULL-SET") {
        return response({ message: {
          sales_option: option,
          sales_option_code: "FULL_SET",
          sales_option_label: "Trọn bộ",
          sales_mode: "Trọn bộ",
          sales_package: "PKG-AU-FULL-SET",
          sales_package_snapshot: "snapshot-au-full-set",
          price_variant: "STANDARD",
          discount_basis_variant: "STANDARD",
          rate: "2000000",
          base_rate: "2000000",
          discount_percentage: "0",
          discount_amount: "0",
          adjustment_amount: "125000",
          net_amount: "2125000",
          amount: "2125000",
        } });
      }
      if (option === "AU-SPLIT") {
        return response({ message: {
          sales_option: option,
          sales_option_code: "SPLIT",
          sales_option_label: "Tách món",
          sales_mode: "Tách món",
          sales_package: null,
          sales_package_snapshot: null,
          price_variant: "STANDARD",
          discount_basis_variant: "STANDARD",
          rate: "2000000",
          base_rate: "2000000",
          discount_percentage: "0",
          discount_amount: "0",
          adjustment_amount: "0",
          net_amount: "2000000",
          amount: "2000000",
        } });
      }
      const qty = Number(line.qty ?? 0);
      const rate = String(line.item_code ?? "") === "MOTOR-01" ? 100000 : 1626000;
      const discount = String(line.item_code ?? "") === "DUC-01" ? 243900 : 0;
      return response({ message: {
        ...(String(line.item_code ?? "") === "DUC-01" ? {
          sales_option: option || "DUC-KHONG-RAY",
          sales_option_code: "KHONG_RAY",
          sales_option_label: "Không ray",
          price_variant: "STANDARD",
          discount_basis_variant: "STANDARD",
        } : {}),
        rate: String(rate),
        base_rate: String(rate),
        discount_percentage: discount ? "15" : "0",
        discount_amount: String(discount),
        adjustment_amount: "0",
        net_amount: String(rate * qty - discount),
        amount: String(rate * qty - discount),
      } });
    }
    const key = decoded;
    if (key in records) return response({ data: records[key] });
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

  it("uses canonical commercial preview for line money instead of client discount math", async () => {
    const call = callWith({
      "resource/Item/MOTOR-01": {
        item_code: "MOTOR-01", item_name: "Motor", item_group: "Motor", is_sales_item: 1, disabled: 0,
        inventory_mode: "Hàng thường", stock_uom: "Cái", default_sales_uom: "Cái", uom_conversions: [],
      },
      "resource/Item Price/Bán lẻ:MOTOR-01": {
        name: "Bán lẻ:MOTOR-01", price_list: "Bán lẻ", item_code: "MOTOR-01", uom: "Cái", rate: 100000, currency: "VND", disabled: 0,
      },
      "resource/Sales Option": [],
    });
    const res = await previewChildRow(call, {
      child_doctype: "Sales Order Item",
      child_fields: ["item_code", "item_name", "inventory_mode", "stock_uom", "uom", "conversion_factor", "set_count", "qty", "rate", "standard_rate", "rate_requires_approval", "discount_percentage", "discount_amount", "adjustment_amount", "net_amount", "amount", "stock_qty"],
      row: { item_code: "MOTOR-01", set_count: 2 },
      parent: { selling_price_list: "Bán lẻ", currency: "VND" },
      changed_field: "item_code",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { patch: Json; field_overrides: Record<string, Json>; source: string };
    expect(body.patch.qty).toBe(2);
    expect(body.patch.rate).toBe(100000);
    expect(body.patch.discount_amount).toBe(0);
    expect(body.patch.adjustment_amount).toBe(0);
    expect(body.patch.net_amount).toBe(200000);
    expect(body.patch.amount).toBe(200000);
    expect(body.source).toContain("canonical-commercial");
    expect(body.field_overrides.qty?.read_only).toBe(1);
  });

  it("defaults German door to no-rail and prices with-rail against the no-rail discount basis", async () => {
    const call = callWith({
      "resource/Item/DUC-01": {
        item_code: "DUC-01", item_name: "Đức 01", item_group: "Cửa CN Đức", door_type: "Cửa Đức",
        is_sales_item: 1, disabled: 0, inventory_mode: "Hàng thường", stock_uom: "Bộ",
        default_sales_uom: "Bộ", uom_conversions: [],
      },
      "resource/Item Price/Bán lẻ:DUC-01": {
        name: "Bán lẻ:DUC-01", price_list: "Bán lẻ", item_code: "DUC-01", uom: "Bộ", rate: 1626000, currency: "VND", disabled: 0,
      },
      "resource/Sales Option": [
        { name: "DUC-KHONG-RAY", option_code: "KHONG_RAY", option_label: "Không ray", item_code: "DUC-01", item_group: "Cửa CN Đức", price_variant: "STANDARD", discount_basis_variant: "STANDARD", is_default: 1, priority: 100, disabled: 0 },
        { name: "DUC-CO-RAY", option_code: "CO_RAY", option_label: "Có ray", item_code: "DUC-01", item_group: "Cửa CN Đức", price_variant: "WITH_RAIL", discount_basis_variant: "STANDARD", priority: 90, disabled: 0 },
      ],
    });
    const fields = ["item_code", "door_type", "inventory_mode", "stock_uom", "uom", "set_count", "sales_option", "sales_option_code", "sales_option_label", "price_variant", "discount_basis_variant", "rate", "standard_rate", "discount_percentage", "discount_amount", "adjustment_amount", "net_amount", "qty", "amount"];
    const baseArgs = {
      child_doctype: "Sales Order Item",
      child_fields: fields,
      parent: { selling_price_list: "Bán lẻ", currency: "VND", customer_group: "Lẻ" },
    };

    const noRail = await previewChildRow(call, {
      ...baseArgs,
      row: { item_code: "DUC-01", set_count: 1 },
      changed_field: "item_code",
    });
    expect(noRail.status).toBe(200);
    const noRailBody = await noRail.json() as { patch: Json; field_overrides: Record<string, Json> };
    expect(noRailBody.patch.sales_option).toBe("DUC-KHONG-RAY");
    expect(noRailBody.patch.rate).toBe(1626000);
    expect(noRailBody.patch.discount_amount).toBe(243900);
    expect(noRailBody.patch.net_amount).toBe(1382100);
    expect(noRailBody.field_overrides.sales_option?.reqd).toBe(1);

    const withRail = await previewChildRow(call, {
      ...baseArgs,
      row: { item_code: "DUC-01", set_count: 1, sales_option: "DUC-CO-RAY" },
      changed_field: "sales_option",
    });
    expect(withRail.status).toBe(200);
    const withRailBody = await withRail.json() as { patch: Json };
    expect(withRailBody.patch.price_variant).toBe("WITH_RAIL");
    expect(withRailBody.patch.discount_basis_variant).toBe("STANDARD");
    expect(withRailBody.patch.rate).toBe(1701000);
    // 15% is calculated from the no-rail 1,626,000 basis, not from the 1,701,000 selling rate.
    expect(withRailBody.patch.discount_amount).toBe(243900);
    expect(withRailBody.patch.net_amount).toBe(1457100);
  });

  it("keeps Australian full-set/package and split-line semantics server-owned", async () => {
    const call = callWith({
      "resource/Item/AU-01": {
        item_code: "AU-01", item_name: "Úc 01", item_group: "Cửa Úc", door_type: "Cửa Úc",
        is_sales_item: 1, disabled: 0, inventory_mode: "Hàng thường", stock_uom: "Bộ",
        default_sales_uom: "Bộ", uom_conversions: [],
      },
      "resource/Item Price/Bán lẻ:AU-01": {
        name: "Bán lẻ:AU-01", price_list: "Bán lẻ", item_code: "AU-01", uom: "Bộ", rate: 2000000, currency: "VND", disabled: 0,
      },
      "resource/Sales Option": [
        { name: "AU-FULL-SET", option_code: "FULL_SET", option_label: "Trọn bộ", item_code: "AU-01", item_group: "Cửa Úc", sales_mode: "Trọn bộ", sales_package: "PKG-AU-FULL-SET", is_default: 1, priority: 100, disabled: 0 },
        { name: "AU-SPLIT", option_code: "SPLIT", option_label: "Tách món", item_code: "AU-01", item_group: "Cửa Úc", sales_mode: "Tách món", priority: 90, disabled: 0 },
      ],
    });
    const fields = [
      "item_code", "door_type", "inventory_mode", "stock_uom", "uom", "set_count", "qty",
      "sales_option", "sales_option_code", "sales_option_label", "sales_mode", "sales_package", "sales_package_snapshot",
      "price_variant", "discount_basis_variant", "rate", "standard_rate", "discount_percentage", "discount_amount",
      "adjustment_amount", "net_amount", "amount",
    ];
    const baseArgs = {
      child_doctype: "Sales Order Item",
      child_fields: fields,
      parent: { selling_price_list: "Bán lẻ", currency: "VND", customer_group: "Lẻ" },
    };

    const fullSet = await previewChildRow(call, {
      ...baseArgs,
      row: { item_code: "AU-01", set_count: 1, qty: 1 },
      changed_field: "item_code",
    });
    expect(fullSet.status).toBe(200);
    const fullSetBody = await fullSet.json() as { patch: Json; field_overrides: Record<string, Json> };
    expect(fullSetBody.patch.sales_option).toBe("AU-FULL-SET");
    expect(fullSetBody.patch.sales_mode).toBe("Trọn bộ");
    expect(fullSetBody.patch.sales_package).toBe("PKG-AU-FULL-SET");
    expect(fullSetBody.patch.adjustment_amount).toBe(125000);
    expect(fullSetBody.patch.net_amount).toBe(2125000);
    expect(fullSetBody.field_overrides.sales_option?.reqd).toBe(1);

    const split = await previewChildRow(call, {
      ...baseArgs,
      row: { item_code: "AU-01", set_count: 1, qty: 1, sales_option: "AU-SPLIT" },
      changed_field: "sales_option",
    });
    expect(split.status).toBe(200);
    const splitBody = await split.json() as { patch: Json };
    expect(splitBody.patch.sales_mode).toBe("Tách món");
    expect(splitBody.patch.sales_package).toBeNull();
    expect(splitBody.patch.sales_package_snapshot).toBeNull();
    expect(splitBody.patch.adjustment_amount).toBe(0);
    expect(splitBody.patch.net_amount).toBe(2000000);
  });
});
