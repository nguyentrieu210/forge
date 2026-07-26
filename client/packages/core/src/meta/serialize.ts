/**
 * Serializers doc → payload (Gate 3, P0-03). Tách rõ 3 ý định:
 *   - serializeCreateDocument: TẠO ⇒ gửi TOÀN BỘ authorable document đã validate (default +
 *     giá trị nhập), KHÔNG chỉ dirty fields → tránh mất default/required chưa chạm.
 *   - serializeUpdatePatch: SỬA ⇒ chỉ gửi patch có chủ đích (field đã đổi) + name/modified (OCC).
 * Cả hai LOẠI field hệ thống (không authorable) + field layout (no-value).
 */
import type { DocTypeMeta } from "../types/meta.js";
import { NO_VALUE_FIELDTYPES } from "../types/fieldtype.js";

/** Field do server/hệ thống quản lý — KHÔNG gửi khi tạo/sửa (server tự sinh/kiểm).
 * `workflow_state`: engine workflow tự khởi tạo/chuyển; gửi kèm khi create → xung đột (500 trên
 * doctype có workflow, phát hiện lúc runtime E2E). Loại cả create lẫn patch. */
export const SYSTEM_FIELDS: ReadonlySet<string> = new Set([
  "name", "owner", "creation", "modified", "modified_by", "docstatus", "idx",
  "doctype", "__islocal", "__unsaved", "__run_link_triggers", "__onload",
  "parent", "parentfield", "parenttype", "_user_tags", "_comments", "_assign", "_liked_by",
  "workflow_state",
]);

function isAuthorable(meta: DocTypeMeta, fieldname: string): boolean {
  const f = meta.fields.find((x) => x.fieldname === fieldname);
  if (!f) return true; // field không trong meta (vd child rows) → giữ, server validate
  return !NO_VALUE_FIELDTYPES.has(f.fieldtype); // bỏ Section/Column/Tab/Heading/HTML/Button
}

/**
 * TẠO: serialize toàn bộ document authorable đã validate (default + nhập), loại system/layout.
 * `values` = giá trị form ĐẦY ĐỦ (blankDoc default ⊕ field đã nhập), KHÔNG phải dirty patch.
 */
export function serializeCreateDocument(
  meta: DocTypeMeta,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (SYSTEM_FIELDS.has(k)) continue;
    if (v === undefined) continue;
    if (!isAuthorable(meta, k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * SỬA: patch có chủ đích — chỉ field đã đổi (`changed`) + name + modified (cho optimistic-lock 417).
 * KHÔNG gửi cả doc (tránh ghi đè field không định đổi).
 */
export function serializeUpdatePatch(
  meta: DocTypeMeta,
  name: string,
  modified: string | undefined,
  changed: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { name };
  if (modified) patch.modified = modified;
  for (const [k, v] of Object.entries(changed)) {
    if (SYSTEM_FIELDS.has(k)) continue;
    if (!isAuthorable(meta, k)) continue;
    patch[k] = v;
  }
  return patch;
}
