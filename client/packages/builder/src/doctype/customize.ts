/**
 * planCustomization (Builder serializer #1) — chỉnh STANDARD DocType KHÔNG sửa schema gốc.
 * Frappe: DocType chuẩn (custom=0) định nghĩa trong code ⇒ không sửa trực tiếp. Cách chuẩn:
 *   - thêm field  → Custom Field (dt, fieldname, …, insert_after)
 *   - đổi property → Property Setter (doc_type, field_name, property, value, property_type)
 *   - field chuẩn KHÔNG xoá được → chỉ ẩn (Property Setter hidden=1); chỉ Custom Field mới xoá được.
 * THUẦN + test được: map diffMeta(baseline, draft) → tập thao tác. Apply/round-trip live = bước sau.
 */
import type { DocField } from "@metaforge/core";
import type { MetaDiff } from "./diff.js";

export interface CustomFieldOp {
  op: "custom_field";
  dt: string;
  fieldname: string;
  fieldtype: string;
  label?: string;
  options?: string;
  reqd?: 0 | 1;
  form_width?: "full" | "half" | "third";
  /** chèn sau field nào (thứ tự) — Frappe Custom Field.insert_after. */
  insert_after?: string;
}
export interface PropertySetterOp {
  op: "property_setter";
  /** "DocField" (property của field) | "DocType" (property cấp doctype). */
  doctype_or_field: "DocField" | "DocType";
  doc_type: string;
  /** fieldname khi DocField; null khi DocType. */
  field_name: string | null;
  property: string;
  value: unknown;
  property_type: string;
}
export interface DeleteCustomFieldOp {
  op: "delete_custom_field";
  dt: string;
  fieldname: string;
}
export interface CustomizeWarning {
  code: string;
  message: string;
  fieldname?: string;
}

export interface CustomizePlan {
  customFields: CustomFieldOp[];
  propertySetters: PropertySetterOp[];
  deletions: DeleteCustomFieldOp[];
  warnings: CustomizeWarning[];
}

/** property → property_type Frappe (subset). Bool-ish → Check; số → Int; còn lại → Text/Data. */
const CHECK_PROPS = new Set([
  // field-level 0/1
  "reqd", "read_only", "hidden", "in_list_view", "in_standard_filter", "bold", "allow_on_submit", "translatable",
  // doctype-level 0/1
  "is_submittable", "issingle", "istable", "is_tree", "track_changes", "quick_entry", "editable_grid", "allow_rename", "allow_import",
]);
const INT_PROPS = new Set(["permlevel", "columns"]);
function propertyType(property: string, value: unknown): string {
  if (CHECK_PROPS.has(property)) return "Check";
  if (INT_PROPS.has(property)) return "Int";
  if (property === "options" || property === "depends_on" || property === "description" || property === "mandatory_depends_on" || property === "read_only_depends_on") return "Text";
  if (typeof value === "number") return "Int";
  return "Data";
}

/** Field mới (added) → CustomFieldOp; insert_after = field liền trước trong draft. */
function toCustomField(dt: string, f: DocField, insertAfter?: string): CustomFieldOp {
  return {
    op: "custom_field", dt, fieldname: f.fieldname, fieldtype: f.fieldtype,
    label: f.label, options: f.options, reqd: f.reqd,
    form_width: f.form_width,
    ...(insertAfter ? { insert_after: insertAfter } : {}),
  };
}

/**
 * planCustomization — diff STANDARD doctype → thao tác Custom Field / Property Setter.
 * `draftFieldOrder` = thứ tự fieldname trong draft (để tính insert_after cho field mới).
 */
export function planCustomization(docType: string, diff: MetaDiff, draftFieldOrder: string[]): CustomizePlan {
  const plan: CustomizePlan = { customFields: [], propertySetters: [], deletions: [], warnings: [] };

  // 1) added → Custom Field
  for (const f of diff.added) {
    const i = draftFieldOrder.indexOf(f.fieldname);
    const insertAfter = i > 0 ? draftFieldOrder[i - 1] : undefined;
    plan.customFields.push(toCustomField(docType, f, insertAfter));
  }

  // 2) changed props → Property Setter (mỗi property 1 PS)
  for (const c of diff.changed) {
    for (const [property, change] of Object.entries(c.props)) {
      plan.propertySetters.push({
        op: "property_setter", doctype_or_field: "DocField", doc_type: docType,
        field_name: c.fieldname, property, value: change.to, property_type: propertyType(property, change.to),
      });
    }
  }

  // 3) doc-level changed → Property Setter (field_name null)
  for (const [property, change] of Object.entries(diff.doc)) {
    plan.propertySetters.push({
      op: "property_setter", doctype_or_field: "DocType", doc_type: docType,
      field_name: null, property, value: change.to, property_type: propertyType(property, change.to),
    });
  }

  // 4) removed → chỉ xoá được nếu là Custom Field; field chuẩn → cảnh báo (dùng hidden)
  for (const f of diff.removed) {
    if ((f as Record<string, unknown>).is_custom_field) {
      plan.deletions.push({ op: "delete_custom_field", dt: docType, fieldname: f.fieldname });
    } else {
      plan.warnings.push({ code: "standard_field_no_delete", message: `Không xoá được field chuẩn "${f.fieldname}" — dùng ẩn (hidden) qua Property Setter`, fieldname: f.fieldname });
    }
  }

  // 5) reorder standard fields: Frappe hạn chế — cảnh báo (insert_after chỉ áp cho Custom Field)
  if (diff.reordered) {
    plan.warnings.push({ code: "reorder_limited", message: "Đổi thứ tự field CHUẨN bị giới hạn (insert_after chỉ cho Custom Field; field chuẩn giữ thứ tự gốc)" });
  }

  return plan;
}
