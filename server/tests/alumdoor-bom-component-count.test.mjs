/**
 * BOM trên màn bán = CẤU KIỆN + SỐ LƯỢNG + QUY CÁCH CẮT.
 *
 * Trước đợt này màn bán đọc `set_count`/`qty` — hai field mang nghĩa TIÊU HAO KHO — rồi hiện
 * chúng ở cột SL/ĐVT. Kết quả: cây ray hiện "2 / Mét / 5,8" (thợ phải tự chia đôi mới ra chiều
 * dài cắt), còn tấm tôn hiện "1 / m2 / 8,91" — con số "1" ở đó không phải một lá nào cả, nó là
 * `qty_per_set` của luật diện tích.
 *
 * Các test dưới đây khoá lớp `component_count`/`cut_length_each_m` là abstraction chính, và
 * khoá luôn điều kiện fail-closed: thiếu số lá thì phải nói ra, không được rơi về 1.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { enrichSalesBomPreviewWithRules } from "../dist/apps-src/alumdoor-worker/src/bom-rule-sales-preview.js";

function json(data, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
}

function platform({ rules, items }) {
  return async (path) => {
    if (path.startsWith("resource/BOM%20Rule?")) return json(rules.map((rule) => ({ name: rule.name })));
    if (path.startsWith("resource/BOM%20Rule/")) {
      const name = decodeURIComponent(path.slice("resource/BOM%20Rule/".length));
      const rule = rules.find((entry) => entry.name === name);
      return rule ? json(rule) : json(null, 404);
    }
    if (path.startsWith("resource/Item/")) {
      const code = decodeURIComponent(path.slice("resource/Item/".length));
      return items[code] ? json(items[code]) : json(null, 404);
    }
    throw new Error(`Unexpected path ${path}`);
  };
}

/** Cửa Đài Loan trọn bộ — bộ luật thật, chép từ fixture đang chạy. */
const RAY = {
  name: "BOMR-CUA-DAI-LOAN-RT-RAY-U70-RON",
  rule_code: "BOMR-CUA-DAI-LOAN-RT-RAY-U70-RON",
  result_kind: "LENGTH",
  result_uom: "Mét",
  operator: "SUBTRACT",
  source_field: "PB_CAO",
  operand: 0.1,
  qty_per_set: 2,
  version: 1,
  disabled: 0,
  authority_type: "SOURCE",
  applicability: [{ scope_type: "DOOR_TYPE", door_type: "Cửa Đài Loan", component_item: "RT_RAY_U70_RON", priority: 50 }],
};

const V4 = {
  name: "BOMR-CUA-DAI-LOAN-PKC-V4-STD",
  rule_code: "BOMR-CUA-DAI-LOAN-PKC-V4-STD",
  result_kind: "LENGTH",
  result_uom: "Mét",
  operator: "SUBTRACT",
  source_field: "PB_RAY_RONG",
  operand: 0.03,
  qty_per_set: 2,
  version: 1,
  disabled: 0,
  authority_type: "SOURCE",
  applicability: [{ scope_type: "DOOR_TYPE", door_type: "Cửa Đài Loan", component_item: "PKC_V4_STD", priority: 50 }],
};

const TRUC = {
  name: "BOMR-CUA-DAI-LOAN-RT-TR114-1-8",
  rule_code: "BOMR-CUA-DAI-LOAN-RT-TR114-1-8",
  result_kind: "LENGTH",
  result_uom: "Mét",
  operator: "SUBTRACT",
  source_field: "PB_RAY_RONG",
  operand: 0.05,
  qty_per_set: 1,
  version: 1,
  disabled: 0,
  authority_type: "SOURCE",
  applicability: [{ scope_type: "DOOR_TYPE", door_type: "Cửa Đài Loan", component_item: "RT_TR114_1.8", priority: 50 }],
};

const TON = {
  name: "BOMR-CUA-DAI-LOAN-TON-DLM-1LY-K124",
  rule_code: "BOMR-CUA-DAI-LOAN-TON-DLM-1LY-K124",
  result_kind: "AREA",
  result_uom: "m2",
  operator: "PRODUCT",
  source_field: "PB_CAO",
  source_field_2: "PB_RAY_RONG",
  source_field_2_offset: -0.03,
  qty_per_set: 1,
  version: 1,
  disabled: 0,
  authority_type: "SOURCE",
  applicability: [{ scope_type: "DOOR_TYPE", door_type: "Cửa Đài Loan", component_item: "TON_DLM_1LY_K124", priority: 50 }],
};

const ITEMS = {
  CDL_DLM_1LY: { item_code: "CDL_DLM_1LY", door_type: "Cửa Đài Loan", item_group: "Cửa Đài Loan", stock_uom: "m2" },
  RT_RAY_U70_RON: { item_code: "RT_RAY_U70_RON", stock_uom: "Kg", uom_conversions: [{ uom: "Mét", conversion_factor: 1.78 }] },
  PKC_V4_STD: { item_code: "PKC_V4_STD", stock_uom: "Kg", uom_conversions: [{ uom: "Mét", conversion_factor: 1.312 }] },
  "RT_TR114_1.8": { item_code: "RT_TR114_1.8", stock_uom: "Kg", uom_conversions: [{ uom: "Mét", conversion_factor: 1.7 }] },
  TON_DLM_1LY_K124: { item_code: "TON_DLM_1LY_K124", stock_uom: "m2" },
};

