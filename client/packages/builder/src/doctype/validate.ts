/**
 * Builder validate + draft/baseline session (Gate 6.2). THUẦN, test được không cần live.
 *
 * Nguyên tắc: Builder KHÔNG sinh metadata riêng — nó sửa canonical DocTypeMeta tương thích Frappe.
 *  - baseline = meta server đã `normalizeMeta` (canonical, bất biến trong phiên).
 *  - draft    = bản sửa (editable). diff = diffMeta(baseline, draft).
 *  - validateDraft: kiểm TRƯỚC KHI apply — dựa `normalizeMeta` (cấu trúc) + luật Frappe cơ bản
 *    (fieldname hợp lệ/không trùng/không đụng field hệ thống · options bắt buộc · title_field hợp lệ).
 * KHÔNG apply nếu còn error (fail-closed). warning không chặn.
 */
import { normalizeMeta, MetaValidationError, SYSTEM_FIELDS, type DocTypeMeta } from "@metaforge/core";
import { diffMeta, hasChanges, type MetaDiff } from "./diff.js";

export type ValidationSeverity = "error" | "warning";
export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  fieldname?: string;
}
export interface ValidationResult {
  /** không còn error (warning vẫn ok). */
  ok: boolean;
  issues: ValidationIssue[];
}

/** fieldname Frappe: bắt đầu bằng chữ thường, chỉ [a-z0-9_]. */
const FIELDNAME_RE = /^[a-z][a-z0-9_]*$/;
/** fieldtype BẮT BUỘC có options (doctype/target). */
const OPTIONS_REQUIRED = new Set(["Link", "Table", "Table MultiSelect"]);
const LAYOUT = new Set(["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button"]);

export function validateDraft(meta: DocTypeMeta): ValidationResult {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string, fieldname?: string) => issues.push({ severity: "error", code, message, fieldname });
  const warn = (code: string, message: string, fieldname?: string) => issues.push({ severity: "warning", code, message, fieldname });

  // 1) cấu trúc canonical (ném MetaValidationError nếu shape sai)
  try {
    normalizeMeta(meta);
  } catch (e) {
    if (e instanceof MetaValidationError) err("structure", e.message);
    else throw e;
  }

  if (!meta.name || !String(meta.name).trim()) err("name", "DocType phải có tên");

  // 2) từng field
  const seen = new Set<string>();
  for (const f of meta.fields ?? []) {
    const fn = f.fieldname;
    if (!fn) { err("fieldname_empty", "Có field thiếu fieldname"); continue; }
    if (!FIELDNAME_RE.test(fn)) err("fieldname_invalid", `fieldname không hợp lệ: "${fn}" (chữ thường/số/_ , bắt đầu bằng chữ)`, fn);
    if (seen.has(fn)) err("fieldname_dup", `fieldname trùng: "${fn}"`, fn);
    seen.add(fn);
    if (SYSTEM_FIELDS.has(fn)) err("fieldname_reserved", `fieldname trùng field hệ thống: "${fn}"`, fn);
    if (OPTIONS_REQUIRED.has(f.fieldtype) && !String(f.options ?? "").trim()) err("options_required", `${f.fieldtype} "${fn}" cần options (doctype đích)`, fn);
    if (f.fieldtype === "Select" && !String(f.options ?? "").trim()) warn("select_empty", `Select "${fn}" chưa có lựa chọn`, fn);
  }

  // 3) title_field phải trỏ tới field có value đang tồn tại
  if (meta.title_field) {
    const tf = (meta.fields ?? []).find((f) => f.fieldname === meta.title_field);
    if (!tf) err("title_field", `title_field "${meta.title_field}" không tồn tại`);
    else if (LAYOUT.has(tf.fieldtype)) err("title_field_layout", `title_field "${meta.title_field}" là field bố cục (không mang value)`);
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

// ── draft / baseline session ─────────────────────────────────────────────────

export interface DraftSession {
  /** meta server canonical (normalizeMeta) — mốc so diff, KHÔNG sửa. */
  baseline: DocTypeMeta;
  /** bản đang sửa. */
  draft: DocTypeMeta;
}

function cloneMeta(m: DocTypeMeta): DocTypeMeta {
  return { ...m, fields: (m.fields ?? []).map((f) => ({ ...f })), permissions: (m.permissions ?? []).map((p) => ({ ...p })) };
}

/** openDraft — nạp meta server → baseline canonical + draft clone. Ném nếu server meta sai shape. */
export function openDraft(serverMeta: unknown): DraftSession {
  const baseline = normalizeMeta(serverMeta);
  return { baseline, draft: cloneMeta(baseline) };
}

/** reloadDraft — nạp lại từ server: baseline mới, draft reset (mất sửa chưa apply — caller cảnh báo). */
export function reloadDraft(serverMeta: unknown): DraftSession {
  return openDraft(serverMeta);
}

export interface DraftStatus {
  diff: MetaDiff;
  validation: ValidationResult;
  /** có thay đổi VÀ hợp lệ ⇒ được phép apply. */
  canApply: boolean;
}

/** draftStatus — diff + validate + cờ canApply (gate nút Apply). */
export function draftStatus(session: DraftSession): DraftStatus {
  const diff = diffMeta(session.baseline, session.draft);
  const validation = validateDraft(session.draft);
  return { diff, validation, canApply: hasChanges(diff) && validation.ok };
}
