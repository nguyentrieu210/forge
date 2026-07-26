/**
 * link-query — dựng bộ lọc cho Link search từ metadata field + ngữ cảnh doc (P0-09, Gate 3).
 *
 * Frappe lưu bộ lọc Link tĩnh ở `field.link_filters` = JSON mảng điều kiện kiểu
 *   [[<doctype>, <fieldname>, <operator>, <value>], ...].
 * `value` có thể là "eval:<expr>" → giá trị phụ thuộc doc hiện tại (dependent/context filter),
 * ta đánh giá bằng safeEval (ALLOWLIST, KHÔNG new Function) trên scope { doc }.
 *
 * Ngoài phạm vi (đã ghi KNOWN_GAPS): custom get_query (client-script method) — MetaForge headless
 * không chạy client script; chỉ honour link_filters (metadata). Sai định dạng ⇒ bỏ qua (fail-safe):
 * Link vẫn tìm được, chỉ là không áp được điều kiện đó — KHÔNG ném.
 */
import type { DocField } from "../types/meta.js";
import { safeEval } from "./safe-eval.js";

const EVAL_PREFIX = "eval:";

/** cảnh báo 1 lần cho mỗi input lỗi (buildLinkFilters chạy mỗi render → tránh spam) — không nuốt lỗi config. */
const _warned = new Set<string>();
function warnOnce(key: string, msg: string): void {
  if (_warned.has(key)) return;
  _warned.add(key);
  if (typeof console !== "undefined") console.warn(`[metaforge] link_filters: ${msg}`);
}

/**
 * buildLinkFilters — Filters (dạng dict Frappe) cho search_link từ field.link_filters + doc.
 * op "=" → { field: value }; op khác → { field: [op, value] }. Rỗng/không hợp lệ → undefined.
 */
export function buildLinkFilters(
  field: DocField,
  docValues?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const raw = field.link_filters;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;

  let conds: unknown;
  try {
    conds = JSON.parse(raw);
  } catch {
    warnOnce(raw, `JSON không hợp lệ, bỏ lọc: ${raw.slice(0, 80)}`);
    return undefined; // JSON hỏng → không lọc (fail-safe) nhưng ĐÃ cảnh báo
  }
  if (!Array.isArray(conds) || conds.length === 0) return undefined;

  const out: Record<string, unknown> = {};
  for (const cond of conds) {
    if (!Array.isArray(cond) || cond.length < 4) continue;
    const fieldname = cond[1];
    const op = cond[2];
    let value = cond[3];
    if (typeof fieldname !== "string" || typeof op !== "string") continue;

    if (typeof value === "string" && value.startsWith(EVAL_PREFIX)) {
      try {
        value = safeEval(value.slice(EVAL_PREFIX.length), { doc: docValues ?? {} });
      } catch {
        warnOnce(value, `biểu thức eval ngoài allowlist, bỏ điều kiện: ${value.slice(0, 80)}`);
        continue; // biểu thức ngoài allowlist → bỏ điều kiện này (không lộ, không ném) — ĐÃ cảnh báo
      }
      // ngữ cảnh chưa set (field phụ thuộc còn rỗng) → KHÔNG ràng buộc (tránh "0 kết quả" khó hiểu).
      if (value === undefined) continue;
    }
    out[fieldname] = op === "=" ? value : [op, value];
  }
  return Object.keys(out).length ? out : undefined;
}
