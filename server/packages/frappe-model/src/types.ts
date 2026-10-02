import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import type { MatrixViewPolicy } from "./matrix-types.js";

export type MetaFieldType =
  | "Data"
  | "Small Text"
  | "Text"
  | "Long Text"
  | "Code"
  | "Int"
  | "Float"
  | "Currency"
  | "Percent"
  | "Check"
  | "Date"
  | "Datetime"
  | "Time"
  | "Select"
  | "Link"
  | "Dynamic Link"
  | "Table"
  | "Table MultiSelect"
  | "JSON"
  | "Attach"
  | "Attach Image"
  | "Heading"
  | "Section Break"
  | "Column Break"
  | "HTML"
  // Rich text. Stored as a string like any other; the DIFFERENCE is that its content is
  // markup the client will render, so it must never be interpolated into a print format
  // unescaped — see `renderPrintFormat`, which escapes every document value.
  | "Text Editor"
  | "Markdown Editor"
  | "HTML Editor"
  // A secret. Never returned on a read — see `maskedFieldNames`. Kept a real fieldtype
  // rather than left to convention so the masking cannot be forgotten per doctype.
  | "Password"
  // Constrained strings. Validated for shape so a malformed value is refused at the
  // boundary rather than reaching a client that assumes the format.
  | "Phone"
  | "Color"
  | "Icon"
  | "Signature"
  | "Barcode"
  | "Autocomplete"
  | "Image"
  | "Read Only"
  // Numeric. `Duration` is a count of SECONDS, and `Rating` a fraction from 0 to 1 —
  // both match how Frappe stores them, so a value copied from a Frappe site means the
  // same thing here.
  | "Duration"
  | "Rating"
  // A GeoJSON object.
  | "Geolocation"
  // Layout only: they carry no value at all.
  | "Tab Break"
  | "Fold"
  | "Button";

/**
 * A DocField.
 *
 * Extends JsonObject, so presentation properties Frappe defines but this platform only
 * carries — column widths, collapsible groups, print visibility — travel through
 * untouched without each needing a declaration here. The ones named below are the ones
 * something on the SERVER reads.
 */
export interface DocFieldMeta extends JsonObject {
  fieldname: string;
  label: string;
  fieldtype: MetaFieldType;
  options?: string;
  required?: boolean;
  read_only?: boolean;
  hidden?: boolean;
  /** Chỉ là cột của BẢNG danh sách, không phải ô của form. Khác `hidden` (giấu ở mọi màn). */
  list_only?: boolean;
  allow_on_submit?: boolean;
  no_copy?: boolean;
  unique?: boolean;
  default?: JsonValue;
  precision?: number;
  length?: number;
  in_list_view?: boolean;
  in_standard_filter?: boolean;
  search_index?: boolean;
  fetch_from?: string;
  depends_on?: string;
  mandatory_depends_on?: string;
  read_only_depends_on?: string;
  permlevel?: number;
  description?: string;
  /** Độ rộng field trên lưới form 3 ô; chỉ ảnh hưởng trình bày. */
  form_width?: "full" | "two_thirds" | "half" | "third";
  form_region?: "main" | "aside" | "full";
  form_control_width?: "compact";
  /** Presentation-only control for integer minute values; storage remains numeric minutes. */
  ui_control?: "time_of_day_minutes" | "duration_minutes" | "coordinate_pair";
  /** Immutable after the first save — enforced by the generic controller. */
  set_only_once?: boolean;
  /** Refuses a negative value. */
  non_negative?: boolean;
  /** Refuses an explicit null. */
  not_nullable?: boolean;
  /** Omitted from a rendered print format. */
  print_hide?: boolean;
  /** Omitted from a print format only when empty. */
  print_hide_if_no_value?: boolean;
  idx?: number;
  /** Canonical MetaForge authoring contract: where the value comes from. */
  valueSource?: "user" | "default" | "link" | "formula" | "system" | "workflow";
  /** Canonical edit policy. The server remains authoritative for every readonly variant. */
  editMode?: "editable" | "readonly" | "set_once" | "immutable_after_submit" | "hidden";
  /** `quick` is the compact create form, `expanded` the full form, `internal` never user-authored. */
  surface?: "quick" | "expanded" | "internal";
  /** True when accepting a client value would violate a server-owned invariant. */
  serverEnforced?: boolean;
  /**
   * Vai được phép GHI một ô `serverEnforced`.
   *
   * "Server-controlled" nghĩa là người dùng không đặt được giá trị — chứ không có nghĩa là
   * KHÔNG AI đặt được. Vài ô chỉ đổi qua đúng một đường mã nguồn của server; đường đó vẫn phải
   * đi qua `save`, nên nó bị chính cái guard bảo vệ ô đó chặn lại. Đo ngày 23/08/2026:
   * `AlumDoor QR Station.secret_version` khai `serverEnforced` nên nút "Tạo lại QR" luôn ném
   * "Field is server-controlled: secret_version" — QR dán ở cổng bị chụp lại thì không thu hồi
   * được, đúng thứ màn hình đang hứa là làm được.
   *
   * Khai vai ở ĐÂY, trên chính ô đó, thay vì nhét tên vai của một vertical vào kernel dùng
   * chung. Vai này phải là vai hệ thống, không cấp cho người thật.
   */
  systemWriterRole?: string;
  /** Preserve a value the user has changed when a later Link fetch resolves. */
  dirtyGuard?: "preserve_user_value";
}