/** Dòng BOM giữ nguyên hình dạng thật: ĐVT đếm là Cây/Lá, `qty_basis` nói số lá đến từ đâu. */
function bomLines() {
  return [
    { item_code: "TON_DLM_1LY_K124", uom: "Lá", qty: null, qty_basis: "Theo số lá", stock_uom: "m2" },
    { item_code: "RT_RAY_U70_RON", uom: "Cây", qty: "2", qty_basis: "Theo chiều cao", stock_uom: "Kg" },
    { item_code: "PKC_V4_STD", uom: "Cây", qty: "2", qty_basis: "Theo chiều rộng", stock_uom: "Kg" },
    { item_code: "RT_TR114_1.8", uom: "Cây", qty: "1", qty_basis: "Theo chiều rộng", stock_uom: "Kg" },
  ];
}

async function preview(args, components = bomLines()) {
  const call = platform({ rules: [RAY, V4, TRUC, TON], items: ITEMS });
  const out = await enrichSalesBomPreviewWithRules(call, args, { components });
  const byCode = {};
  for (const row of out.components) byCode[row.item_code] = row;
  return { out, byCode };
}

/** Golden case: Cửa Đài Loan 3 m × 3 m, một bộ. */
const GOLDEN = { item_code: "CDL_DLM_1LY", width_pb_ray_m: 3, height_m: 3, set_count: 1, leaf_count: 38 };

test("ray U70: 2 cây × 2,90 m — không phải 5,8 Mét bắt thợ tự chia", async () => {
  const { byCode } = await preview(GOLDEN);
  const ray = byCode.RT_RAY_U70_RON;
  assert.equal(ray.component_count, 2);
  assert.equal(ray.component_count_uom, "Cây");
  assert.equal(ray.cut_length_each_m, 2.9);
  // Tiêu hao kho không mất đi, chỉ chuyển xuống lớp dưới.
  assert.equal(ray.stock_consumption_qty, 5.8);
  assert.equal(ray.stock_consumption_uom, "Mét");
});

test("V4: 2 cây × 2,97 m", async () => {
  const { byCode } = await preview(GOLDEN);
  const v4 = byCode.PKC_V4_STD;
  assert.equal(v4.component_count, 2);
  assert.equal(v4.component_count_uom, "Cây");
  assert.equal(v4.cut_length_each_m, 2.97);
  assert.equal(v4.stock_consumption_qty, 5.94);
});

test("trục 114: 1 cây × 2,95 m — số cây và tổng mét vẫn là hai khái niệm", async () => {
  const { byCode } = await preview(GOLDEN);
  const truc = byCode["RT_TR114_1.8"];
  assert.equal(truc.component_count, 1);
  assert.equal(truc.component_count_uom, "Cây");
  assert.equal(truc.cut_length_each_m, 2.95);
  assert.equal(truc.stock_consumption_qty, 2.95);
});

test("hai bộ: ray thành 4 cây, mỗi cây VẪN 2,90 m", async () => {
  const { byCode } = await preview({ ...GOLDEN, set_count: 2 });
  const ray = byCode.RT_RAY_U70_RON;
  assert.equal(ray.component_count, 4);
  assert.equal(ray.cut_length_each_m, 2.9, "chiều dài mỗi cây không được nhân theo số bộ");
  assert.equal(ray.stock_consumption_qty, 11.6);
});

test("lá: số lá đến từ công thức chia lá, KHÔNG phải qty_per_set=1 của luật diện tích", async () => {
  const { byCode } = await preview(GOLDEN);
  const ton = byCode.TON_DLM_1LY_K124;
  assert.equal(ton.component_count, 38);
  assert.equal(ton.leaf_count, 38);
  assert.equal(ton.component_count_uom, "Lá");
  // Rộng cắt mỗi lá là vế KHÔNG phải chiều cao của luật diện tích.
  assert.equal(ton.cut_length_each_m, 2.97);
  // Diện tích vẫn còn nguyên cho kho, và nó KHÔNG được là số lá.
  assert.equal(ton.stock_consumption_qty, 8.91);
  assert.equal(ton.stock_consumption_uom, "m2");
  assert.notEqual(ton.component_count, ton.stock_consumption_qty);
});

test("hai bộ: số lá nhân theo bộ, rộng cắt mỗi lá giữ nguyên", async () => {
  const { byCode } = await preview({ ...GOLDEN, set_count: 2 });
  const ton = byCode.TON_DLM_1LY_K124;
  assert.equal(ton.component_count, 76);
  assert.equal(ton.leaf_count, 38, "leaf_count là số lá MỖI BỘ, không nhân theo số bộ");
  assert.equal(ton.cut_length_each_m, 2.97);
});

