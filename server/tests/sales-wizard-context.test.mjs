import test from "node:test";
import assert from "node:assert/strict";
import { calculateSalesWizardLineContext } from "../dist/apps-src/alumdoor-worker/src/sales-wizard-context.js";

const policy = {
  name: "POL-DUC-U75",
  policy_name: "Cửa Đức U75",
  door_type: "Cửa Đức",
  item_group: "Cửa CN Đức",
  ray_type: "U75",
  height_pb_offset_m: 0.5,
  dealer_width_basis: "Phủ bì nhựa",
  retail_width_basis: "Phủ bì ray",
  dealer_cut_deduction_m: 0.02,
  retail_cut_deduction_m: 0.08,
  butterfly_cut_deduction_m: 0.08,
  dealer_split_sales_basis: "Rộng cắt lá",
  dealer_full_sales_basis: "Rộng cắt lá",
  retail_sales_basis: "Phủ bì ray",
  purchase_formula: "Kg thực tế",
  priority: 10,
  disabled: 0,
  leaf_formula: "Kiểu Đức",
  leaf_height_deduction_m: 0.13,
  leaf_divisor_source: "Hằng số của chính sách",
  leaf_divisor_const: 0.055,
  leaf_rounding: "Ngưỡng trừ-một-lá",
  leaf_round_threshold: 0.6,
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function platform(overrides = {}) {
  const call = async (path) => {
    if (path === "resource/Item/CUA-DUC") return json({ data: {
      item_code: "CUA-DUC",
      item_group: "Cửa CN Đức",
      door_type: "Cửa Đức",
      inventory_mode: "Thành phẩm theo m2",
      min_area_sqm: 0,
    } });
    if (path === "resource/Item/AL71N-RAW") return json({ data: {
      item_code: "AL71N-RAW",
      inventory_mode: "Nhôm cây/lá",
    } });
    if (path.startsWith("resource/Cutting%20Policy?")) return json({ data: overrides.policies ?? [policy] });
    if (path.startsWith("resource/Bill%20of%20Materials?")) return json({ data: overrides.boms ?? [{
      name: "BOM-DUC-1",
      item: "CUA-DUC",
      color: "TRANG",
      docstatus: 1,
      bom_status: "Active",
      revision: 2,
      effective_from: "2026-01-01",
    }] });
    if (path === "resource/Bill%20of%20Materials/BOM-DUC-1") return json({ data: overrides.bom ?? {
      name: "BOM-DUC-1",
      item: "CUA-DUC",
      items: [{ item_code: "AL71N-RAW", qty_basis: "Theo số lá" }],
    } });
    throw new Error(`unexpected platform read: ${path}`);
  };
  return call;
}

async function body(response) {
  return JSON.parse(await response.text());
}

test("khách lẻ nhập RLL/CLL được đổi server-side sang phủ bì, rộng cắt và mã nhôm BOM", async () => {
  const response = await calculateSalesWizardLineContext(platform(), {
    item_code: "CUA-DUC",
    customer_group: "Lẻ",
    sales_mode: "Trọn bộ",
    ray_type: "U75",
    width_input_basis: "Rộng lọt lòng",
    height_input_basis: "Cao lọt lòng",
    width_m: 4,
    height_m: 2.3,
    set_count: 1,
    color: "TRANG",
    delivery_date: "2026-08-10",
  });
  assert.equal(response.status, 200);
  const result = await body(response);
  assert.equal(result.cover_width_m, 4.08);
  assert.equal(result.cut_width_m, 4);
  assert.equal(result.cover_height_m, 2.8);
  assert.equal(result.billable_area_sqm, 11.424);
  assert.equal(result.bom_no, "BOM-DUC-1");
  assert.equal(result.stock_profile_item, "AL71N-RAW");
  assert.equal(result.stock_profile_error, null);
  assert.ok(result.leaf_count > 0);
});

test("ray được chọn fail-closed nếu tenant chưa có Cutting Policy tương ứng", async () => {
  const response = await calculateSalesWizardLineContext(platform(), {
    item_code: "CUA-DUC",
    customer_group: "Lẻ",
    sales_mode: "Trọn bộ",
    ray_type: "U100",
    width_input_basis: "Rộng lọt lòng",
    height_input_basis: "Cao lọt lòng",
    width_m: 4,
    height_m: 2.3,
    set_count: 1,
  });
  assert.equal(response.status, 422);
  assert.match((await body(response)).message, /ray U100/);
});

test("BOM nhiều nhôm cây/lá mà không khai dòng Theo số lá không được đoán ATP", async () => {
  const call = platform({ bom: {
    name: "BOM-DUC-1",
    item: "CUA-DUC",
    items: [
      { item_code: "AL71N-RAW" },
      { item_code: "AL72-RAW" },
    ],
  } });
  const wrapped = async (path) => {
    if (path === "resource/Item/AL72-RAW") return json({ data: { item_code: "AL72-RAW", inventory_mode: "Nhôm cây/lá" } });
    return call(path);
  };
  const response = await calculateSalesWizardLineContext(wrapped, {
    item_code: "CUA-DUC",
    customer_group: "Lẻ",
    sales_mode: "Trọn bộ",
    ray_type: "U75",
    width_input_basis: "Rộng lọt lòng",
    height_input_basis: "Cao lọt lòng",
    width_m: 4,
    height_m: 2.3,
    set_count: 1,
    color: "TRANG",
  });
  assert.equal(response.status, 200);
  const result = await body(response);
  assert.equal(result.stock_profile_item, null);
  assert.match(result.stock_profile_error, /nhiều vật tư Nhôm cây\/lá/);
});
