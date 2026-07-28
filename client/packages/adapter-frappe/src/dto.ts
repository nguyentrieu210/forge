/**
 * DTO cho FrappeAdapter — SHAPE đã verified trên live 16.29.0 (api-map.md).
 * Các sửa review#4 nằm ngay trong type để lệch contract = lỗi biên dịch.
 */
import type { LabelValue } from "@metaforge/core";

/** §1 — BootDTO: orch metaforge.api.get_boot wrap frappe.boot.get_bootinfo. */
export interface MetaForgeBootDTO {
  user: string;
  full_name: string;
  roles: string[];
  user_permissions: Record<string, unknown>;
  lang: string;
  /** site THẬT (frappe.local.site) — P2-CACHE-01: phân biệt cache khi 2 site dùng chung trình duyệt. */
  site_name: string;
  /** version Frappe THẬT (frappe.__version__) — phân biệt cache qua nâng cấp site (schema/contract đổi). */
  frappe_version: string;
  csrf_token: string;
  sysdefaults: {
    date_format?: string;
    number_format?: string;
    time_zone?: string;
    currency?: string;
  };
  allowed_workspaces: string[];
}

/** createScopeKey — P2-CACHE-01 (review độc lập). Trước đây app tự ghép `${user}|${lang}|16` (hằng số
 * "16" đoán, KHÔNG site) → 2 site khác nhau (vd 2 tenant, hoặc site sau khi đổi domain) dùng CHUNG
 * trình duyệt/localStorage sẽ ĐỤNG cache (TanStack Query key giống nhau dù data thuộc site khác nhau).
 * Nay ghép từ site_name + frappe_version THẬT (boot server trả) — đổi site HOẶC nâng cấp Frappe tự
 * tách cache, không cần app tự nhớ ghép đúng thứ tự/field. */
export function createScopeKey(boot: Pick<MetaForgeBootDTO, "user" | "lang" | "site_name" | "frappe_version">): string {
  return `${boot.site_name}|${boot.user}|${boot.lang}|${boot.frappe_version}`;
}

/** §8 — Data Import: raw backend status (KHÔNG lowercase). */
export type DataImportRawStatus =
  | "Pending"
  | "Success"
  | "Partial Success"
  | "Error"
  | "Timed Out";

/** UI phase suy ra từ raw (không phải giá trị backend). */
export type DataImportUiPhase = "queued" | "running" | "completed" | "failed";

export interface ImportStatus {
  status: DataImportRawStatus;
  success?: number;
  failed?: number;
  total_records: number;
}

export function toUiPhase(s: DataImportRawStatus): DataImportUiPhase {
  switch (s) {
    case "Pending": return "queued";
    case "Success":
    case "Partial Success": return "completed";
    case "Error":
    case "Timed Out": return "failed";
  }
}

/** §8 — get_preview_from_template: cột đã map từ header file → docfield.
 * Backend serialize Column: header_title (tên cột file), column_number, df (docfield),
 * skip_import (cột không map được → bỏ qua). Giữ lỏng vì shape phụ thuộc phiên bản. */
export interface ImportPreviewColumn {
  header_title?: string;
  column_number?: number;
  skip_import?: boolean;
  df?: { fieldname?: string; label?: string; fieldtype?: string; reqd?: 0 | 1 } | null;
  /** lý do bỏ qua (không tìm thấy field khớp header). */
  import_warnings?: Array<{ message?: string; type?: string }>;
}

/** Cảnh báo mức bảng/hàng khi xem trước (thiếu cột bắt buộc, kiểu sai…). */
export interface ImportPreviewWarning {
  row?: number;
  col?: string | number;
  field?: string;
  message: string;
  type?: string;
}

/** Kết quả get_preview_from_template. `data` = ma trận ô (hàng đầu thường là header). */
export interface ImportPreview {
  columns: ImportPreviewColumn[];
  data: unknown[][];
  warnings?: ImportPreviewWarning[];
  /** một số bản trả về danh sách field bắt buộc còn thiếu. */
  template_warnings?: ImportPreviewWarning[];
  max_rows_exceeded?: boolean;
  total_rows?: number;
}

/** §9 — Permission: ptype phụ thuộc TỪNG doctype (doctype_ptype_map), không phẳng. */
export interface RolesAndDoctypes {
  roles: LabelValue[];
  doctypes: LabelValue[];
  doctype_ptype_map: Record<string, string[]>;
}

export interface DocPermRule {
  parent: string;
  role: string;
  permlevel: number;
  if_owner?: 0 | 1;
  [ptype: string]: unknown;
}

/** §10 — Backup: LIST path 30 ngày (4 khoá gồm config), KHÔNG tạo mới. */
export interface BackupList {
  database: string;
  public: string;
  private: string;
  config: string;
}

/** §10 — Tree node. */
export interface TreeNode {
  value: string;
  title?: string;
  expandable?: boolean;
  [k: string]: unknown;
}
export interface TreeNodeArgs {
  doctype: string;
  parent: string;
  is_root?: boolean;
  [field: string]: unknown;
}

/** §12 — Notification. */
export interface NotificationLog {
  name: string;
  subject?: string;
  type?: string;
  document_type?: string;
  document_name?: string;
  read?: 0 | 1;
  creation?: string;
}
export interface NotificationListResult {
  notification_logs: NotificationLog[];
  user_info: Record<string, { fullname?: string; image?: string }>;
}

/** §12 — Kanban. */
export interface KanbanBoard {
  name: string;
  reference_doctype: string;
  field_name: string;
  columns: Array<{ column_name: string; status?: string; indicator?: string }>;
}
export interface KanbanMoveArgs {
  board: string;
  docname: string;
  from: string;
  to: string;
  oldIndex: number;
  newIndex: number;
}