export type DocTypeKind = "transaction" | "master" | "child_table" | "single" | "tree" | "virtual" | "system";
export type BulkCommitStrategy = "document_update";

export interface BulkRowSource extends JsonObject {
  kind: "link_uom_expansion";
  doctype: string;
  identityField: string;
  uomFields: string[];
  uomTable?: string;
  uomTableField?: string;
  filterFields?: string[];
  targetLinkField: string;
  targetUomField: string;
}

export interface DocTypeView extends JsonObject {
  enabled: boolean;
  fields?: string[];
  columns?: string[];
  stageField?: string;
  startField?: string;
  endField?: string;
  editableFields?: string[];
  commitStrategy?: BulkCommitStrategy;
  allowPaste?: boolean;
  allowFillDown?: boolean;
  pageSize?: number;
  /** Link/Select fields rendered as a contextual filter above Bulk Grid, not as a grid column. */
  toolbarFilters?: string[];
  /** Declarative parent × UOM source for create-or-update bulk grids. */
  rowSource?: BulkRowSource;
  reasonRequiredOn?: string[];
  /** Optional app method that derives a child-row UX preview; save/submit remain authoritative. */
  previewMethod?: string;
  /** Parent fields whose changes invalidate the row preview. */
  previewParentFields?: string[];
}

export interface DocTypeViewPolicy extends JsonObject {
  list: DocTypeView;
  form: DocTypeView;
  quickEntry?: DocTypeView;
  bulk?: DocTypeView;
  matrix?: MatrixViewPolicy;
  kanban?: DocTypeView;
  calendar?: DocTypeView;
  gantt?: DocTypeView;
  chart?: DocTypeView;
  mobile?: JsonObject;
}

/**
 * Canonical DocPerm contract. Destructive delete is independent from write/save:
 * callers must never infer delete from write, and transports must project this bit as-is.
 */
export interface DocPermissionMeta extends JsonObject {
  role: string;
  read?: boolean;
  write?: boolean;
  create?: boolean;
  delete?: boolean;
  submit?: boolean;
  cancel?: boolean;
  amend?: boolean;
  print?: boolean;
  email?: boolean;
  report?: boolean;
  import?: boolean;
  export?: boolean;
  share?: boolean;
  if_owner?: boolean;
  permlevel?: number;
}

export interface WorkflowStateMeta extends JsonObject {
  state: string;
  docstatus: 0 | 1 | 2;
  allow_edit?: string;
  style?: string;
  /**
   * Frappe Workflow Document State side effect. Applied by workflow authority
   * after transition selection, never trusted from a client payload.
   */
  update_field?: string;
  update_value?: JsonValue;
  /**
   * Bounded expression support: direct `doc.<field>` projection only.
   * Arbitrary Python safe_eval remains outside tenant metadata execution.
   */
  evaluate_as_expression?: boolean;
  /** Carries upstream state-level email intent for the communications lane. */
  send_email?: boolean;
}

