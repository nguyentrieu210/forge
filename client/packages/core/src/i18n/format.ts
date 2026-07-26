/**
 * Locale format (Gate 4, P1-16) — số/tiền tệ/ngày theo cấu hình vùng (giống Frappe format_number /
 * format_currency / datetime). Nguồn cấu hình = sys_defaults (number_format, currency, date_format,
 * float_precision) do boot cấp — TIÊM vào, KHÔNG hardcode. Thuần hàm, dễ test.
 */

/** Cấu hình locale (từ boot sysdefaults) — nguồn DUY NHẤT cho mọi formatter (LocaleContext). */
export interface LocaleConfig {
  numberFormat?: string; // sysdefaults.number_format, vd "#,###.##"
  currency?: string; // sysdefaults.currency (ISO code); symbol map để ngoài (currencySymbol)
  currencySymbol?: string; // ký hiệu hiển thị (₫, $, …) nếu app cấp
  dateFormat?: string; // sysdefaults.date_format, vd "dd-mm-yyyy"
  floatPrecision?: number; // sysdefaults.float_precision
  /**
   * sysdefaults.currency_precision — số lẻ RIÊNG cho tiền, tách khỏi floatPrecision.
   *
   * Cần tách vì hai thứ này khác nhau thật: VND không dùng phần lẻ (1.234.567 ₫), trong khi số
   * lượng vẫn cần 2 số lẻ (12,5 kg). Dùng chung một con số thì hoặc mọi giá tiền hiện thừa ",00",
   * hoặc số lượng bị làm tròn mất phần lẻ.
   *
   * Giá trị 0 là HỢP LỆ và phải được tôn trọng — mọi chỗ đọc nó đều dùng `??`, không dùng `||`.
   * (Frappe phía server dính đúng bẫy này: `cint("0")` ra 0 nên bị coi như chưa đặt, và VND vẫn
   * hiện ",00".)
   */
  currencyPrecision?: number;
}

/** Bộ formatter đã gắn config — dùng thống nhất ở Form/List/child/report/Builder. */
export interface BoundFormatters {
  number: (value: number | string | null | undefined, precision?: number) => string;
  currency: (value: number | string | null | undefined, precision?: number) => string;
  date: (value: string | Date | null | undefined) => string;
  duration: (seconds: number | string | null | undefined, opts?: DurationOpts) => string;
  config: LocaleConfig;
}

/** makeLocaleFormat — dựng bộ formatter từ 1 LocaleConfig (thuần; provider chỉ bọc React). */
export function makeLocaleFormat(config: LocaleConfig = {}): BoundFormatters {
  const nf = config.numberFormat;
  const prec = config.floatPrecision;
  // `??` chứ KHÔNG `||`: currencyPrecision = 0 là giá trị thật (VND không có phần lẻ), dùng `||`
  // sẽ nuốt mất số 0 và rơi về floatPrecision — mọi giá tiền lại hiện thừa ",00".
  const cprec = config.currencyPrecision ?? prec;
  const df = config.dateFormat || "yyyy-mm-dd";
  const sym = config.currencySymbol ?? "";
  return {
    number: (v, p) => formatNumber(v, nf, p ?? prec),
    currency: (v, p) => formatCurrency(v, sym, nf, p ?? cprec),
    date: (v) => formatDate(v, df),
    duration: (s, opts) => formatDuration(s, opts),
    config,
  };
}

export interface NumberFormatInfo {
  /** ký tự thập phân (".", ","). "" ⇒ không phần thập phân. */
  decimal: string;
  /** ký tự nhóm hàng nghìn (",", ".", " ", "'"). */
  group: string;
  /** số chữ số thập phân mặc định. */
  precision: number;
  /** nhóm kiểu Ấn Độ (lakh: 2,2,3) khi format = "#,##,###.##". */
  indian: boolean;
}

/** Bảng number_format của Frappe (subset phổ biến) + fallback "#,###.##". */
const NUMBER_FORMATS: Record<string, NumberFormatInfo> = {
  "#,###.##": { decimal: ".", group: ",", precision: 2, indian: false },
  "#.###,##": { decimal: ",", group: ".", precision: 2, indian: false },
  "# ###.##": { decimal: ".", group: " ", precision: 2, indian: false },
  "# ###,##": { decimal: ",", group: " ", precision: 2, indian: false },
  "#'###.##": { decimal: ".", group: "'", precision: 2, indian: false },
  "#,##,###.##": { decimal: ".", group: ",", precision: 2, indian: true },
  "#,###.###": { decimal: ".", group: ",", precision: 3, indian: false },
  "#.###": { decimal: "", group: ".", precision: 0, indian: false },
  "#,###": { decimal: "", group: ",", precision: 0, indian: false },
};

