/**
 * Apply contract (Gate 6.3) — serialize draft canonical → payload LƯU DocType về Frappe.
 * THUẦN + test được (round-trip cấp serializer). Apply/reload THẬT verify ở 6.4 (disposable site).
 *
 * Hợp đồng: DocType lưu như 1 doc có child table `fields` (DocField) + `permissions` (DocPerm).
 *  - strip khoá TÍNH TOÁN (`_compat`, `masked_fields`) — không gửi.
 *  - gắn `idx` theo thứ tự + envelope child-row (doctype/parentfield/parenttype/parent).
 *  - gửi `modified` của BASELINE → server bắt TimestampMismatch (417) ⇒ conflict/version detection
 *    (dùng lại cơ chế OCC như form; mapError.kind==="conflict").
 */
import { normalizeMeta, type DocTypeMeta } from "@metaforge/core";
import type { DraftSession } from "./validate.js";

const COMPUTED_FIELD = new Set(["_compat"]);
const COMPUTED_DOC = new Set(["_compat", "masked_fields"]);

export interface ApplyPayload {
  doctype: "DocType";
  name: string;
  /** OCC token (modified của baseline) — thiếu ⇒ server không kiểm version. */
  modified?: string;
  fields: Record<string, unknown>[];
  permissions: unknown[];
  [k: string]: unknown;
}

export function serializeDocTypeForSave(session: DraftSession): ApplyPayload {
  const { baseline, draft } = session;
  const fields = (draft.fields ?? []).map((f, i) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) if (!COMPUTED_FIELD.has(k)) out[k] = v;
    out.idx = i + 1;
    out.doctype = "DocField";
    out.parentfield = "fields";
    out.parenttype = "DocType";
    out.parent = draft.name;
    return out;
  });

  // P2-BUILDER-01: canonical hoá permissions GIỐNG fields (idx + envelope child-row) — trước đây gửi
  // RAW draft.permissions, thiếu idx/doctype/parentfield/parenttype/parent nếu rule mới do Builder tạo
  // (không tự có), khiến save có thể fail/mất thứ tự tuỳ implementation phía server.
  const permissions = (draft.permissions ?? []).map((perm, i) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(perm)) if (!COMPUTED_FIELD.has(k)) out[k] = v;
    out.idx = i + 1;
    out.doctype = "DocPerm";
    out.parentfield = "permissions";
    out.parenttype = "DocType";
    out.parent = draft.name;
    return out;
  });

  const payload: ApplyPayload = {
    doctype: "DocType",
    name: draft.name,
    fields,
    permissions,
  };
  // doc-level props (bỏ fields/permissions/computed)
  for (const [k, v] of Object.entries(draft)) {
    if (k === "fields" || k === "permissions" || COMPUTED_DOC.has(k)) continue;
    payload[k] = v;
  }
  const modified = (baseline as Record<string, unknown>).modified;
  if (modified != null) payload.modified = String(modified);
  return payload;
}

/**
 * roundTripLocal — mô phỏng round-trip cấp serializer (KHÔNG server): serialize → normalize.
 * Dùng để test bất biến "serialize không mất/không méo ngữ nghĩa" TRƯỚC khi thử live (6.4).
 * Trả canonical meta như thể vừa reload; so bằng `metaEqual` với draft.
 */
export function roundTripLocal(session: DraftSession): DocTypeMeta {
  return normalizeMeta(serializeDocTypeForSave(session));
}
