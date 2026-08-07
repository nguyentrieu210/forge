/**
 * fetch_from (Gate 4, P1-09) — điền tự động field từ document được Link tới.
 * Frappe: field.fetch_from = "<link_fieldname>.<source_fieldname>" ⇒ khi link_field đổi giá trị,
 * lấy source_field của doc đích và gán vào field này. Helper THUẦN, dùng chung Form/Child/Action.
 */
import type { DocTypeMeta } from "../types/meta.js";

export interface FetchFromRule {
  /** field đích được điền. */
  target: string;
  /** fieldname của Link/Dynamic Link nguồn trên form hiện tại. */
  linkField: string;
  /** field lấy từ doc đích. */
  sourceField: string;
  /** doctype đích tĩnh (options của Link nguồn). */
  sourceDoctype?: string;
  /** Dynamic Link: field cùng document đang giữ tên DocType đích. */
  sourceDoctypeField?: string;
  /** Frappe fetch_if_empty: chỉ tự điền nếu target hiện đang rỗng. */
  fetchIfEmpty: boolean;
}

/** Tách "link.source" → {linkField, sourceField}. Không hợp lệ → null. */
export function parseFetchFrom(fetchFrom: unknown): { linkField: string; sourceField: string } | null {
  if (typeof fetchFrom !== "string") return null;
  const dot = fetchFrom.indexOf(".");
  if (dot <= 0 || dot >= fetchFrom.length - 1) return null;
  return { linkField: fetchFrom.slice(0, dot), sourceField: fetchFrom.slice(dot + 1) };
}

/** Resolve DocType nguồn cho cả Link tĩnh lẫn Dynamic Link mà không hard-code schema nghiệp vụ. */
export function resolveFetchSourceDoctype(rule: FetchFromRule, doc: Record<string, unknown>): string | undefined {
  if (rule.sourceDoctype) return rule.sourceDoctype;
  if (!rule.sourceDoctypeField) return undefined;
  const value = doc[rule.sourceDoctypeField];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Frappe semantics: fetch_if_empty=1 chỉ cho phép fetch khi target rỗng; mặc định/0 thì Link
 * sở hữu target khi source Link có giá trị. Dirty/provenance guard vẫn được kiểm riêng ở runtime.
 */
export function fetchRuleAllowsCurrentValue(rule: FetchFromRule, current: unknown): boolean {
  if (!rule.fetchIfEmpty) return true;
  return current === undefined || current === null || current === "";
}

/** Gom mọi field fetch_from của meta + nguồn Link/Dynamic Link tương ứng. */
export function collectFetchFrom(meta: DocTypeMeta): FetchFromRule[] {
  const fields = meta.fields ?? [];
  const out: FetchFromRule[] = [];
  for (const f of fields) {
    const parsed = parseFetchFrom(f.fetch_from);
    if (!parsed) continue;
    const link = fields.find((x) => x.fieldname === parsed.linkField);
    if (!link || (link.fieldtype !== "Link" && link.fieldtype !== "Dynamic Link")) continue;
    const sourceDoctype = link.fieldtype === "Link" ? link.options : undefined;
    const sourceDoctypeField = link.fieldtype === "Dynamic Link" ? link.options : undefined;
    out.push({
      target: f.fieldname,
      linkField: parsed.linkField,
      sourceField: parsed.sourceField,
      ...(sourceDoctype ? { sourceDoctype } : {}),
      ...(sourceDoctypeField ? { sourceDoctypeField } : {}),
      fetchIfEmpty: f.fetch_if_empty === 1,
    });
  }
  return out;
}