export function getNumberFormatInfo(format?: string): NumberFormatInfo {
  return (format && NUMBER_FORMATS[format]) || NUMBER_FORMATS["#,###.##"]!;
}

/** Nhóm phần nguyên: chuẩn 3 chữ số, hoặc Ấn Độ (3 rồi từng 2). */
function groupInteger(intDigits: string, sep: string, indian: boolean): string {
  if (!sep) return intDigits;
  if (!indian) return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  // Ấn Độ: nhóm cuối 3, các nhóm trước 2 — "1234567" → "12,34,567"
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3);
  if (!rest) return last3;
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, sep) + sep + last3;
}

/**
 * formatNumber — value theo number_format + precision (mặc định theo format).
 * precision override (vd field.precision) thắng precision của format.
 */
export function formatNumber(value: number | string | null | undefined, format?: string, precision?: number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return "";
  const info = getNumberFormatInfo(format);
  const p = precision ?? info.precision;
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(p);
  const [intPart, decPart] = fixed.split(".");
  let out = groupInteger(intPart!, info.group, info.indian);
  if (p > 0 && decPart) out += info.decimal + decPart;
  return neg ? "-" + out : out;
}

/** formatCurrency — symbol + số (symbol đứng trước, cách 1 space; âm giữ dấu trước symbol). */
export function formatCurrency(
  value: number | string | null | undefined,
  symbol = "",
  format?: string,
  precision?: number,
): string {
  const num = formatNumber(value, format, precision);
  if (num === "") return "";
  if (!symbol) return num;
  if (num.startsWith("-")) return "-" + symbol + " " + num.slice(1);
  return symbol + " " + num;
}

// ── Duration (canonical) ─────────────────────────────────────────────────────
// Frappe lưu Duration = SỐ GIÂY (integer). UI có thể nhập ngày/giờ/phút/giây; parse/format
// PHẢI round-trip không mất dữ liệu. Đây là representation chuẩn (Gate 4 P?) — widget đầy đủ để sau.
const _DAY = 86400, _HOUR = 3600, _MIN = 60;

export interface DurationOpts {
  /** ẩn thành phần ngày → gộp vào giờ (Frappe hide_days). */
  hideDays?: boolean;
  /** ẩn thành phần giây (Frappe hide_seconds). */
  hideSeconds?: boolean;
}

/** formatDuration — giây → "1d 2h 3m 4s" (bỏ thành phần 0; luôn có ít nhất 1 thành phần). */
export function formatDuration(seconds: number | string | null | undefined, opts?: DurationOpts): string {
  let s = Math.max(0, Math.round(Number(seconds) || 0));
  const parts: string[] = [];
  if (!opts?.hideDays) { const d = Math.floor(s / _DAY); if (d) parts.push(`${d}d`); s -= d * _DAY; }
  const h = Math.floor(s / _HOUR); if (h) parts.push(`${h}h`); s -= h * _HOUR;
  const m = Math.floor(s / _MIN); if (m) parts.push(`${m}m`); s -= m * _MIN;
  if (!opts?.hideSeconds) { if (s || parts.length === 0) parts.push(`${s}s`); }
  else if (parts.length === 0) parts.push("0m");
  return parts.join(" ");
}

/** parseDuration — "1d 2h 3m 4s" | "90m" | số giây thuần → GIÂY (integer). Không hợp lệ → 0. */
export function parseDuration(input: number | string | null | undefined): number {
  if (typeof input === "number") return Math.max(0, Math.round(input));
  const str = String(input ?? "").trim();
  if (!str) return 0;
  if (/^\d+(\.\d+)?$/.test(str)) return Math.round(Number(str)); // số thuần = giây
  let total = 0; let matched = false;
  const re = /(\d+(?:\.\d+)?)\s*([dhms])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str))) {
    matched = true;
    const v = Number(m[1]);
    const u = m[2]!.toLowerCase();
    total += u === "d" ? v * _DAY : u === "h" ? v * _HOUR : u === "m" ? v * _MIN : v;
  }
  return matched ? Math.round(total) : 0;
}

/** date_format Frappe (yyyy-mm-dd, dd-mm-yyyy, mm/dd/yyyy, dd/mm/yyyy…) → hàm format. */
export function formatDate(value: string | Date | null | undefined, dateFormat = "yyyy-mm-dd"): string {
  if (!value) return "";
  // chấp nhận "YYYY-MM-DD" hoặc "YYYY-MM-DD HH:mm:ss" hoặc Date.
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return String(value);
  const [, yyyy, mm, dd] = m;
  return dateFormat
    .replace(/yyyy/gi, yyyy!)
    .replace(/mm/g, mm!)
    .replace(/dd/g, dd!);
}