/** §12 — Workspace. */
export interface WorkspaceItem {
  name: string;
  label: string;
  icon?: string;
  parent_page?: string;
  public?: 0 | 1;
}
export interface WorkspacePage {
  charts: unknown[];
  shortcuts: unknown[];
  cards: unknown[];
  onboardings: unknown[];
  quick_lists: unknown[];
  number_cards: unknown[];
  custom_blocks: unknown[];
}

/** get_desktop_page cần page descriptor (name bắt buộc; title/public tăng cache-hit),
 * KHÔNG chỉ là tên chuỗi. Backend làm loads(page).get("name"). */
export interface WorkspacePageRef {
  name: string;
  title?: string;
  public?: 0 | 1 | boolean;
}

/** §7 — Report. */
export interface ReportScript {
  script: string;
  html_format?: string;
  execution_time?: number;
}
export interface ReportResult {
  result: unknown[];
  columns: unknown[];
  message?: string;
  chart?: unknown;
  report_summary?: unknown;
  skip_total_row?: 0 | 1;
  status?: string;
  execution_time?: number;
  /**
   * Frappe trả cờ này (KÈM `doc`, KHÔNG kèm columns/result) khi Report bật "Prepared Report":
   * việc chạy bị đẩy vào hàng đợi nền thay vì tính ngay. `doc` = tên bản Prepared Report đã
   * chạy xong nếu có, `null` nếu server vừa mới xếp hàng.
   */
  prepared_report?: boolean;
  doc?: string | null;
}

/** §4/§11 — Workflow transition (nguồn sự thật = server get_transitions; FE chỉ trình bày). */
export interface WorkflowTransition {
  action: string;
  next_state: string;
  /** role được phép (server đã lọc theo user; giữ để hiển thị/nhóm). */
  allowed?: string;
  allow_self_approval?: 0 | 1;
  [k: string]: unknown;
}

/** P1-WF-01 — descriptor SERVER-AUTHORITATIVE: transitions=[] tự nó KHÔNG phân biệt được "doctype
 * không có workflow" với "có workflow nhưng user/trạng thái hiện tại hết transition" (vd trạng thái
 * cuối, hoặc user không có role cho transition nào). `has_workflow` tách bạch 2 case này — xác định
 * CHỈ từ `frappe.model.workflow.get_workflow_name(doctype)` (KHÔNG phụ thuộc quyền/state của doc cụ
 * thể, giống đọc DocType schema). Verified LIVE 2026-07-24 (metaforge.api.get_workflow_transitions):
 * User (không workflow)→{false,[]} · ToDo Pending→{true,[1 transition]} · ToDo Approved (trạng thái
 * cuối, apply_workflow thật)→{true,[]}. */
export interface WorkflowTransitionsResult {
  has_workflow: boolean;
  transitions: WorkflowTransition[];
}

/** P0-09 — tham số Link typeahead (search_link). filters/query/reference + page_length. */
export interface LinkSearchArgs {
  /** dict/list filter (dựng từ field.link_filters + ngữ cảnh doc ở tầng control). */
  filters?: Record<string, unknown> | Array<unknown>;
  /** whitelisted server query method (get_query) — nếu doctype/field khai báo. */
  query?: string;
  /** parent doctype → reference_doctype (server áp user-permission theo tham chiếu). */
  referenceDoctype?: string;
  /** page_length (mặc định 10). */
  pageLength?: number;
  /** huỷ request (best-effort; seq-guard ở control mới là bảo đảm chống race). */
  signal?: AbortSignal;
}

/** §5 — Global search (orch metaforge.api.global_search — KHÔNG loop searchLink từng DocType). */
export interface GlobalSearchResult {
  doctype: string;
  name: string;
  title?: string;
  content?: string;
}

/** §9 — Effective capabilities FAIL-CLOSED (metaforge.api.get_capabilities → has_permission).
 * Nguồn sự thật cho form actions; unknown/loading ⇒ TẤT CẢ false (KHÔNG optimistic). */
export interface Capabilities {
  read: boolean;
  write: boolean;
  create: boolean;
  delete: boolean;
  submit: boolean;
  cancel: boolean;
  amend: boolean;
}

/** Mặc định fail-closed khi chưa có dữ liệu capability (đang tải / lỗi). */
export const NO_CAPS: Capabilities = {
  read: false, write: false, create: false, delete: false, submit: false, cancel: false, amend: false,
};

/** §5 — Chia sẻ (docshare) 1 doc — frappe.share.get_users trả mảng row DocShare.
 * Cờ quyền là 0|1; `everyone`/`submit` có thể vắng tuỳ doctype. */
export interface ShareInfo {
  user: string;
  read?: 0 | 1;
  write?: 0 | 1;
  share?: 0 | 1;
  submit?: 0 | 1;
  everyone?: 0 | 1;
  [k: string]: unknown;
}

/** §5 — Liên kết: số doc liên quan theo linked DocType (get_open_count đã normalize).
 * Shape backend đa dạng ({count:[{name,count}]} | {count:{DocType:n}}) → adapter map về đây. */
export interface ConnectionCount {
  doctype: string;
  count: number;
  /** Nhãn nghiệp vụ của DocType đích, ví dụ "Đơn giá theo bảng giá". */
  label?: string;
  /** Link field tạo ra quan hệ này; dùng để mở đúng danh sách đã lọc. */
  fieldname?: string;
  /** Nhãn ngắn của quan hệ, ví dụ "Mã hàng". */
  relation_label?: string;
  /** Giá trị cần lọc ở fieldname. */
  value?: string;
}