test("thiếu số lá thì nói ra, không âm thầm hiện 1", async () => {
  const { byCode } = await preview({ ...GOLDEN, leaf_count: undefined });
  const ton = byCode.TON_DLM_1LY_K124;
  assert.equal(ton.component_count, null, "không có đường lui về 1");
  assert.match(ton.component_count_error, /số lá/i);
  assert.match(ton.note, /số lá/i);
  // Diện tích vẫn tính được — chỉ số cấu kiện là chưa biết.
  assert.equal(ton.stock_consumption_qty, 8.91);
});

test("dòng định mức khai chính mặt hàng cha bị loại, kèm cảnh báo đọc được", async () => {
  const { out, byCode } = await preview(GOLDEN, [
    ...bomLines(),
    { item_code: "CDL_DLM_1LY", uom: "Bộ", qty: "1", qty_basis: "Cố định", stock_uom: "m2" },
  ]);
  assert.equal(byCode.CDL_DLM_1LY, undefined, "cấu phần trùng mã cha không được lọt xuống sản xuất");
  assert.match(out.bom_self_reference_warning, /CDL_DLM_1LY/);
});

/**
 * Bắn bướm đổi RỘNG CẮT LÁ, nên định mức lá phải đi theo.
 *
 * Số trừ khi bắn bướm (0,035 thay cho 0,03) do Cutting Policy giữ và đã nằm sẵn trong
 * `cut_width_m`. Luật lá khai trục `CAT_LA_RONG` để ăn theo con số đó; khai cứng
 * `PB_RAY_RONG − 0,03` là ô tick bấm xong không có gì đổi — đúng lỗi đã gặp trên màn bán.
 */
const TON_THEO_RONG_CAT = {
  ...TON,
  source_field_2: "CAT_LA_RONG",
  source_field_2_offset: 0,
  component_count_source: "Số lá",
};

test("bắn bướm đổi rộng cắt lá thì định mức lá tính lại theo", async () => {
  const call = platform({ rules: [TON_THEO_RONG_CAT], items: ITEMS });
  const dong = [{ item_code: "TON_DLM_1LY_K124", bom_count_uom: "Lá", stock_uom: "m2" }];

  const thuong = await enrichSalesBomPreviewWithRules(call, { ...GOLDEN, cut_width_m: 2.97 }, { components: dong });
  assert.equal(thuong.components[0].cut_length_each_m, 2.97);
  assert.equal(thuong.components[0].stock_consumption_qty, 8.91);

  const buom = await enrichSalesBomPreviewWithRules(call, { ...GOLDEN, cut_width_m: 2.965 }, { components: dong });
  assert.equal(buom.components[0].cut_length_each_m, 2.965, "bấm bắn bướm mà số không đổi là lỗi");
  assert.equal(buom.components[0].stock_consumption_qty, 8.895);
  assert.equal(buom.components[0].component_count, 38, "bắn bướm đổi rộng cắt, không đổi số lá");
});

test("Quy tắc BOM giữ quyền quyết định số cấu kiện — định mức không cần khai qty_basis", async () => {
  // Luật tự khai nguồn số cấu kiện; dòng định mức chỉ còn mã + ĐVT, KHÔNG có qty_basis.
  const call = platform({
    rules: [{ ...TON, component_count_source: "Số lá" }, RAY, V4, TRUC],
    items: ITEMS,
  });
  const out = await enrichSalesBomPreviewWithRules(call, GOLDEN, {
    components: [{ item_code: "TON_DLM_1LY_K124", uom: "Lá", stock_uom: "m2" }],
  });
  const ton = out.components[0];
  assert.equal(ton.component_count, 38);
  assert.equal(ton.leaf_count, 38);
});

test("luật khai Cố định thì thắng qty_basis cũ còn sót trên dòng định mức", async () => {
  const call = platform({ rules: [{ ...TON, component_count_source: "Cố định" }], items: ITEMS });
  const out = await enrichSalesBomPreviewWithRules(call, GOLDEN, {
    components: [{ item_code: "TON_DLM_1LY_K124", uom: "Lá", qty_basis: "Theo số lá", stock_uom: "m2" }],
  });
  assert.equal(out.components[0].component_count, 1, "luật là authority, không phải dòng định mức");
  assert.equal(out.components[0].leaf_count, undefined);
});

test("ĐVT đếm lấy từ dòng định mức, không lấy đơn vị đo của luật", async () => {
  const { byCode } = await preview(GOLDEN);
  for (const [code, dvt] of [["RT_RAY_U70_RON", "Cây"], ["PKC_V4_STD", "Cây"], ["RT_TR114_1.8", "Cây"], ["TON_DLM_1LY_K124", "Lá"]]) {
    assert.equal(byCode[code].component_count_uom, dvt);
    assert.notEqual(byCode[code].component_count_uom, byCode[code].stock_consumption_uom);
  }
});
