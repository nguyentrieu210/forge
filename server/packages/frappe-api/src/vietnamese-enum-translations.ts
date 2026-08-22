import { translateVietnameseSource } from "./vietnamese-translations.js";

/**
 * Display-only translations for first-party UI sources that are not normal ERP labels.
 *
 * Some app DocTypes intentionally keep stable English technical names for storage/API identity and
 * do not declare a separate `label`. Generic screens then fall back to `meta.name` for the title.
 * These entries localise that display title without renaming the DocType or changing Link targets.
 */
const uiTranslations: Readonly<Record<string, string>> = Object.freeze({
  "AlumDoor Attendance Day": "Ngày công",
  "AlumDoor Attendance Device": "Thiết bị chấm công",
  "AlumDoor Attendance Policy": "Chính sách chấm công",
  "AlumDoor Attendance Segment": "Đoạn ca chấm công",
  "AlumDoor HR Lite Settings": "Cấu hình nhân sự và lương",
  "AlumDoor Pay Profile": "Hồ sơ lương",
  "AlumDoor QR Station": "Trạm chấm công QR",
  "CRM Field Check-In": "Check-in hiện trường CRM",
  "Email chung": "Email dùng chung",
  "Sell-out": "Bán ra",
  "Slug": "Đường dẫn rút gọn",
  "Webhook URL": "URL webhook",
  "Support SLA Priority": "Mức ưu tiên SLA hỗ trợ",
  "Percent of Base": "Phần trăm mức cơ sở",
  "Finish-to-Start": "Hoàn thành rồi bắt đầu",
  "Start-to-Start": "Bắt đầu cùng bắt đầu",
  "Finish-to-Finish": "Hoàn thành cùng hoàn thành",
  "Start-to-Finish": "Bắt đầu rồi hoàn thành",
  "PriorPeriod": "Kỳ trước",
  "PriorYear": "Năm trước",
  "E-Invoice": "Hóa đơn điện tử",
  "Tax-specific": "Chuyên về thuế",
  "Payroll-specific": "Chuyên về tiền lương",
  "image-gallery": "Bộ sưu tập ảnh",
  "project-gallery": "Bộ sưu tập dự án",
  "product-grid": "Lưới sản phẩm",
  "storefront-catalog": "Danh mục cửa hàng",
  "business-landing": "Trang doanh nghiệp",
  "business-blue": "Xanh doanh nghiệp",
  "industrial-dark": "Tối công nghiệp",
});

/**
 * Display-only translations for enum-shaped Select values.
 *
 * Canonical DocType options are storage values. They must remain untouched in metadata/DB, while
 * the adapter exposes `optionLabels` for the translated text shown to users. This helper only
 * translates the source string returned by the translation service, so values such as MONTHLY,
 * DAILY or draft continue to be persisted exactly as defined by the DocType.
 */
