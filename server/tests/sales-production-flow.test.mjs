// Regression contract for the Sales Order → Production Request → Work Order flow.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildSalesProductionLines,
  calculateLeafPlan,
} from "../dist/apps-src/alumdoor-worker/src/sales-production.js";

const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));
const generatedBrief = JSON.parse(await readFile(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));

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

function generatedDoctype(name) {
  const value = generatedBrief.doctypes.find((entry) => entry.name === name);
  assert.ok(value, `missing generated doctype ${name}`);
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


function tamLienProductionInput(rayType) {
  const base = fixturePolicy("Cửa tấm liền Úc — công thức chuẩn");
  const policy = {
    ...base,
    geometry_profile: "GP-CUA-UC",
    geometry_rules: [
      { rule_code: "TLUC-RCL-U70", target_field: "CAT_LA_RONG", source_field: "PB_RAY_RONG", operator: "SUBTRACT", operand_m: 0.05, ray_type: "Ray sắt U70", priority: 10, sequence: 10 },
      { rule_code: "TLUC-RCL-U76", target_field: "CAT_LA_RONG", source_field: "PB_RAY_RONG", operator: "SUBTRACT", operand_m: 0.08, ray_type: "Ray hộp/đơn U76", priority: 10, sequence: 20 },
    ],
  };
  return {
    sales: {
      name: "DH-TLUC",
      docstatus: 1,
      customer_group: "Đại lý",
      delivery_date: "2026-08-10",
      items: [{
        row_id: "ROW-TLUC",
        item_code: "CUA-TLUC-TEST",
        inventory_mode: "Thành phẩm theo m2",
        width_m: 4,
        height_m: 2.856,
        set_count: 1,
        ray_type: rayType,
        single_layer_leaf_count: 4,
      }],
    },
    items: new Map([["CUA-TLUC-TEST", {
      item_code: "CUA-TLUC-TEST",
      item_group: "Cửa tấm liền Úc",
      door_type: "Cửa tấm liền Úc",
      inventory_mode: "Thành phẩm theo m2",
      stock_uom: "Bộ",
      min_area_sqm: 0,
    }]]),
    policies: [policy],
    geometry_profiles: new Map([["GP-CUA-UC", {
      name: "GP-CUA-UC",
      fields: [
        { geometry_field: "PB_CAO", role: "INPUT", required: true },
        { geometry_field: "PB_RAY_RONG", role: "INPUT", required: true },
        { geometry_field: "CAT_LA_RONG", role: "CALCULATED" },
      ],
    }]]),
    standards: [],
    boms: [{ name: "BOM-TLUC-1", item: "CUA-TLUC-TEST", docstatus: 1, bom_status: "Active", revision: 1 }],
    source_warehouse: "K36",
    target_warehouse: "K36-TP",
  };
}

test("Cửa tấm liền Úc dùng ray từng dòng làm authority rộng cắt", () => {
  const u70 = buildSalesProductionLines(tamLienProductionInput("Ray sắt U70"));
  const u76 = buildSalesProductionLines(tamLienProductionInput("Ray hộp/đơn U76"));
  assert.equal(u70[0].cut_width_m, 3.95);
  assert.equal(u76[0].cut_width_m, 3.92);
  assert.equal(u70[0].ray_type, "Ray sắt U70");
  assert.equal(u76[0].ray_type, "Ray hộp/đơn U76");
  assert.equal(JSON.parse(u70[0].formula_snapshot).ray_type, "Ray sắt U70");
  assert.deepEqual(JSON.parse(u70[0].formula_snapshot).geometry_applied_rules, ["TLUC-RCL-U70"]);
});

test("Cửa tấm liền Úc thiếu hoặc sai ray thì production fail closed", () => {
  assert.throws(() => buildSalesProductionLines(tamLienProductionInput(undefined)), /cần chọn Loại ray/);
  assert.throws(() => buildSalesProductionLines(tamLienProductionInput("U75")), /không được .* hỗ trợ/);
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
  const salesLine = fieldNames(generatedDoctype("Sales Order Item"));
  for (const required of [
    "door_type", "ray_type", "leaf_variant", "leaf_divisor_m", "leaf_count", "single_layer_leaf_count",
    "double_layer_leaf_count", "estimated_weight_kg", "estimated_minutes", "formula_version",
  ]) assert.ok(salesLine.has(required), `Sales Order Item missing ${required}`);

  const request = doctype("Production Request");
  const requestLine = generatedDoctype("Production Request Item");
  const paint = doctype("Paint Job");
  assert.ok(fieldNames(request).has("sales_order"));
  assert.ok(fieldNames(requestLine).has("request_line_key"));
  assert.ok(fieldNames(requestLine).has("ray_type"));
  assert.ok(fieldNames(paint).has("cut_order"));
  assert.ok(fieldNames(generatedDoctype("Work Order")).has("leaf_count"));
  assert.ok(fieldNames(generatedDoctype("Work Order")).has("ray_type"));
  assert.ok(fieldNames(doctype("Delivery Note Item")).has("sales_order_row_id"));
  assert.ok(brief.actions.some((action) => action.name === "don-hang-thanh-san-xuat"));

  const source = await readFile(new URL("../apps-src/alumdoor-worker/src/index.ts", import.meta.url), "utf8");
  assert.match(source, /sales_order_row_id/);
  assert.match(source, /previewSalesProduction/);
  assert.match(source, /syncPaintJobsFromCut/);
});


test("React must not own U70/U76 cut deductions", async () => {
  const model = await readFile(new URL("../../client/packages/vertical-alumdoor/src/sales-order-v2/model.ts", import.meta.url), "utf8");
  const table = await readFile(new URL("../../client/packages/vertical-alumdoor/src/sales-order-v2/AlumdoorSalesOrderLineTable.tsx", import.meta.url), "utf8");
  assert.match(model, /"ray_type"/);
  assert.match(table, /ray_type: "Loại ray"/);
  assert.doesNotMatch(model + table, /0\.05|0\.08/);
});

/**
 * Ước tính Kg nhôm là số THAM KHẢO, không phải điều kiện để phát lệnh.
 *
 * Soát ngày 23/08/2026: 54/54 mã có `door_type` đều trống `purchase_kg_per_m2`, nên đường
 * `purpose: "all"` ném "Barem kg/m2 phải lớn hơn 0" và KHÔNG đơn nào phát được lệnh sản xuất —
 * kể cả đơn đã đo đủ. Vật tư thật cấp theo BOM, nên thiếu barem phải hạ xuống cảnh báo.
 */
function daiLoanProductionInput({ barem, meshHeight }) {
  return {
    sales: {
      name: "DH-DL-TEST",
      docstatus: 1,
      customer_group: "Đại lý",
      delivery_date: "2026-08-30",
      items: [{
        row_id: "ROW-DL",
        item_code: "CUA-DL-TEST",
        inventory_mode: "Thành phẩm theo m2",
        width_m: 4,
        height_m: 3,
        ...(meshHeight === undefined ? {} : { mesh_height_m: meshHeight }),
        set_count: 1,
        sales_mode: "Trọn bộ",
        color: "GS",
      }],
    },
    items: new Map([["CUA-DL-TEST", {
      item_code: "CUA-DL-TEST",
      item_group: "Cửa Đài Loan",
      door_type: "Cửa Đài Loan",
      inventory_mode: "Thành phẩm theo m2",
      stock_uom: "Bộ",
      min_area_sqm: 0,
      ...(barem === undefined ? {} : { purchase_kg_per_m2: barem }),
    }]]),
    // Fixture trong `briefs/alumdoor.json` chưa khai chia lá cho ba chính sách Barem, còn
    // bản đang chạy thì có (soát D1 ngày 23/08/2026). Dùng hình dạng THẬT để test đo đúng
    // đường mà xưởng đi, không đo một chính sách chỉ tồn tại trong brief cũ.
    policies: [{
      ...fixturePolicy("Cửa Đài Loan — công thức chuẩn"),
      leaf_formula: "Kiểu Đài Loan Lưới",
      leaf_divisor_source: "Hằng số của chính sách",
      leaf_divisor_const: 0.077,
      leaf_height_deduction_m: 0,
      leaf_rounding: "Ngưỡng trừ-một-lá",
      leaf_round_threshold: 0.8,
    }],
    standards: [{ department: "Cửa Đài Loan", door_type: "Cửa Đài Loan", minutes_per_set: 40 }],
    boms: [{ name: "BOM-DL-1", item: "CUA-DL-TEST", color: "GS", docstatus: 1, bom_status: "Active", revision: 1 }],
    source_warehouse: "Kho xưởng",
    target_warehouse: "Kho xưởng",
  };
}

test("thiếu Barem kg/m2 vẫn phát được lệnh — ô Kg để trống kèm lý do, không chặn cả xưởng", () => {
  const lines = buildSalesProductionLines(daiLoanProductionInput({ meshHeight: 2.8 }));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].estimated_weight_kg, undefined);
  assert.match(lines[0].estimate_missing_reason, /Barem kg\/m2/);
  assert.equal(lines[0].bom_no, "BOM-DL-1");
});

test("thiếu Cao lưới cũng chỉ bỏ ước tính, không chặn phát lệnh", () => {
  const lines = buildSalesProductionLines(daiLoanProductionInput({ barem: 7.5 }));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].estimated_weight_kg, undefined);
  assert.match(lines[0].estimate_missing_reason, /Cao lưới/);
});

test("đủ Barem và Cao lưới thì vẫn ước tính Kg nhôm như cũ", () => {
  const lines = buildSalesProductionLines(daiLoanProductionInput({ barem: 7.5, meshHeight: 2.8 }));
  assert.equal(lines.length, 1);
  assert.ok(lines[0].estimated_weight_kg > 0, `Kg phải > 0, nhận ${lines[0].estimated_weight_kg}`);
  assert.equal(lines[0].estimate_missing_reason, undefined);
});
