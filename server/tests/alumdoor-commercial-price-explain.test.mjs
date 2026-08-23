import test from "node:test";
import assert from "node:assert/strict";
import { previewSalesCommercialLine } from "../dist/packages/frappe-api/src/alumdoor-commercial.js";
import { FrappeArgs } from "../dist/packages/frappe-api/src/args.js";

/**
 * `metaforge.api.preview_sales_commercial_line` phải **giải trình được** con số, không chỉ trả ra
 * con số — hợp đồng ở `docs/audits/ALUMDOOR-BAN-HANG-PAYLOAD-CONTRACT-20260821.md` §B.
 *
 * Hai chỗ luật danh mục từng ngủ im lặng và file này ghim lại:
 *  · `Bậc diện tích` quyết định CHỌN dòng giá nào nhưng không bao giờ nói ra bậc nào đã trúng;
 *  · giá lấy từ ĐVT khác rồi nhân chéo hệ số quy đổi mà không có dấu hiệu nào trên payload.
 */
function context(masters) {
  const documents = {
    async getDocument(_tenant, doctype, name) {
      const data = masters.get(`${doctype}:${name}`);
      return data ? { name, doctype, owner: "admin", version: 1, data } : null;
    },
    async getMasterRecordData(_tenant, doctype, name) {
      return masters.get(`${doctype}:${name}`) ?? null;
    },
    async listMasterRecordData(_tenant, doctype) {
      const prefix = `${doctype}:`;
      return [...masters.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, data]) => ({ name: key.slice(prefix.length), data }));
    },
  };
  return {
    tenantId: "demo",
    traceId: "trace-1",
    actor: { user_id: "u1", roles: ["Sales User"] },
    now: () => "2026-08-21T08:00:00.000Z",
    documents,
    permissions: {
      async assert() {},
      async redactDocumentWithPolicies(_tenant, _meta, document) { return document; },
    },
    metadata: { async getDocType() { return null; } },
    access: { async getShare() { return null; } },
  };
}

function args(values) {
  return new FrappeArgs(new Map(Object.entries(values)));
}

/** Cửa Đức bán m²: hai dòng giá cùng bảng giá, cùng ĐVT, chỉ khác BẬC DIỆN TÍCH. */
function tieredMasters(overrides = {}) {
  return new Map(Object.entries({
    "Currency:VND": { currency_scale: 0 },
    "Item:CUA-AL70": {
      item_code: "CUA-AL70", item_group: "Cửa CN Đức", door_type: "Cửa Đức",
      inventory_mode: "Thành phẩm theo m2", measurement_profile: "Thành phẩm theo m2",
      material_specification: "QC-AL70", min_area_sqm: 4, stock_uom: "Bộ", default_sales_uom: "m2",
    },
    "Bậc diện tích:4-5": { tier_code: "4-5", min_area_sqm: 4, max_area_sqm: 5 },
    "Bậc diện tích:8-9": { tier_code: "8-9", min_area_sqm: 8, max_area_sqm: 9 },
    "Item Price:BG:CUA-AL70:m2:4-5": {
      price_list: "BG", item_code: "CUA-AL70", uom: "m2", area_tier: "4-5",
      price_variant: "STANDARD", currency: "VND", rate: 640000,
    },
    "Item Price:BG:CUA-AL70:m2:8-9": {
      price_list: "BG", item_code: "CUA-AL70", uom: "m2", area_tier: "8-9",
      price_variant: "STANDARD", currency: "VND", rate: 580000,
    },
    ...overrides,
  }));
}

