/**
 * Lịch sử tìm kiếm gần đây theo doctype (localStorage) — gõ lại từ khoá vừa dùng không phải nhớ.
 * Client-only, KHÔNG gửi lên server: từ khoá tìm kiếm có thể chứa dữ liệu nhạy cảm (mã KH, số HĐ)
 * và Frappe không có doctype chuẩn nào để lưu việc này.
 */
const KEY_PREFIX = "mf-search-history:";
const MAX = 8;

export function loadSearchHistory(doctype: string): string[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + doctype);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Ghi 1 từ khoá — bỏ trùng (không phân biệt hoa/thường), đưa lên đầu, cắt còn MAX. */
export function recordSearch(doctype: string, q: string): string[] {
  const term = q.trim();
  if (!term) return loadSearchHistory(doctype);
  const lower = term.toLocaleLowerCase("vi");
  const next = [term, ...loadSearchHistory(doctype).filter((x) => x.toLocaleLowerCase("vi") !== lower)].slice(0, MAX);
  try { localStorage.setItem(KEY_PREFIX + doctype, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

export function clearSearchHistory(doctype: string): void {
  try { localStorage.removeItem(KEY_PREFIX + doctype); } catch { /* private mode */ }
}
