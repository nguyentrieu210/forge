/**
 * fetch_from (Gate 4, P1-09) — điền tự động field từ document được Link tới.
 * Frappe: field.fetch_from = "<link_fieldname>.<source_fieldname>" ⇒ khi link_field đổi giá trị,
 * lấy source_field của doc đích và gán vào field này (thường read_only). Helper THUẦN, dễ test.
 */
import type { DocTypeMeta } from "../types/meta.js";

export interface FetchFromRule {
  /** field đích được điền. */
  target: string;
  /** fieldname của Link nguồn trên form hiện tại. */
  linkField: string;
  /** field lấy từ doc đích. */
  sourceField: string;
  /** doctype đích (options của linkField) — để adapter.getValue. */
  sourceDoctype?: string;
}

/** Tách "link.source" → {linkField, sourceField}. Không hợp lệ → null. */
export function parseFetchFrom(fetchFrom: unknown): { linkField: string; sourceField: string } | null {
  if (typeof fetchFrom !== "string") return null;
  const dot = fetchFrom.indexOf(".");
  if (dot <= 0 || dot >= fetchFrom.length - 1) return null;
  return { linkField: fetchFrom.slice(0, dot), sourceField: fetchFrom.slice(dot + 1) };
}

/** Gom mọi field fetch_from của meta + doctype nguồn (từ options của link field). */
export function collectFetchFrom(meta: DocTypeMeta): FetchFromRule[] {
  const fields = meta.fields ?? [];
  const out: FetchFromRule[] = [];
  for (const f of fields) {
    const parsed = parseFetchFrom(f.fetch_from);
    if (!parsed) continue;
    const link = fields.find((x) => x.fieldname === parsed.linkField);
    // link phải là Link (hoặc Dynamic Link) mới có doctype nguồn; Dynamic Link → options là field khác.
    const sourceDoctype = link && link.fieldtype === "Link" ? link.options : undefined;
    out.push({ target: f.fieldname, linkField: parsed.linkField, sourceField: parsed.sourceField, sourceDoctype });
  }
  return out;
}