test("bậc diện tích đã trúng được NÓI RA, và nó tra theo diện tích MỘT BỘ", async () => {
  // 2 bộ × 4,5 m² = 9 m² cả dòng. Bậc phải là 4-5 (một bộ), không phải 8-9 (cả dòng).
  const preview = await previewSalesCommercialLine(
    args({
      line: { item_code: "CUA-AL70", uom: "m2", qty: 9, set_count: 2, area_per_set_sqm: 4.5 },
      price_list: "BG", currency: "VND", posting_date: "2026-08-21",
    }),
    context(tieredMasters()),
  );

  assert.equal(preview.price_explain.area_tier, "4-5");
  assert.equal(preview.price_explain.area_tier_basis_sqm, 4.5);
  assert.deepEqual(preview.price_explain.area_tier_bounds, { min_area_sqm: 4, max_area_sqm: 5 });
  assert.equal(preview.price_explain.price_uom, "m2");
  assert.equal(preview.price_explain.converted_from_uom, null);
  assert.equal(preview.price_explain.price_rate, "640000");
  assert.equal(preview.price_explain.currency, "VND");
  assert.equal(preview.price_explain.posting_date, "2026-08-21");
  assert.match(preview.price_explain.note, /4-5/);
  // Tiền vẫn là tiền cũ: 9 m² × 640.000 trước chiết khấu.
  assert.equal(preview.gross_amount_minor, 5_760_000);
});

test("giá lấy từ ĐVT khác rồi nhân chéo thì phải hiện ra, không được nuốt", async () => {
  const masters = new Map(Object.entries({
    "Currency:VND": { currency_scale: 0 },
    "Item:PK-1": {
      item_code: "PK-1", item_group: "Phụ kiện", stock_uom: "Cái", default_sales_uom: "Cái",
      uom_conversions: [{ uom: "Thùng", conversion_factor: 10 }],
    },
    "Item Price:BG:PK-1:Cái": {
      price_list: "BG", item_code: "PK-1", uom: "Cái", price_variant: "STANDARD",
      currency: "VND", rate: 50000,
    },
  }));
  const preview = await previewSalesCommercialLine(
    args({ line: { item_code: "PK-1", uom: "Thùng", qty: 3 }, price_list: "BG", currency: "VND" }),
    context(masters),
  );

  assert.equal(preview.price_explain.line_uom, "Thùng");
  assert.equal(preview.price_explain.price_uom, "Cái");
  assert.equal(preview.price_explain.converted_from_uom, "Cái");
  assert.match(preview.price_explain.note, /quy đổi/);
  assert.ok(preview.catalog_warnings.some((entry) => entry.code === "PRICE_CONVERTED_FROM_BASE_UOM"));
  // Đơn giá thật sự khác con số người khai giá đã gõ — đúng lý do phải cảnh báo.
  assert.equal(preview.price_explain.price_rate, "50000");
  assert.equal(preview.selling_rate, "500000");
});

test("phạm vi áp dụng chính sách nói được vì sao luật giá lọt vào dòng", async () => {
  const masters = tieredMasters({
    "Pricing Scope:CUA VAN GO": {
      scope_name: "CUA VAN GO",
      members: [{ member_type: "Item Group", item_group: "Cửa CN Đức" }],
    },
    "Pricing Rule:PR-VAN-GO": {
      title: "Phụ thu vân gỗ", pricing_scope: "CUA VAN GO", effect_type: "ADJUSTMENT",
      adjustment_basis: "AREA_SQM", adjustment_rate: 465000, currency: "VND", priority: 5,
    },
  });
  const preview = await previewSalesCommercialLine(
    args({
      line: { item_code: "CUA-AL70", uom: "m2", qty: 9, set_count: 2, area_per_set_sqm: 4.5 },
      price_list: "BG", currency: "VND",
    }),
    context(masters),
  );

  assert.ok(preview.applied_adjustments.some((entry) => entry.rule_name === "PR-VAN-GO"));
  assert.equal(preview.pricing_scope_by_rule["PR-VAN-GO"], "CUA VAN GO");
});

