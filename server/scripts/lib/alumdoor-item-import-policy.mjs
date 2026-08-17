export const CANONICAL_UOMS = new Set([
  "Cái", "Bộ", "Kg", "Mét", "m2", "Cây", "Lá", "Thân", "Thanh",
  "Sợi", "Cuộn", "Tấm", "Túi", "Hộp", "Bình", "Lít", "Cặp", "Con",
]);

export const CANONICAL_ITEM_GROUPS = new Set([
  "Tất cả mặt hàng",
  "Cửa thành phẩm",
  "Motor & điện",
  "Phụ kiện & vật tư",
  "Cửa CN Đức",
  "Cửa tấm liền Úc",
  "Cửa Đài Loan",
  "Cửa Đài Loan Inox",
  "Cửa Siêu Trường",
  "Cửa Lưới",
  "Cửa kéo Đài Loan",
  "Motor",
  "Bình lưu điện",
  "Điều khiển & phụ kiện điện",
  "Linh kiện motor",
  "Nan/lá cửa",
  "Ray và trục",
  "Phụ kiện chung",
  "Phụ kiện CN Đức",
  "Phụ kiện cần sơn tĩnh điện",
]);

export function normalizeCanonicalItemGroup(value) {
  const raw = String(value ?? "").trim();
  const aliases = new Map([
    ["Cửa siêu trường", "Cửa Siêu Trường"],
    ["Phụ kiện", "Phụ kiện chung"],
    ["Mô tơ", "Motor"],
    ["Bộ lưu điện", "Bình lưu điện"],
    ["Remote và điều khiển", "Điều khiển & phụ kiện điện"],
  ]);
  const normalized = aliases.get(raw) ?? raw;
  if (!CANONICAL_ITEM_GROUPS.has(normalized)) {
    throw new Error(`Item Group '${raw || "(trống)"}' không thuộc Layer 0 canonical`);
  }
  return normalized;
}

export function assertSourceItemCodePreserved(sourceCode, itemCode, context = "Item") {
  const source = String(sourceCode ?? "").trim();
  const target = String(itemCode ?? "").trim();
  if (!source) throw new Error(`${context}: thiếu mã nguồn để kiểm tra identity`);
  if (!target) throw new Error(`${context}: thiếu item_code`);
  if (source !== target) {
    throw new Error(`${context}: item_code '${target}' khác mã nguồn gốc '${source}'`);
  }
  return target;
}

export function assertAtomicItemUom(value, context = "UOM") {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error(`${context}: thiếu UOM`);
  if (raw.includes("/")) {
    throw new Error(`${context}: '${raw}' là tỷ lệ/định mức BOM, không phải UOM Item`);
  }
  if (!CANONICAL_UOMS.has(raw)) {
    throw new Error(`${context}: UOM '${raw}' không thuộc Layer 0 canonical`);
  }
  return raw;
}

export function assertCanonicalItemPayload(payload) {
  if (!payload?.item_code) throw new Error("Item thiếu item_code");
  normalizeCanonicalItemGroup(payload.item_group);

  if (payload.is_stock_item) assertAtomicItemUom(payload.stock_uom, `${payload.item_code}.stock_uom`);
  if (payload.is_purchase_item) {
    assertAtomicItemUom(payload.default_purchase_uom, `${payload.item_code}.default_purchase_uom`);
  }
  if (payload.default_sales_uom) {
    assertAtomicItemUom(payload.default_sales_uom, `${payload.item_code}.default_sales_uom`);
  }

  if (payload.is_purchase_item && payload.stock_uom !== payload.default_purchase_uom) {
    const catchWeightOkay = payload.has_catch_weight === true
      && payload.weight_uom === payload.default_purchase_uom;
    const conversionOkay = Array.isArray(payload.uom_conversions)
      && payload.uom_conversions.some((row) => row?.uom === payload.default_purchase_uom);
    if (!catchWeightOkay && !conversionOkay) {
      throw new Error(
        `${payload.item_code}: ĐVT mua '${payload.default_purchase_uom}' khác ĐVT tồn '${payload.stock_uom}' `
        + "nhưng không có catch-weight hoặc conversion hợp lệ",
      );
    }
  }

  return payload;
}
