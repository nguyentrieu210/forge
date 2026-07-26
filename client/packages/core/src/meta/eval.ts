/**
 * Frappe depends_on / *_depends_on evaluator (§F3). P0-06/rule #14: KHÔNG `new Function`/eval —
 * dùng safeEval (parser allowlist). Mô phỏng hành vi Desk:
 *   - rỗng              → true (mặc định hiển thị/áp dụng)
 *   - "eval:<expr>"     → safeEval(expr) với `doc`,`parent`; lấy truthiness (mảng theo length)
 *   - "fn:<...>"        → hàm tuỳ ý: KHÔNG chạy trong runtime an toàn → diagnostic + false
 *   - "<fieldname>"     → truthy(doc[fieldname]) (mảng rỗng = false, KHỚP Frappe)
 * Lỗi/parse-fail/không hỗ trợ → console.error (diagnostic hiện, không im lặng) + false.
 */
import { safeEval } from "./safe-eval.js";

/** Truthiness kiểu Frappe: mảng dựa trên length (mảng rỗng = false). */
export function toTruthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

export function evalDependsOn(
  expr: string | undefined | null,
  doc: Record<string, unknown>,
  parent?: Record<string, unknown>,
): boolean {
  if (!expr) return true;
  const trimmed = expr.trim();

  if (trimmed.startsWith("eval:")) {
    const code = trimmed.slice(5);
    try {
      return toTruthy(safeEval(code, { doc, parent }));
    } catch (e) {
      console.error(`[MetaForge] depends_on eval không hỗ trợ/sai: "${code}" — ${(e as Error)?.message ?? e}`);
      return false;
    }
  }

  if (trimmed.startsWith("fn:")) {
    // Hàm tuỳ ý không thể đánh giá bằng parser allowlist ⇒ KHÔNG chạy (bảo mật P0-06).
    // Hiện diagnostic để lộ ra thay vì im lặng hoặc thực thi JS tuỳ ý.
    console.error(`[MetaForge] depends_on "fn:" không hỗ trợ trong runtime an toàn (P0-06): "${trimmed.slice(3)}"`);
    return false;
  }

  // shorthand: tên field → truthy (mảng rỗng = false)
  return toTruthy(doc[trimmed]);
}