test("ngữ cảnh danh mục đi kèm, và diện tích tối thiểu kéo tiền lên thì nói ra", async () => {
  // Mã này khai tối thiểu 5 m²/bộ, dòng chỉ 4,2 m²/bộ ⇒ tiền đang bị nâng lên mức tối thiểu.
  const raisedMinimum = tieredMasters({
    "Item:CUA-AL70": {
      item_code: "CUA-AL70", item_group: "Cửa CN Đức", door_type: "Cửa Đức",
      inventory_mode: "Thành phẩm theo m2", measurement_profile: "Thành phẩm theo m2",
      material_specification: "QC-AL70", min_area_sqm: 5, stock_uom: "Bộ", default_sales_uom: "m2",
    },
  });
  const below = await previewSalesCommercialLine(
    args({
      line: { item_code: "CUA-AL70", uom: "m2", qty: 4.2, set_count: 1, area_per_set_sqm: 4.2 },
      price_list: "BG", currency: "VND",
    }),
    context(raisedMinimum),
  );
  assert.equal(below.catalog_context.item_group, "Cửa CN Đức");
  assert.equal(below.catalog_context.door_type, "Cửa Đức");
  assert.equal(below.catalog_context.inventory_mode, "Thành phẩm theo m2");
  assert.equal(below.catalog_context.material_specification, "QC-AL70");
  assert.equal(below.catalog_context.min_area_sqm, 5);
  assert.equal(below.catalog_context.min_area_applied, true);

  const above = await previewSalesCommercialLine(
    args({
      line: { item_code: "CUA-AL70", uom: "m2", qty: 4.5, set_count: 1, area_per_set_sqm: 4.5 },
      price_list: "BG", currency: "VND",
    }),
    context(tieredMasters()),
  );
  assert.equal(above.catalog_context.min_area_applied, false);
});

test("mọi trường tiền cũ còn nguyên sau khi thêm phần giải trình", async () => {
  const preview = await previewSalesCommercialLine(
    args({
      line: { item_code: "CUA-AL70", uom: "m2", qty: 9, set_count: 2, area_per_set_sqm: 4.5 },
      price_list: "BG", currency: "VND",
    }),
    context(tieredMasters()),
  );

  for (const key of [
    "item_price", "price_variant", "base_rate", "base_rate_minor", "selling_rate",
    "selling_rate_minor", "priced_qty", "gross_amount", "discount_basis_item_price",
    "discount_percentage", "discount_amount", "adjustment_amount", "net_before_tax",
    "pricing_as_of", "pricing_rule_snapshots", "applied_adjustments", "benefit_items",
    "rate", "amount", "net_amount",
  ]) {
    assert.ok(key in preview, `trường cũ ${key} biến mất khỏi payload`);
  }
  assert.equal(preview.rate, preview.selling_rate);
  assert.equal(preview.amount, preview.net_before_tax);
  // Cửa Đức mặc định chiết khấu 15% — chính sách cũ không được đổi vì thêm khoá mới.
  assert.equal(Number(preview.discount_percentage), 15);
});

/**
 * Phụ thu tính theo MÉT (ví dụ sơn ray) trên một dòng bán ĐỘC LẬP, ĐVT "Mét".
 *
 * Bug thật đêm 23/08: `Pricing Rule.adjustment_basis = LENGTH_M` đọc riêng `line.length_m` —
 * một trường chỉ BOM gán cho dòng cấu kiện (chiều dài cắt mỗi cây), không tồn tại trên dòng bán
 * độc lập. Ray bán riêng thì `qty` CHÍNH LÀ tổng số mét; thiếu đường lui `qty → length_m` khi
 * ĐVT là Mét, cơ sở tính đọc ra rỗng, hạ về 0, và luật coi như "không đủ điều kiện" dù màu và
 * phạm vi đã khớp — im lặng, không có `pricing_rule_snapshots` nào báo lỗi.
 */
