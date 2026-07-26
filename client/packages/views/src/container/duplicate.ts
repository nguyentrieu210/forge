/**
 * Handoff Nhân bản (Duplicate) qua sessionStorage — FormContainer (bản đang mở) stash giá trị,
 * NewFormContainer (form "new" mở ngay sau đó qua điều hướng) tự tiêu thụ 1 LẦN rồi xoá. Không dùng
 * React context/route state vì "new" luôn là URL riêng, độc lập route hiện tại.
 */
const PREFIX = "mf-duplicate:";

/** System field không nên copy sang bản nhân bản (định danh/trạng thái workflow/audit của BẢN GỐC). */
const SYSTEM_FIELDS = new Set([
  "name", "owner", "creation", "modified", "modified_by", "docstatus", "idx",
  "_user_tags", "_comments", "_assign", "_liked_by", "lft", "rgt", "old_parent",
  "workflow_state",
]);

export function stashDuplicate(doctype: string, doc: Record<string, unknown>): void {
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (SYSTEM_FIELDS.has(k) || k.startsWith("__")) continue;
    values[k] = v;
  }
  try { sessionStorage.setItem(PREFIX + doctype, JSON.stringify(values)); } catch { /* private mode — bỏ qua, form new vẫn mở được, chỉ không prefill */ }
}

/** Tiêu thụ 1 LẦN — gọi lại lần 2 trả undefined (tránh prefill lặp lại khi form "new" re-render). */
export function consumeDuplicate(doctype: string): Record<string, unknown> | undefined {
  try {
    const raw = sessionStorage.getItem(PREFIX + doctype);
    if (!raw) return undefined;
    sessionStorage.removeItem(PREFIX + doctype);
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