export interface WorkflowTransitionMeta extends JsonObject {
  state: string;
  action: string;
  next_state: string;
  allowed_role: string;
  condition?: string;
  allow_self_approval?: boolean;
}

export interface WorkflowMeta extends JsonObject {
  name: string;
  document_type: string;
  state_field: string;
  is_active: boolean;
  /** Master switch for Workflow Action email intent, matching Frappe Workflow. */
  send_email_alert?: boolean;
  states: WorkflowStateMeta[];
  transitions: WorkflowTransitionMeta[];
  revision: number;
}

export interface DocTypeMeta extends JsonObject {
  name: string;
  /** Explicit semantic kind used by installers, generators and generic views. */
  kind?: DocTypeKind;
  /**
   * Tên hiển thị cho người dùng. Bỏ trống thì mọi nơi rơi về `name`, tức tên kỹ thuật.
   *
   * Không phải chuyện trang trí: `name` là định danh tiếng Anh không đổi được (nó nằm trong
   * URL, trong khoá ngoại, trong mọi tham chiếu), nên nếu nhãn không đi cùng metadata thì
   * người dùng Việt Nam đọc "Aluminium Lot" ở breadcrumb, ở ô chọn loại chứng từ và màn
   * phân quyền — trong khi brief đã khai "Lô nhôm tồn" và menu vẫn hiện đúng. Hai chỗ nói
   * hai kiểu về cùng một thứ.
   */
  label?: string;
  module: string;
  custom?: boolean;
  is_child?: boolean;
  is_tree?: boolean;
  is_single?: boolean;
  is_submittable?: boolean;
  track_changes?: boolean;
  track_seen?: boolean;
  allow_rename?: boolean;
  /** Explicit opt-in for configuration masters; linked-document and ledger guards still apply. */
  allow_delete_non_draft?: boolean;
  autoname?: string;
  title_field?: string;
  image_field?: string;
  sort_field?: string;
  sort_order?: "ASC" | "DESC";
  search_fields?: string[];
  fields: DocFieldMeta[];
  /** Explicitly enables views; a chart/Kanban/calendar/bulk/matrix view is never inferred from a coincidental field. */
  viewPolicy?: DocTypeViewPolicy;
  permissions: DocPermissionMeta[];
  revision: number;
  modified_at?: string;
  /**
   * Version of the EFFECTIVE schema: `<definitionRevision>.<customizationRevision>`.
   *
   * `revision` alone versions the standard definition, so a cache keyed on it
   * would keep serving a stale schema after a Custom Field or Property Setter
   * change. Present only on metadata that has been through the overlay merge.
   */
  effective_revision?: string;
}

export interface PrintFormatMeta extends JsonObject {
  name: string;
  doc_type: string;
  format_type: "Jinja" | "Standard";
  html: string;
  css?: string;
  is_default?: boolean;
  disabled?: boolean;
  revision: number;
}

export interface CommentRecord extends JsonObject {
  comment_id: string;
  doctype: string;
  name: string;
  comment_type: "Comment" | "Edit" | "Shared" | "Assigned" | "Info";
  content: string;
  owner: string;
  created_at: string;
}

export interface AssignmentRecord extends JsonObject {
  assignment_id: string;
  doctype: string;
  name: string;
  assigned_to: string;
  description?: string;
  status: "Open" | "Closed" | "Cancelled";
  priority?: "Low" | "Medium" | "High";
  due_date?: string;
  owner: string;
  created_at: string;
  modified_at: string;
}

export interface FileRecord extends JsonObject {
  file_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  attached_to_doctype?: string;
  attached_to_name?: string;
  is_private: boolean;
  owner: string;
  created_at: string;
}


export interface UserPermissionRecord extends JsonObject {
  user: string;
  allow_doctype: string;
  allow_name: string;
  applicable_for_doctype: string;
  is_default: boolean;
  hide_descendants: boolean;
  created_by: string;
  created_at: string;
}

export interface ShareRecord extends JsonObject {
  doctype: string;
  name: string;
  user: string;
  read: boolean;
  write: boolean;
  share: boolean;
  submitted_by: string;
  created_at: string;
}
