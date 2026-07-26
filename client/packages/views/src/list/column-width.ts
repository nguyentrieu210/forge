/**
 * Bề rộng cột do người dùng tự kéo — lưu localStorage THEO DOCTYPE.
 *
 * Cục bộ chứ không ghi vào "List View Settings" của Frappe, cùng lý do với thứ tự cột
 * ([[column-order]]): đó là cấu hình dùng chung cả site, một người kéo là đổi cho mọi người.
 * Bề rộng cột là sở thích cá nhân và phụ thuộc màn hình từng người.
 */
const KEY_PREFIX = "mf-col-width:";

/** Giới hạn để cột không bị kéo mất hẳn hoặc rộng đến mức đẩy hết cột khác ra ngoài. */
export const MIN_COL_WIDTH = 60;
export const MAX_COL_WIDTH = 720;

export type ColumnWidths = Record<string, number>;

export function loadColumnWidths(doctype: string): ColumnWidths {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + doctype);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ColumnWidths = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Lọc lại lúc ĐỌC, không chỉ lúc ghi: localStorage người dùng sửa được bằng tay, và bản
      // lưu từ phiên bản cũ có thể mang giá trị ngoài khoảng hiện tại.
      if (typeof v === "number" && Number.isFinite(v)) out[k] = clampWidth(v);
    }
    return out;
  } catch {
    return {}; // chế độ riêng tư / JSON hỏng → coi như chưa tuỳ chỉnh
  }
}

export function saveColumnWidths(doctype: string, widths: ColumnWidths): void {
  try { localStorage.setItem(KEY_PREFIX + doctype, JSON.stringify(widths)); } catch { /* private mode */ }
}

export function clearColumnWidths(doctype: string): void {
  try { localStorage.removeItem(KEY_PREFIX + doctype); } catch { /* private mode */ }
}

export function clampWidth(px: number): number {
  return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(px)));
}
