import { translateVietnameseSource } from "./vietnamese-translations.js";

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
  completed: "Hoàn thành",
  failed: "Thất bại",
  success: "Thành công",
  error: "Lỗi",
  stopped: "Đã dừng",
  overdue: "Quá hạn",
  on_hold: "Tạm giữ",
  in_progress: "Đang xử lý",
  not_started: "Chưa bắt đầu",

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
});

const enumWords: Readonly<Record<string, string>> = Object.freeze({
  active: "hoạt động",
  approved: "đã duyệt",
  cancelled: "đã hủy",
  canceled: "đã hủy",
  closed: "đóng",
  completed: "hoàn thành",
  daily: "theo ngày",
  disabled: "ngừng sử dụng",
  draft: "nháp",
  enabled: "đang bật",
  failed: "thất bại",
  hold: "tạm giữ",
  hourly: "theo giờ",
  inactive: "ngừng hoạt động",
  in: "đang",
  monthly: "theo tháng",
  no: "không",
  not: "chưa",
  open: "mở",
  paid: "đã thanh toán",
  partly: "một phần",
  pending: "đang chờ",
  progress: "xử lý",
  quarterly: "theo quý",
  rejected: "từ chối",
  retired: "ngừng áp dụng",
  returned: "đã trả lại",
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

/** Translate a generic UI source, including case/underscore enum variants used by Select options. */
export function translateVietnameseUiSource(source: string): string {
  const raw = String(source ?? "");
  const text = raw.trim();
  if (!text) return raw;

  const ordinary = translateVietnameseSource(raw);
  if (ordinary !== raw) return ordinary;

  const exact = enumTranslations[canonicalEnumKey(text)];
  if (exact) return exact;
  if (!isEnumShaped(text)) return raw;

  const tokens = canonicalEnumKey(text).split("_").filter(Boolean);
  if (!tokens.length || tokens.some((token) => !enumWords[token])) return raw;
  return tokens.map((token) => enumWords[token]!).join(" ");
}

export const VIETNAMESE_ENUM_TRANSLATIONS = enumTranslations;
