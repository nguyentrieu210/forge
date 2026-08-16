/**
 * Danh mục Bề mặt + Màu vật tư chuẩn do chủ xưởng cung cấp (màu: 2026-07-30; vân gỗ + phụ thu:
 * BANG-GIA-CHINH-THUC-31-07-2026.md, chủ xưởng chốt lại 2026-08-16).
 *
 * Kiến trúc hội tụ 2026-08-16 — MỘT nguồn luật, không còn hai authority song song:
 *
 *   Surface Finish (Bề mặt)          Item Color (Màu)
 *   - applies_to_groups: RỘNG   ←──  - surface_finish: Link bắt buộc
 *   - applies_to_all_groups           - applies_to_groups: hẹp thêm NẾU cần (rỗng = kế thừa
 *     (chỉ THÔ dùng — khai tường          nguyên phạm vi của Bề mặt, KHÔNG phải wildcard)
 *      minh, không suy ngầm từ rỗng)
 *   - requires_color
 *
 * Fail-closed: một Bề mặt không applies_to_all_groups và applies_to_groups rỗng thì CHƯA dùng
 * được cho nhóm nào — không phải "áp dụng mọi nơi". Chỉ THÔ có lý do nghiệp vụ thật để global
 * (mọi Item đều có thể ở trạng thái thô trước khi hoàn thiện), nên nó khai tường minh
 * applies_to_all_groups=true thay vì để mảng rỗng ngầm hiểu là wildcard.
 *
 * Mã màu dùng chính tên đầy đủ. Các mã viết tắt chỉ tồn tại ở dữ liệu cũ và phải được quy đổi
 * trước khi ghi vào Link(Item Color), nếu không cùng một màu sẽ thành hai vị trí tồn.
 */

export const ALUMDOOR_SURFACE_FINISH_CATALOG = Object.freeze([
  {
    code: "THO",
    name: "THÔ",
    usageScope: "Mua hàng",
    requiresColor: false,
    // THÔ là trạng thái đầu vào của MỌI vật tư trước khi hoàn thiện — không có Item Group nào
    // hợp lý để loại trừ. Đây là trường hợp duy nhất dùng cờ tường minh, không phải suy ngầm từ
    // applies_to_groups rỗng (xem cảnh báo fail-closed ở đầu file).
    appliesToAllGroups: true,
    groups: [],
  },
  {
    code: "SON_TINH_DIEN",
    name: "SƠN TĨNH ĐIỆN",
    usageScope: "Mua & bán",
    requiresColor: true,
    // Nguồn: apps/alumdoor/docs/nguon/quy-cach/MS.md — "Cửa CN Đức, Úc, Siêu Trường, Đài
    // Loan, Lưới, Phụ kiện cần sơn tĩnh điện". Cây Item Group canonical đã có đúng leaf
    // "Phụ kiện cần sơn tĩnh điện", nên phạm vi Surface Finish phải chứa đủ 6 nhóm nguồn.
    groups: [
      "Cửa CN Đức",
      "Cửa tấm liền Úc",
      "Cửa Siêu Trường",
      "Cửa Đài Loan",
      "Cửa Lưới",
      "Phụ kiện cần sơn tĩnh điện",
    ],
  },
  {
    code: "MA_MAU",
    name: "MẠ MÀU",
    usageScope: "Mua & bán",
    requiresColor: true,
    // Hợp của phạm vi 5 màu mạ trong MS.md (mỗi màu còn tự thu hẹp riêng ở Item Color).
    groups: ["Cửa tấm liền Úc", "Cửa Đài Loan"],
  },
  {
    code: "SON_VAN_GO",
    name: "SƠN VÂN GỖ",
    usageScope: "Mua & bán",
    requiresColor: true,
    // Chủ xưởng chốt 2026-08-16: sơn vân gỗ áp dụng cho Cửa Đức + Úc + Siêu Trường + Đài Loan.
    // Cửa Lưới không nằm trong phạm vi này.
    groups: ["Cửa CN Đức", "Cửa tấm liền Úc", "Cửa Siêu Trường", "Cửa Đài Loan"],
  },
]);

const staticColor = (code, extra = {}) => ({
  code,
  name: code,
  finish: "SON_TINH_DIEN",
  // Rỗng = không thu hẹp thêm so với phạm vi 6 nhóm đã khai trên chính Surface Finish
  // SON_TINH_DIEN — nguồn MS.md liệt kê CÙNG một phạm vi cho cả 18 màu STĐ, nên không có lý do
  // khai lại ở từng màu.
  groups: [],
  ...extra,
});

