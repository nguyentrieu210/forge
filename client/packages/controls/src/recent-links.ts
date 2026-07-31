/**
 * Recent Link choices đã bị loại khỏi sản phẩm.
 *
 * Giữ hai hàm no-op để LinkCombobox cũ vẫn tương thích trong lúc tránh một diff khổng lồ ở
 * controls.tsx. Dropdown luôn nhận danh sách rỗng và lựa chọn mới không còn được ghi vào
 * localStorage. Key v2 cũ được dọn khi dropdown mở lần đầu.
 */
const LEGACY_PREFIX = "mf-recent-link:v2:";

export interface RecentLinkEntry {
  value: string;
  description?: string;
}

export function loadRecentLinks(doctype: string): RecentLinkEntry[] {
  try {
    localStorage.removeItem(LEGACY_PREFIX + doctype);
  } catch {
    // Storage bị chặn không ảnh hưởng chức năng Link.
  }
  return [];
}

export function recordRecentLink(_doctype: string, _entry: RecentLinkEntry): void {
  // Tính năng Lựa chọn gần đây đã bị loại: không lưu client-side history.
}
