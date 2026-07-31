/**
 * link-query — dựng bộ lọc cho Link search từ metadata field + ngữ cảnh doc (P0-09, Gate 3).
 *
 * Frappe lưu bộ lọc Link tĩnh ở `field.link_filters` theo hai dạng JSON hợp lệ:
 *   {"disabled": 0, "is_sales_item": 1}
 * hoặc
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
const FORBIDDEN_FILTER_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** cảnh báo 1 lần cho mỗi input lỗi (buildLinkFilters chạy mỗi render → tránh spam) — không nuốt lỗi config. */
const _warned = new Set<string>();
function warnOnce(key: string, msg: string): void {
  if (_warned.has(key)) return;
  _warned.add(key);
  if (typeof console !== "undefined") console.warn(`[metaforge] link_filters: ${msg}`);
}

function resolveFilterValue(
  value: unknown,
  docValues: Record<string, unknown> | undefined,
): { include: boolean; value: unknown } {
  if (typeof value !== "string" || !value.startsWith(EVAL_PREFIX)) {
    return { include: true, value };
  }
  try {
    const resolved = safeEval(value.slice(EVAL_PREFIX.length), { doc: docValues ?? {} });
    // Ngữ cảnh chưa set (field phụ thuộc còn rỗng) → KHÔNG ràng buộc. Form khởi tạo field
    // trống bằng `""` hoặc `null`, không chỉ `undefined`; gửi các giá trị đó thành filter
    // thật sẽ tạo truy vấn kiểu `company = ""` và mọi Link phụ thuộc đều báo 0 kết quả.
    return {
      include: resolved !== undefined && resolved !== null && resolved !== "",
      value: resolved,
    };
  } catch {
    warnOnce(value, `biểu thức eval ngoài allowlist, bỏ điều kiện: ${value.slice(0, 80)}`);
    return { include: false, value: undefined };
  }
}

function isFilterObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnOnce(raw, `JSON không hợp lệ, bỏ lọc: ${raw.slice(0, 80)}`);
    return undefined; // JSON hỏng → không lọc (fail-safe) nhưng ĐÃ cảnh báo
  }

  const out: Record<string, unknown> = {};

  // Dạng dict là dạng brief/app thường khai cho các bộ lọc tĩnh đơn giản. Trước đây parser
  // chỉ nhận mảng nên `{ "is_sales_item": 1, "disabled": 0 }` bị bỏ qua hoàn toàn, khiến
  // picker child table hiện cả mặt hàng không được bán dù metadata đã khai đúng.
  if (isFilterObject(parsed)) {
    for (const [fieldname, rawValue] of Object.entries(parsed)) {
      if (!fieldname || FORBIDDEN_FILTER_KEYS.has(fieldname)) continue;
      if (Array.isArray(rawValue) && rawValue.length >= 2 && typeof rawValue[0] === "string") {
        const [op, candidate] = rawValue;
        const resolved = resolveFilterValue(candidate, docValues);
        if (!resolved.include) continue;
        out[fieldname] = op === "=" ? resolved.value : [op, resolved.value];
        continue;
      }
      const resolved = resolveFilterValue(rawValue, docValues);
      if (resolved.include) out[fieldname] = resolved.value;
    }
    return Object.keys(out).length ? out : undefined;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
  for (const cond of parsed) {
    if (!Array.isArray(cond) || cond.length < 4) continue;
    const fieldname = cond[1];
    const op = cond[2];
    if (typeof fieldname !== "string" || !fieldname || FORBIDDEN_FILTER_KEYS.has(fieldname) || typeof op !== "string") continue;
    const resolved = resolveFilterValue(cond[3], docValues);
    if (!resolved.include) continue;
    out[fieldname] = op === "=" ? resolved.value : [op, resolved.value];
  }
  return Object.keys(out).length ? out : undefined;
}