const platedColor = (code, groups) => ({
  code,
  name: code,
  finish: "MA_MAU",
  // Khác STĐ: mỗi màu mạ áp phạm vi RIÊNG (theo đúng cột "Nhóm SP áp dụng" của MS.md), nên
  // Item Color phải thu hẹp thêm ở đây.
  groups,
});

export const ALUMDOOR_COLOR_CATALOG = Object.freeze([
  // THÔ không phải màu thương mại (Surface Finish.requires_color=false nên UI không hỏi màu
  // cho THÔ), nhưng vẫn giữ record Item Color THÔ cho tương thích lịch sử — Aluminium Lot /
  // Batch cũ còn Link tới đúng name "THÔ". Không xoá mù theo mục 8/9 của yêu cầu.
  { code: "THÔ", name: "THÔ", finish: "THO", groups: [], usageScope: "Mua hàng" },
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
  // Nghiệp vụ chốt: đúng MỘT màu cho SƠN VÂN GỖ. Không invent Óc chó/Sồi/Căm xe — chưa có
  // nguồn. Rỗng groups = kế thừa nguyên phạm vi 4 nhóm đã khai trên Surface Finish SON_VAN_GO.
  // Phụ thu 465.000đ/m² KHÔNG nằm ở đây — đi Pricing Rule.
  { code: "VAN_GO", name: "VÂN GỖ", finish: "SON_VAN_GO", groups: [], usageScope: "Mua & bán" },
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

/**
 * Item Color.finish CŨ (trước 2026-08-16) là Select text tự do 6 giá trị: Thô/Sơn tĩnh
 * điện/Anode/Vân gỗ/Mạ/Khác. Bốn giá trị có canonical Surface Finish quy đổi RÕ theo mục 5 của
 * yêu cầu hội tụ; "Anode" và "Khác" KHÔNG có canonical tương ứng — cố tình không map. Audit
 * local D1 ngày 2026-08-16 xác nhận không có documents/master_records nào tham chiếu hai giá trị
 * này, nên không cần migration; nếu chúng xuất hiện về sau phải audit/report lại, không đoán.
 */
export const ALUMDOOR_LEGACY_FINISH_MAP = Object.freeze(new Map([
  ["Thô", "THO"],
  ["Sơn tĩnh điện", "SON_TINH_DIEN"],
  ["Mạ", "MA_MAU"],
  ["Vân gỗ", "SON_VAN_GO"],
]));

export function canonicalAlumdoorColor(value) {
  const normalized = key(value);
  return ALUMDOOR_LEGACY_COLOR_MAP.get(normalized) ?? clean(value);
}

/**
 * Trả về mã Surface Finish, hoặc `undefined` nếu giá trị cũ không nằm trong 4 mã đã chốt — gọi
 * nơi dùng phải tự audit, không silently rơi về mặc định.
 */
export function canonicalAlumdoorFinish(value) {
  return ALUMDOOR_LEGACY_FINISH_MAP.get(clean(value));
}

export function alumdoorSurfaceFinishPayload(finish) {
  return {
    finish_code: finish.code,
    finish_name: finish.name,
    requires_color: Boolean(finish.requiresColor),
    applies_to_groups: (finish.groups ?? []).map((itemGroup, index) => ({
      row_id: `SCOPE-${String(index + 1).padStart(2, "0")}`,
      item_group: itemGroup,
    })),
    excluded_groups: (finish.excludedGroups ?? []).map((itemGroup, index) => ({
      row_id: `EX-GROUP-${String(index + 1).padStart(2, "0")}`,
      item_group: itemGroup,
    })),
    excluded_items: (finish.excludedItems ?? []).map((itemCode, index) => ({
      row_id: `EX-ITEM-${String(index + 1).padStart(2, "0")}`,
      item_code: itemCode,
    })),
    applies_to_all_groups: Boolean(finish.appliesToAllGroups),
    usage_scope: finish.usageScope ?? "Mua & bán",
    disabled: false,
  };
}

/** Chỉ phát field thật có khai trong schema Item Color — không phát field không tồn tại. */
export function alumdoorColorPayload(color) {
  return {
    color_code: color.code,
    color_name: color.name,
    surface_finish: color.finish,
    usage_scope: color.usageScope ?? "Mua & bán",
    applies_to_groups: color.groups.map((itemGroup, index) => ({
      row_id: `SCOPE-${String(index + 1).padStart(2, "0")}`,
      item_group: itemGroup,
    })),
    ...(color.supplierColorCode ? { supplier_color_code: color.supplierColorCode } : {}),
    disabled: false,
  };
}
