import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildSalesProductionLines,
  calculateLeafPlan,
} from "../dist/apps-src/alumdoor-worker/src/sales-production.js";

const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));

function fixturePolicy(name) {
  const fixture = brief.fixtures.find((entry) => entry.type === "Cutting Policy" && entry.name === name);
  assert.ok(fixture, `missing policy fixture ${name}`);
  return { name: fixture.name, ...fixture.data };
}

function doctype(name) {
  const value = brief.doctypes.find((entry) => entry.name === name);
  assert.ok(value, `missing doctype ${name}`);
  return value;
}

function fieldNames(meta) {
  return new Set(meta.fields.map((field) => typeof field === "string" ? field.split(":", 1)[0] : field.fieldname));
}

test("Cửa Đức chia lá từ policy snapshot, trừ một lá rồi áp ngưỡng 0,6", () => {
  const result = calculateLeafPlan(fixturePolicy("Cửa Đức — công thức chuẩn"), {
    height_m: 3,
    leaf_divisor_m: 0.055,
  });
  assert.equal(result.height_deduction_m, 0.13);
  assert.equal(result.divisor_m, 0.055);
  assert.equal(result.leaf_count, 51);
  assert.match(result.explanation, /Ngưỡng trừ-một-lá/);
});

test("Cửa Úc dùng biến thể motor và làm tròn đúng nấc 0-0,3-0,7-1", () => {
  const result = calculateLeafPlan(fixturePolicy("Cửa Úc — công thức chuẩn"), {
    height_m: 2.6,
    leaf_variant: "motor ngoài",
  });
  assert.equal(result.leaf_count, 7);
  assert.equal(result.leaf_variant, "motor ngoài");
});

test("Cửa tấm liền Úc giữ riêng lá một lớp và hai lớp", () => {
  const result = calculateLeafPlan({
    policy_name: "AL70 test",
    door_type: "Cửa tấm liền Úc",
    leaf_formula: "Kiểu tấm liền Úc",
    leaf_height_deduction_m: 0,
    leaf_divisor_const: 0.068,
    leaf_rounding: "Làm tròn xuống",
  }, {
    height_m: 2.856,
    single_layer_leaf_count: 4,
  });
  assert.equal(result.leaf_count, 42);
  assert.equal(result.single_layer_leaf_count, 4);
  assert.equal(result.double_layer_leaf_count, 38);
});

test("một dòng bán hai bộ sinh hai khóa sản xuất độc lập", () => {
  const policy = fixturePolicy("Cửa Đức — công thức chuẩn");
  const lines = buildSalesProductionLines({
    sales: {
      name: "DH-TEST",
      docstatus: 1,
      customer_group: "Đại lý",
      delivery_date: "2026-08-10",
      items: [{
        row_id: "ROW-A",
        item_code: "CUA-DUC-TEST",
        inventory_mode: "Thành phẩm theo m2",
        width_m: 4,
        height_m: 3,
        set_count: 2,
        sales_mode: "Trọn bộ",
        leaf_divisor_m: 0.055,
        color: "GHI",
      }],
    },
    items: new Map([["CUA-DUC-TEST", {
      item_code: "CUA-DUC-TEST",
      item_group: "Cửa CN Đức",
      door_type: "Cửa Đức",
      inventory_mode: "Thành phẩm theo m2",
      stock_uom: "Bộ",
      min_area_sqm: 0,
    }]]),
    policies: [policy],
    standards: [{ department: "Cửa Đức", door_type: "Cửa Đức", minutes_per_set: 45 }],
    boms: [{ name: "BOM-DUC-1", item: "CUA-DUC-TEST", color: "GHI", docstatus: 1, bom_status: "Active", revision: 1 }],
    source_warehouse: "K36",
    target_warehouse: "K36-TP",
  });
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((line) => line.request_line_key), ["ROW-A-SET-1", "ROW-A-SET-2"]);
  assert.deepEqual(lines.map((line) => line.set_no), [1, 2]);
  assert.ok(lines.every((line) => line.bom_no === "BOM-DUC-1" && line.leaf_count > 0));
});

test("loại cửa thiếu số chia hoặc cách làm tròn bị chặn, không đoán", () => {
  assert.throws(() => calculateLeafPlan({
    policy_name: "Thiếu cấu hình",
    door_type: "Cửa Lưới",
    leaf_formula: "Kiểu Đài Loan Lưới",
    leaf_height_deduction_m: 0,
  }, { height_m: 3 }), /Ước số chia lá/);
});

test("metadata có đủ Production Request, Paint Job và khóa truy vết dòng giao", async () => {
  const salesLine = fieldNames(doctype("Sales Order Item"));
  for (const required of [
    "door_type", "leaf_variant", "leaf_divisor_m", "leaf_count", "single_layer_leaf_count",
    "double_layer_leaf_count", "estimated_weight_kg", "estimated_minutes", "formula_version",
  ]) assert.ok(salesLine.has(required), `Sales Order Item missing ${required}`);

  const request = doctype("Production Request");
  const requestLine = doctype("Production Request Item");
  const paint = doctype("Paint Job");
  assert.ok(fieldNames(request).has("sales_order"));
  assert.ok(fieldNames(requestLine).has("request_line_key"));
  assert.ok(fieldNames(paint).has("cut_order"));
  assert.ok(fieldNames(doctype("Work Order")).has("leaf_count"));
  assert.ok(fieldNames(doctype("Delivery Note Item")).has("sales_order_row_id"));
  assert.ok(brief.actions.some((action) => action.name === "don-hang-thanh-san-xuat"));

  const source = await readFile(new URL("../apps-src/alumdoor-worker/src/index.ts", import.meta.url), "utf8");
  assert.match(source, /sales_order_row_id/);
  assert.match(source, /previewSalesProduction/);
  assert.match(source, /syncPaintJobsFromCut/);
});
