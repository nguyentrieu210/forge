import type { DocTypeMeta, JsonValue } from "./router-platform.js";
import { errors } from "./router-platform.js";
import type { FrappeRouterContext } from "./router.js";

// Mấy mẩu dùng lại khắp router: nạp metadata bắt buộc, ép chuỗi, gỡ tiền tố `tabDocType.`,
// khử trùng lặp, và chặn kích thước trang. Chúng nhỏ nhưng được 45 chỗ dùng, nên nằm trong
// router.ts đồng nghĩa mọi module tách ra sau này đều phải kéo cả router về.

export async function requireMeta(doctype: string, context: FrappeRouterContext): Promise<DocTypeMeta> {
  const meta = await context.metadata.getDocType(context.tenantId, doctype);
  if (!meta) throw errors.notFound(`DocType does not exist: ${doctype}`);
  return meta;
}

export function stringOr(value: JsonValue | undefined, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

/** Frappe qualifies list fields as `` `tabDocType`.field ``. */
export function stripFieldQualifier(field: string): string {
  return field.replace(/`/g, "").split(".").pop() ?? field;
}

export function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Frappe clients ask for pages far larger than the kernel serves. Clamping
 * rather than rejecting keeps a list usable; the caller learns the real size
 * from the row count.
 */
export function clampPageLength(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) return 20;
  return Math.min(value, 100);
}
