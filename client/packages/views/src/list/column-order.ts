/**
 * Thứ tự cột do người dùng tự sắp (kéo-thả header) — lưu localStorage THEO DOCTYPE.
 * Client-only: KHÔNG ghi vào "List View Settings"/"Property Setter" của Frappe vì đó là cấu hình
 * DÙNG CHUNG cả site (một người kéo là đổi cho mọi người) — sở thích cá nhân phải để cục bộ.
 */
const KEY_PREFIX = "mf-col-order:";

export function loadColumnOrder(doctype: string): string[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + doctype);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return []; // private mode / JSON hỏng → coi như chưa tuỳ chỉnh
  }
}

export function saveColumnOrder(doctype: string, order: string[]): void {
  try { localStorage.setItem(KEY_PREFIX + doctype, JSON.stringify(order)); } catch { /* private mode */ }
}

export function clearColumnOrder(doctype: string): void {
  try { localStorage.removeItem(KEY_PREFIX + doctype); } catch { /* private mode */ }
}

/**
 * Áp thứ tự đã lưu lên danh sách cột suy từ meta. Cột KHÔNG có trong `order` (field mới thêm vào
 * DocType sau khi user đã sắp) rơi xuống cuối nhưng GIỮ NGUYÊN thứ tự tương đối gốc — Array.sort
 * ổn định (ES2019+) nên không cần index phụ.
 */
export function applyColumnOrder<T extends { fieldname: string }>(cols: T[], order: string[]): T[] {
  if (order.length === 0) return cols;
  const rank = new Map(order.map((f, i) => [f, i] as const));
  return [...cols].sort((a, b) => {
    const ra = rank.get(a.fieldname);
    const rb = rank.get(b.fieldname);
    if (ra === undefined && rb === undefined) return 0;
    if (ra === undefined) return 1;
    if (rb === undefined) return -1;
    return ra - rb;
  });
}

/** Chuyển `from` tới đúng vị trí của `to` (chèn trước/sau tuỳ hướng kéo), giữ nguyên phần còn lại. */
export function moveColumn(order: string[], from: string, to: string): string[] {
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(to);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return order;
  const next = [...order];
  next.splice(fromIdx, 1);
  // toIdx tính trên mảng GỐC; sau khi gỡ `from` ở trước nó thì đích lùi 1 ô.
  next.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, from);
  return next;
}