function rayMasters() {
  return new Map(Object.entries({
    "Currency:VND": { currency_scale: 0 },
    "Item:RT_RAYHOP": { item_code: "RT_RAYHOP", item_group: "Ray và trục", stock_uom: "Mét", default_sales_uom: "Mét" },
    "Item Price:BG:RT_RAYHOP:Mét": { price_list: "BG", item_code: "RT_RAYHOP", uom: "Mét", price_variant: "STANDARD", currency: "VND", rate: 175000 },
    "Pricing Scope:Ray sơn": {
      scope_name: "Ray sơn",
      members: [{ member_type: "Item", item_code: "RT_RAYHOP" }],
      disabled: false,
    },
    "Pricing Rule:Sơn vân gỗ — ray": {
      title: "Sơn vân gỗ — ray", price_list: "BG", rule_level: "LINE", apply_on: "ITEM_GROUP",
      pricing_scope: "Ray sơn", effect_type: "ADJUSTMENT", adjustment_basis: "LENGTH_M",
      adjustment_rate: 55000, currency: "VND", exclusive_group: "BE_MAT_RAY",
      conditions: [{ field: "color", operator: "eq", value: "VAN_GO" }],
      priority: 100, disabled: false,
    },
  }));
}

test("ray bán riêng ĐVT Mét: phụ thu sơn tính đúng qty làm chiều dài, không cần dòng nào gửi length_m", async () => {
  const preview = await previewSalesCommercialLine(
    args({
      line: { item_code: "RT_RAYHOP", uom: "Mét", qty: 3, color: "VAN_GO" },
      price_list: "BG", currency: "VND", customer_group: "Đại lý",
    }),
    context(rayMasters()),
  );
  assert.equal(preview.gross_amount_minor, 525_000, "175.000 × 3");
  assert.equal(preview.adjustment_amount_minor, 165_000, "55.000 × 3 mét — không phải 0");
  assert.ok(
    (preview.pricing_rule_snapshots ?? []).some((s) => s.rule_name === "Sơn vân gỗ — ray"),
    "luật phải xuất hiện trong snapshot, không được ngủ im lặng",
  );
});

test("ray không chọn màu vân gỗ: không phụ thu, không ném lỗi vì thiếu length_m", async () => {
  const preview = await previewSalesCommercialLine(
    args({
      line: { item_code: "RT_RAYHOP", uom: "Mét", qty: 3, color: "GHI SẦN" },
      price_list: "BG", currency: "VND", customer_group: "Đại lý",
    }),
    context(rayMasters()),
  );
  assert.equal(preview.adjustment_amount_minor ?? 0, 0);
});

/**
 * Phụ thu sơn ray cho cửa TRỌN BỘ — tick "Sơn ray" + chọn màu ngay trên chính dòng cửa (không
 * phải dòng ray riêng). Ray là cấu kiện ẩn trong BOM nên không có `qty`/`length_m` để mượn như
 * ray bán riêng; client đã ghi lại `ray_paint_length_m` từ đúng lượt xem BOM
 * (`alumdoor.sales.ray_paint_surcharge`), và ở đây CHỈ đọc lại con số đó — không tính lại BOM.
 *
 * Hai luật giá MỚI (không chung với hai luật của ray bán riêng, vì luật đó khoá theo
 * `pricing_scope` = phạm vi mặt hàng ray, còn cửa Trọn bộ không nằm trong phạm vi đó) khớp
 * bằng `conditions` trên chính các trường của dòng cửa: `sales_mode`, `ray_painted`, `ray_color`.
 */