const enumTranslations: Readonly<Record<string, string>> = Object.freeze({
  // Lifecycle / workflow
  draft: "Nháp",
  submitted: "Đã ghi sổ",
  cancelled: "Đã hủy",
  canceled: "Đã hủy",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  retired: "Ngừng áp dụng",
  active: "Đang hoạt động",
  inactive: "Ngừng hoạt động",
  enabled: "Đang bật",
  disabled: "Ngừng sử dụng",
  open: "Đang mở",
  closed: "Đã đóng",
  pending: "Đang chờ",
  complete: "Hoàn tất",
  completed: "Hoàn thành",
  failed: "Thất bại",
  success: "Thành công",
  error: "Lỗi",
  stopped: "Đã dừng",
  overdue: "Quá hạn",
  on_hold: "Tạm giữ",
  in_progress: "Đang xử lý",
  not_started: "Chưa bắt đầu",
  exception: "Ngoại lệ",
  locked: "Đã khóa",
  revoked: "Đã thu hồi",
  corrected: "Đã hiệu chỉnh",
  empty: "Chưa có dữ liệu",
  missing_in: "Thiếu giờ vào",
  missing_out: "Thiếu giờ ra",

  // Payment / document states
  paid: "Đã thanh toán",
  unpaid: "Chưa thanh toán",
  partly_paid: "Thanh toán một phần",
  returned: "Đã trả lại",
  return: "Trả lại",

  // Boolean / choice values
  yes: "Có",
  no: "Không",
  true: "Có",
  false: "Không",
  male: "Nam",
  female: "Nữ",
  other: "Khác",

  // Frequencies / payroll modes
  hourly: "Theo giờ",
  daily: "Theo ngày",
  weekly: "Theo tuần",
  monthly: "Theo tháng",
  quarterly: "Theo quý",
  yearly: "Theo năm",
  annually: "Hàng năm",
  biweekly: "Hai tuần/lần",
  semimonthly: "Nửa tháng/lần",

  // Geometry profile authoring. Canonical storage values stay English; only UI labels are Vietnamese.
  input: "Nhập liệu",
  calculated: "Tự tính",
  info: "Thông tin",
  width: "Chiều rộng",
  height: "Chiều cao",
  length: "Chiều dài",

  // Cutting Policy operators. Storage stays COPY/SUBTRACT/ADD.
  copy: "Giữ nguyên",
  subtract: "Trừ",
  add: "Cộng",

  // Attendance codes shown in Select controls. Values remain SHIFT1/SHIFT2/SHIFT3 in storage.
  shift1: "Ca 1",
  shift2: "Ca 2",
  shift3: "Ca 3",
  absent: "Vắng mặt",
  one_time: "Một lần",
  cross_functional: "Liên phòng ban",
  lab: "Phòng thí nghiệm",
  cta: "Nút kêu gọi",
  neutral: "Trung tính",
  muted: "Dịu",
  dark: "Tối",
  left: "Trái",
  warm: "Ấm",
  serif: "Có chân",
  rounded: "Bo tròn",
  square: "Vuông",
  soft: "Mềm",
  round: "Tròn",
  compact: "Gọn",
  comfortable: "Thoáng",
  touch: "Cảm ứng",
  "not_requested": "Chưa yêu cầu",
});

const enumWords: Readonly<Record<string, string>> = Object.freeze({
  active: "hoạt động",
  approved: "đã duyệt",
  cancelled: "đã hủy",
  canceled: "đã hủy",
  closed: "đóng",
  complete: "hoàn tất",
  completed: "hoàn thành",
  corrected: "đã hiệu chỉnh",
  daily: "theo ngày",
  disabled: "ngừng sử dụng",
  draft: "nháp",
  empty: "chưa có dữ liệu",
  enabled: "đang bật",
  exception: "ngoại lệ",
  failed: "thất bại",
  hold: "tạm giữ",
  hourly: "theo giờ",
  inactive: "ngừng hoạt động",
  in: "vào",
  locked: "đã khóa",
  missing: "thiếu",
  monthly: "theo tháng",
  no: "không",
  not: "chưa",
  open: "mở",
  out: "ra",
  paid: "đã thanh toán",
  partly: "một phần",
  pending: "đang chờ",
  progress: "xử lý",
  quarterly: "theo quý",
  rejected: "từ chối",
  retired: "ngừng áp dụng",
  returned: "đã trả lại",
  revoked: "đã thu hồi",
  started: "bắt đầu",
  stopped: "đã dừng",
  submitted: "đã ghi sổ",
  unpaid: "chưa thanh toán",
  weekly: "theo tuần",
  yearly: "theo năm",
  yes: "có",
});

function canonicalEnumKey(text: string): string {
  return text.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/_+/g, "_");
}

function isEnumShaped(text: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9]*(?:[_ -][A-Za-z0-9]+)*$/.test(text)) return false;
  return text === text.toUpperCase() || text === text.toLowerCase() || /[_-]/.test(text);
}

/** Translate a generic UI source, including first-party titles and enum-style Select options. */
export function translateVietnameseUiSource(source: string): string {
  const raw = String(source ?? "");
  const text = raw.trim();
  if (!text) return raw;

  const uiExact = uiTranslations[text];
  if (uiExact) return uiExact;

  // Exact enum labels are curated display contracts and must win over the broader ERP fallback,
  // regardless of input casing (e.g. revoked / Revoked / REVOKED).
  const exact = enumTranslations[canonicalEnumKey(text)];
  if (exact) return exact;

  const ordinary = translateVietnameseSource(raw);
  if (ordinary !== raw) return ordinary;

  if (!isEnumShaped(text)) return raw;

  const tokens = canonicalEnumKey(text).split("_").filter(Boolean);
  if (!tokens.length || tokens.some((token) => !enumWords[token])) return raw;
  return tokens.map((token) => enumWords[token]!).join(" ");
}

export const VIETNAMESE_ENUM_TRANSLATIONS = enumTranslations;
export const VIETNAMESE_UI_TRANSLATIONS = uiTranslations;
