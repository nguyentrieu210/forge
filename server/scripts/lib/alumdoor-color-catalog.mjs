/**
 * Danh mục màu chuẩn do chủ xưởng cung cấp ngày 2026-07-30.
 *
 * Mã màu dùng chính tên đầy đủ. Các mã viết tắt chỉ tồn tại ở dữ liệu cũ và phải được
 * quy đổi trước khi ghi vào Link(Item Color), nếu không cùng một màu sẽ thành hai vị trí tồn.
 */

const STATIC_GROUPS = [
  "Cửa CN Đức",
  "Cửa tấm liền Úc",
  "Cửa siêu trường",
  "Cửa Đài Loan",
  "Cửa kéo Đài Loan",
  "Cửa Lưới",
  "Phụ kiện",
  "Phụ kiện CN Đức",
];

const staticColor = (code, extra = {}) => ({
  code,
  name: code,
  finish: "Sơn tĩnh điện",
  groups: STATIC_GROUPS,
  ...extra,
});

const platedColor = (code, groups) => ({
  code,
  name: code,
  finish: "Mạ",
  groups,
});

export const ALUMDOOR_COLOR_CATALOG = Object.freeze([
  { code: "THÔ", name: "THÔ", finish: "Thô", groups: [] },
  staticColor("CAFÉ"),
  staticColor("XANH NGỌC"),
  staticColor("MIDNIGHT BLUE"),
  staticColor("TRẮNG", { supplierColorCode: "9512" }),
  staticColor("XÁM MỜ"),
  staticColor("VÀNG KEM"),
  staticColor("GHI SẦN"),
  staticColor("NÂU XINGFA"),
  staticColor("XÁM XINGFA"),
  staticColor("ĐEN XINGFA"),
  staticColor("VÀNG KEM BÓNG"),
  staticColor("XANH NGỌC BÓNG"),
  staticColor("XANH LÁ CÂY"),
  staticColor("XÁM LÔNG CHUỘT"),
  staticColor("CAM"),
  staticColor("ĐỎ ĐÔ", { supplierColorCode: "4004" }),
  staticColor("KEM SỮA"),
  staticColor("XANH DƯƠNG"),
  platedColor("XANH NGỌC - VÀNG KEM", ["Cửa tấm liền Úc", "Cửa Đài Loan"]),
  platedColor("XÁM - TRẮNG", ["Cửa tấm liền Úc"]),
  platedColor("GHI ÚC - KEM ÚC", ["Cửa tấm liền Úc"]),
  platedColor("XANH RÊU - CAFÉ", ["Cửa tấm liền Úc"]),
  platedColor("XÁM - XANH NGỌC", ["Cửa Đài Loan"]),
]);

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value) => clean(value).normalize("NFC").toLocaleUpperCase("vi");

export const ALUMDOOR_LEGACY_COLOR_MAP = Object.freeze(new Map([
  ["GS", "GHI SẦN"],
  ["VK", "VÀNG KEM"],
  ["CF", "CAFÉ"],
  ["XF", "XÁM XINGFA"],
  ["4004", "ĐỎ ĐÔ"],
  ["9512", "TRẮNG"],
  ["9512 ( TRẮNG )", "TRẮNG"],
  ["XN-VK", "XANH NGỌC - VÀNG KEM"],
  ["GU-KU", "GHI ÚC - KEM ÚC"],
  ["KU-GU", "GHI ÚC - KEM ÚC"],
  ["XR-CF", "XANH RÊU - CAFÉ"],
]));

export function canonicalAlumdoorColor(value) {
  const normalized = key(value);
  return ALUMDOOR_LEGACY_COLOR_MAP.get(normalized) ?? clean(value);
}

export function alumdoorColorPayload(color) {
  return {
    color_code: color.code,
    color_name: color.name,
    finish: color.finish,
    applies_to_groups: color.groups.map((itemGroup, index) => ({
      row_id: `SCOPE-${String(index + 1).padStart(2, "0")}`,
      item_group: itemGroup,
    })),
    ...(color.supplierColorCode ? { supplier_color_code: color.supplierColorCode } : {}),
    note: "Bảng màu chuẩn do chủ xưởng cung cấp ngày 2026-07-30.",
    disabled: false,
    _migration_source: "alumdoor-color-catalog-2026-07-30",
  };
}