function tronBoRayMasters() {
  return new Map(Object.entries({
    "Currency:VND": { currency_scale: 0 },
    "Item:TP-CUADL8D-TRONBO": {
      item_code: "TP-CUADL8D-TRONBO", item_group: "Cửa Đài Loan", door_type: "Cửa Đài Loan",
      inventory_mode: "Thành phẩm theo m2", measurement_profile: "Thành phẩm theo m2",
      stock_uom: "Bộ", default_sales_uom: "m2",
    },
    "Item Price:BG:TP-CUADL8D-TRONBO:m2": {
      price_list: "BG", item_code: "TP-CUADL8D-TRONBO", uom: "m2", price_variant: "STANDARD", currency: "VND", rate: 1_500_000,
    },
    "Pricing Rule:Sơn ray Trọn bộ — vân gỗ": {
      title: "Sơn ray Trọn bộ — vân gỗ", price_list: "BG", rule_level: "LINE", apply_on: "ITEM_GROUP",
      effect_type: "ADJUSTMENT", adjustment_basis: "LENGTH_M", adjustment_rate: 55000, currency: "VND",
      exclusive_group: "SON_RAY_TRON_BO",
      conditions: [
        { field: "sales_mode", operator: "eq", value: "Trọn bộ" },
        { field: "ray_painted", operator: "eq", value: 1 },
        { field: "ray_color", operator: "eq", value: "VAN_GO" },
      ],
      priority: 100, disabled: false,
    },
    "Pricing Rule:Sơn ray Trọn bộ — màu khác": {
      title: "Sơn ray Trọn bộ — màu khác", price_list: "BG", rule_level: "LINE", apply_on: "ITEM_GROUP",
      effect_type: "ADJUSTMENT", adjustment_basis: "LENGTH_M", adjustment_rate: 15000, currency: "VND",
      exclusive_group: "SON_RAY_TRON_BO",
      conditions: [
        { field: "sales_mode", operator: "eq", value: "Trọn bộ" },
        { field: "ray_painted", operator: "eq", value: 1 },
        { field: "ray_color", operator: "not_in", values: ["VÀNG KEM", "VÀNG KEM BÓNG", "GHI SẦN", "VAN_GO", "THÔ"] },
      ],
      priority: 50, disabled: false,
    },
  }));
}

test("Trọn bộ tick sơn ray vân gỗ: phụ thu tính đúng theo ray_paint_length_m, không phải diện tích cửa", async () => {
  const preview = await previewSalesCommercialLine(
    args({
      line: {
        item_code: "TP-CUADL8D-TRONBO", uom: "m2", qty: 9, set_count: 1,
        sales_mode: "Trọn bộ", ray_painted: 1, ray_color: "VAN_GO", ray_paint_length_m: 5.8,
      },
      price_list: "BG", currency: "VND", customer_group: "Đại lý",
    }),
    context(tronBoRayMasters()),
  );
  assert.equal(preview.gross_amount_minor, 13_500_000, "9 m² × 1.500.000");
  assert.equal(preview.adjustment_amount_minor, 319_000, "55.000 × 5,8 m ray — không phải theo m² cửa");
  assert.ok(
    (preview.pricing_rule_snapshots ?? []).some((s) => s.rule_name === "Sơn ray Trọn bộ — vân gỗ"),
    "luật Trọn bộ phải xuất hiện, không phải luật ray-bán-riêng",
  );
});

test("Trọn bộ chưa tick sơn ray: không phụ thu dù có ray_paint_length_m cũ còn sót lại", async () => {
  const preview = await previewSalesCommercialLine(
    args({
      line: {
        item_code: "TP-CUADL8D-TRONBO", uom: "m2", qty: 9, set_count: 1,
        sales_mode: "Trọn bộ", ray_painted: 0, ray_color: undefined, ray_paint_length_m: 5.8,
      },
      price_list: "BG", currency: "VND", customer_group: "Đại lý",
    }),
    context(tronBoRayMasters()),
  );
  assert.equal(preview.adjustment_amount_minor ?? 0, 0);
});

/**
 * Phụ vận chuyển cửa nhỏ (< 8 m²/bộ, Cửa Đức và Cửa Lưới) — luật đã tồn tại sẵn trong D1 thật
 * (`Phụ vận chuyển cửa dưới 8m² — Đức và Lưới`) và cấu hình đúng, nhưng điều kiện đọc trường
 * `area_per_set_sqm` — trường KHÔNG tồn tại trên schema Sales Order Item, nên client không bao
 * giờ gửi được và luật ngủ im lặng dù mọi thứ khác đúng (đêm 24/08, chủ xưởng báo "phụ thu không
 * nhảy theo kích cỡ"). Test đây mô phỏng ĐÚNG những gì client thật gửi: chỉ có `billable_area_sqm`
 * + `set_count`, không có `area_per_set_sqm` — server phải tự suy ra bằng `areaTierBasisSqm`.
 */
