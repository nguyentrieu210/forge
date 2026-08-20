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
