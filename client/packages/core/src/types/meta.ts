import type { Fieldtype } from "./fieldtype.js";

/** DocField — tập thuộc tính adapter cần để render (subset của meta thật, passthrough phần còn lại). */
export interface DocField {
  fieldname: string;
  label?: string;
  fieldtype: Fieldtype;
  /**
   * Select: danh sách lựa chọn, mỗi dòng một giá trị — LUÔN là GIÁ TRỊ GỐC (tiếng Anh) đúng như
   * lưu trong DB. TUYỆT ĐỐI không thay bằng bản dịch: giá trị chọn được ghi thẳng xuống DB, dịch
   * ở đây nghĩa là ghi "Chuyển kho" vào chỗ ERPNext đang chờ "Material Transfer" — hỏng dữ liệu,
   * và doc cũ (giá trị gốc) không khớp option nào nên ô hiện RỖNG dù thực tế có giá trị.
   * Phần dịch để hiển thị nằm ở `optionLabels`.
   *
   * Link/Table/Dynamic Link: tên DocType đích.
   */
  options?: string;
  /** Select: giá_trị_gốc → nhãn đã dịch. Chỉ dùng để HIỂN THỊ, không bao giờ dùng làm giá trị. */
  optionLabels?: Record<string, string>;
  reqd?: 0 | 1;
  read_only?: 0 | 1;
  hidden?: 0 | 1;
  /** Chỉ hiện ở BẢNG danh sách, không hiện trên form. Khác `hidden` (giấu ở mọi màn). */
  list_only?: 0 | 1;
  default?: string | null;
  depends_on?: string;
  mandatory_depends_on?: string;
  read_only_depends_on?: string;
  fetch_from?: string;
  in_list_view?: 0 | 1;
  in_standard_filter?: 0 | 1;
  permlevel?: number;
  precision?: string;
  /**
   * Độ rộng field trên form, tính trên lưới 3 ô.
   * - full: 1 field / hàng
   * - half: 2 field / hàng
   * - third: 3 field / hàng
   *
   * Không khai báo thì FormView tự suy theo fieldtype và vai trò của field.
   */
  form_width?: "full" | "half" | "third";
  valueSource?: "user" | "default" | "link" | "formula" | "system" | "workflow";
  editMode?: "editable" | "readonly" | "set_once" | "immutable_after_submit" | "hidden";
  surface?: "quick" | "expanded" | "internal";
  serverEnforced?: boolean;
  dirtyGuard?: "preserve_user_value";
  /** cho phép meta thật mang thêm khoá — không mất dữ liệu */
  [k: string]: unknown;
}

/** DocPerm — 1 dòng phân quyền theo role + permlevel (ptype động theo doctype_ptype_map). */
export interface DocPerm {
  role: string;
  permlevel: number;
  read?: 0 | 1;
  write?: 0 | 1;
  create?: 0 | 1;
  delete?: 0 | 1;
  submit?: 0 | 1;
  cancel?: 0 | 1;
  amend?: 0 | 1;
  if_owner?: 0 | 1;
  [ptype: string]: unknown;
}

/** Runtime assets nhúng trong getdoctype (__js/__list_js/…): §Q. */
export interface RuntimeAssets {
  __js?: string;
  __list_js?: string;
  __calendar_js?: string;
  __tree_js?: string;
  __dashboard?: unknown;
  __kanban_column_fields?: string[];
  __workflow_docs?: unknown;
  __print_formats?: unknown;
  [k: string]: unknown;
}

/** DocTypeMeta — docs[0] của getdoctype. masked_fields đến từ FormMeta (che VALUE, không che schema). */
export interface DocTypeMeta extends RuntimeAssets {
  name: string;
  kind?: "transaction" | "master" | "child_table" | "single" | "tree" | "virtual" | "system";
  /** nhãn đã dịch theo ngôn ngữ user; fallback name. */
  label?: string;
  module?: string;
  issingle?: 0 | 1;
  istable?: 0 | 1;
  is_submittable?: 0 | 1;
  is_tree?: 0 | 1;
  autoname?: string;
  title_field?: string;
  image_field?: string;
  track_changes?: 0 | 1;
  fields: DocField[];
  viewPolicy?: Record<string, unknown>;
  permissions: DocPerm[];
  /** field bị che giá trị theo permlevel (apply_fieldlevel_read_permissions). */
  masked_fields?: string[];
}
