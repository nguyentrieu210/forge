/** Ghi nhớ vài giá trị Link vừa chọn theo từng doctype đích (localStorage, client-only) — hiện
 * "Gần đây" trong dropdown khi ô tìm còn trống, đỡ phải gõ lại giá trị vừa dùng. */
const PREFIX = "mf-recent-link:";
const MAX = 5;

export interface RecentLinkEntry {
  value: string;
  description?: string;
}

export function loadRecentLinks(doctype: string): RecentLinkEntry[] {
  try {
    const raw = localStorage.getItem(PREFIX + doctype);
    return raw ? (JSON.parse(raw) as RecentLinkEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordRecentLink(doctype: string, entry: RecentLinkEntry): void {
  try {
    const next = [entry, ...loadRecentLinks(doctype).filter((e) => e.value !== entry.value)].slice(0, MAX);
    localStorage.setItem(PREFIX + doctype, JSON.stringify(next));
  } catch { /* private mode — bỏ qua, không phá chức năng chọn */ }
}