function transportSmallDoorMasters() {
  return new Map(Object.entries({
    "Currency:VND": { currency_scale: 0 },
    "Item:CUA-DUC-NHO": {
      item_code: "CUA-DUC-NHO", item_group: "Cửa CN Đức", door_type: "Cửa Đức",
      inventory_mode: "Thành phẩm theo m2", measurement_profile: "Thành phẩm theo m2",
      stock_uom: "Bộ", default_sales_uom: "m2",
    },
    "Item Price:BG:CUA-DUC-NHO:m2": {
      price_list: "BG", item_code: "CUA-DUC-NHO", uom: "m2", price_variant: "STANDARD", currency: "VND", rate: 800000,
    },
    "Pricing Scope:Cửa chịu phụ vận chuyển dưới 8m²": {
      scope_name: "Cửa chịu phụ vận chuyển dưới 8m²",
      members: [{ member_type: "Item Group", item_group: "Cửa CN Đức" }, { member_type: "Item Group", item_group: "Cửa Lưới" }],
      disabled: false,
    },
    "Pricing Rule:Phụ vận chuyển cửa dưới 8m² — Đức và Lưới": {
      title: "Phụ vận chuyển cửa dưới 8m² — Đức và Lưới", price_list: "BG", rule_level: "LINE", apply_on: "ITEM_GROUP",
      pricing_scope: "Cửa chịu phụ vận chuyển dưới 8m²", effect_type: "ADJUSTMENT", adjustment_basis: "SET_COUNT",
      adjustment_rate: 300000, currency: "VND", exclusive_group: "VAN_CHUYEN",
      conditions: [{ field: "area_per_set_sqm", operator: "lt", value: 8 }],
      priority: 100, disabled: false,
    },
  }));
}

test("phụ vận chuyển cửa nhỏ tính đúng KHÔNG CẦN client gửi area_per_set_sqm — chỉ có billable_area_sqm + set_count", async () => {
  const preview = await previewSalesCommercialLine(
    args({
      line: { item_code: "CUA-DUC-NHO", uom: "m2", qty: 6, set_count: 1, billable_area_sqm: 6 },
      price_list: "BG", currency: "VND", customer_group: "Đại lý",
    }),
    context(transportSmallDoorMasters()),
  );
  assert.equal(preview.adjustment_amount_minor, 300000);
  assert.ok(
    (preview.pricing_rule_snapshots ?? []).some((s) => s.rule_name === "Phụ vận chuyển cửa dưới 8m² — Đức và Lưới"),
    "luật vận chuyển cửa nhỏ phải xuất hiện, không được ngủ im lặng vì thiếu area_per_set_sqm",
  );
});

test("cửa từ 8 m²/bộ trở lên: không phụ thu vận chuyển, dù vẫn không gửi area_per_set_sqm", async () => {
  const preview = await previewSalesCommercialLine(
    args({
      line: { item_code: "CUA-DUC-NHO", uom: "m2", qty: 9, set_count: 1, billable_area_sqm: 9 },
      price_list: "BG", currency: "VND", customer_group: "Đại lý",
    }),
    context(transportSmallDoorMasters()),
  );
  assert.equal(preview.adjustment_amount_minor ?? 0, 0);
});

test("2 bộ cửa 3,5 m²/bộ (cả dòng 7 m²): vẫn dưới ngưỡng theo TỪNG bộ, không phải theo cả dòng", async () => {
  const preview = await previewSalesCommercialLine(
    args({
      line: { item_code: "CUA-DUC-NHO", uom: "m2", qty: 7, set_count: 2, billable_area_sqm: 7 },
      price_list: "BG", currency: "VND", customer_group: "Đại lý",
    }),
    context(transportSmallDoorMasters()),
  );
  assert.equal(preview.adjustment_amount_minor, 600000, "300.000 × 2 bộ, so đúng trục diện tích MỘT BỘ (3,5 m²), không phải cả dòng (7 m²)");
});
