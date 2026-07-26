/** Danh sách "Gần đây" toàn cục (client-only, localStorage) — CommandPalette đã có sẵn UI hiện phần
 * này (props.recent, xem @metaforge/shell/CommandPalette) nhưng trước đây KHÔNG app nào cấp dữ liệu
 * thật. FormContainer tự ghi mỗi lần mở 1 bản ghi đã lưu; app đọc lại để feed awesomebar.recent. */
const KEY = "mf-recent-docs";
const MAX = 20;

export interface RecentDocEntry {
  doctype: string;
  name: string;
  title?: string;
  ts: number;
}

export function recordRecentDoc(doctype: string, name: string, title?: string): void {
  try {
    const list = loadRecentDocs().filter((e) => !(e.doctype === doctype && e.name === name));
    list.unshift({ doctype, name, title, ts: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch { /* private mode — bỏ qua, không phá luồng mở form */ }
}

export function loadRecentDocs(): RecentDocEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentDocEntry[]) : [];
  } catch {
    return [];
  }
}
