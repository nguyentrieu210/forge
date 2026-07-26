/**
 * Canonical metadata pipeline (P0-08 + nợ Gate1 raw-DTO validation).
 *   raw getdoctype → VALIDATE shape (ném diagnostic) → normalize → canonical DocTypeMeta.
 * KHÔNG cast mù. Giữ NGUYÊN mọi prop (DocField có index-signature ⇒ extension key được giữ,
 * không mất khi Frappe đổi shape). Gắn `_compat` (fieldtype compatibility) mỗi field ⇒ renderer
 * có thể chẩn đoán field không hỗ trợ (rule #8) thay vì âm thầm render như Data/Text.
 */
import type { DocTypeMeta, DocField, DocPerm } from "../types/meta.js";
import { AUTHORABLE_FIELDTYPES } from "../types/fieldtype.js";

export type FieldCompat = "SUPPORTED" | "PARTIAL" | "READ_ONLY" | "UNSUPPORTED_VISIBLE";

// Ma trận compatibility — xem FIELD_TYPE_COMPATIBILITY.md. PARTIAL = có control nhưng chưa
// đủ ngữ nghĩa Frappe (editor cơ bản / thiếu context). READ_ONLY = chỉ hiển thị.
const PARTIAL = new Set<string>([
  "Dynamic Link", "Code", "JSON", "HTML Editor", "Markdown Editor", "Text Editor", "Geolocation", "Fold",
  // Duration: hạ cấp về ô số (giây) — CHƯA có widget d/h/m/s của Frappe ⇒ PARTIAL, không SUPPORTED.
  // Rating: hạ cấp về ô số (0..max) — CHƯA có widget sao ⇒ PARTIAL.
  "Duration", "Rating",
]);
const READ_ONLY_TYPES = new Set<string>(["Read Only"]);
const KNOWN = new Set<string>([...AUTHORABLE_FIELDTYPES, "Long Int"]);

export function fieldTypeStatus(ft: string): FieldCompat {
  if (!KNOWN.has(ft)) return "UNSUPPORTED_VISIBLE";
  if (READ_ONLY_TYPES.has(ft)) return "READ_ONLY";
  if (PARTIAL.has(ft)) return "PARTIAL";
  return "SUPPORTED";
}

export class MetaValidationError extends Error {
  constructor(msg: string) {
    super(`[MetaForge] metadata không hợp lệ: ${msg}`);
    this.name = "MetaValidationError";
  }
}

/**
 * Chuẩn hoá raw getdoctype (r.docs[0]) → canonical DocTypeMeta.
 * Ném MetaValidationError nếu shape sai (thiếu name/fields, field thiếu fieldname/fieldtype).
 */
export function normalizeMeta(raw: unknown, maskedFields?: string[]): DocTypeMeta {
  if (!raw || typeof raw !== "object") throw new MetaValidationError("meta rỗng hoặc không phải object");
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name) throw new MetaValidationError("thiếu 'name'");
  if (!Array.isArray(r.fields)) throw new MetaValidationError(`'${String(r.name)}': 'fields' không phải mảng`);

  const fields: DocField[] = (r.fields as unknown[]).map((f, i) => {
    if (!f || typeof f !== "object") throw new MetaValidationError(`'${r.name}': field[${i}] không phải object`);
    const df = f as DocField;
    if (typeof df.fieldname !== "string" || typeof df.fieldtype !== "string") {
      throw new MetaValidationError(`'${r.name}': field[${i}] thiếu fieldname/fieldtype`);
    }
    return { ...df, _compat: fieldTypeStatus(df.fieldtype) }; // retain + tag
  });

  const meta = { ...(r as object), fields } as DocTypeMeta;
  meta.permissions = Array.isArray((r as { permissions?: unknown }).permissions) ? (r.permissions as DocPerm[]) : [];
  if (maskedFields) meta.masked_fields = maskedFields;
  return meta;
}
