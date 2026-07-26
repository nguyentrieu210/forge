/**
 * i18n source-string translator (Gate 4, P1-12) — MÔ HÌNH FRAPPE: dịch theo CHUỖI NGUỒN
 * (không phải key tuỳ ý). `__(text, replace?, context?)` tra catalog cho lang hiện tại:
 *   context ⇒ khoá `${context}:${text}`; ngược lại khoá `text`; thiếu ⇒ trả nguyên `text`.
 * Đây là cơ chế dịch cho DỮ LIỆU từ server (label field, message, tên doctype…). Chrome khung
 * dùng i18n key-based riêng ở @metaforge/shell. Catalog do adapter nạp (frappe.translate) — tiêm vào.
 */

/** Catalog 1 ngôn ngữ: chuỗi nguồn (hoặc `context:chuỗi`) → bản dịch. */
export type TranslationCatalog = Record<string, string>;

/**
 * formatMessage — thay {0}/{1} (mảng) · {} (tự tăng) · {name} (object), giống frappe format().
 * Thiếu tham số → giữ nguyên `{...}` (không nuốt) để lỗi dịch dễ thấy.
 */
export function formatMessage(str: string, args?: unknown[] | Record<string, unknown>): string {
  if (args == null) return str;
  let auto = 0;
  return str.replace(/\{(\w*)\}/g, (match, rawKey: string) => {
    const key = rawKey === "" ? String(auto++) : rawKey;
    const val = Array.isArray(args) ? args[Number(key)] : (args as Record<string, unknown>)[key];
    return val === undefined || val === null ? match : String(val);
  });
}

/** Hàm dịch `__` gắn với 1 catalog (đóng gói theo lang). */
export type TranslateFn = (text: string, replace?: unknown[] | Record<string, unknown>, context?: string) => string;

/** makeTranslator(catalog) → `__` theo mô hình Frappe. Catalog rỗng ⇒ trả nguyên chuỗi nguồn. */
export function makeTranslator(catalog: TranslationCatalog = {}): TranslateFn {
  return function __(text, replace, context) {
    if (!text || typeof text !== "string") return text;
    let translated = "";
    if (context) translated = catalog[`${context}:${text}`] ?? "";
    if (!translated) translated = catalog[text] ?? text;
    if (replace && typeof replace === "object") translated = formatMessage(translated, replace as never);
    return translated;
  };
}
