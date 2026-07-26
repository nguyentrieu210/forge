/**
 * FrappeAdapter — nơi DUY NHẤT chạm API Frappe (api-map.md).
 * Renderer/View/Builder chỉ gọi interface này (Plugin Arch: AdapterRegistry).
 * Mọi signature bám contract đã verified 16.29.0.
 */
import type {
  DocTypeMeta,
  Doc,
  DocInfo,
  ListOpts,
  Filters,
  LinkResult,
  AppError,
  RuntimeAssets,
  BusinessContextState,
  BusinessContextSelection,
  BusinessContextKey,
  ApplicationCatalog,
  OverviewDashboard,
  ProcessCatalog,
  AccessProfileSummary,
  EffectivePermissionResult,
  DisplayValueRequest,
  DisplayValueResult,
} from "@metaforge/core";
import type {
  MetaForgeBootDTO,
  ImportStatus,
  ImportPreview,
  RolesAndDoctypes,
  DocPermRule,
  BackupList,
  TreeNode,
  TreeNodeArgs,
  NotificationListResult,
  KanbanBoard,
  KanbanMoveArgs,
  WorkspaceItem,
  WorkspacePage,
  WorkspacePageRef,
  ReportScript,
  ReportResult,
  WorkflowTransition,
  WorkflowTransitionsResult,
  GlobalSearchResult,
  LinkSearchArgs,
  Capabilities,
  ShareInfo,
  ConnectionCount,
} from "./dto.js";

export interface UploadOpts {
  isPrivate?: 0 | 1;
  doctype?: string;
  docname?: string;
  fieldname?: string;
  folder?: string;
}
export interface AssignArgs {
  assignTo: string[];
  doctype: string;
  name: string;
  description?: string;
  assignmentRule?: string;
}
export interface EmailArgs {
  doctype: string;
  name: string;
  recipients: string;
  subject: string;
  content: string;
  sendEmail?: boolean;
  printFormat?: string;
  cc?: string;
  bcc?: string;
  attachments?: string[];
  sendMeACopy?: 0 | 1;
}
export interface RunReportOpts {
  ignorePreparedReport?: boolean;
  customColumns?: unknown[];
  isTree?: boolean;
  parentField?: string;
}
export interface TemplateOpts {
  /** {'Sales Invoice': ['name','customer'], ...} */
  exportFields?: Record<string, string[]>;
  /** 'all' | 'by_filter' | 'blank_template' */
  exportRecords?: "all" | "by_filter" | "blank_template";
  exportFilters?: Record<string, unknown>;
  fileType?: "CSV" | "Excel";
}
export interface CustomizeChanges {
  fields?: unknown[];
  propertySetters?: unknown[];
}
export interface WorkflowDef { name: string; document_type: string; [k: string]: unknown; }
export interface PrintFormatDef { name: string; doc_type: string; [k: string]: unknown; }
export interface DashboardDef { name: string; charts?: unknown[]; cards?: unknown[]; [k: string]: unknown; }
export interface DocTypeMetaInput { [k: string]: unknown; }

export interface FrappeAdapter {
  // auth/boot — §1
  login(usr: string, pwd: string): Promise<void>;
  logout(): Promise<void>;
  getBoot(): Promise<MetaForgeBootDTO>;
  /** Context toàn cục resolved theo role + User Permission. */
  getBusinessContext(appId: string, dimensions?: BusinessContextKey[], selection?: BusinessContextSelection): Promise<BusinessContextState>;
  /** Catalog ứng dụng/workspace permission-aware. */
  getApplicationCatalog(appId?: string): Promise<ApplicationCatalog>;
  getOverview(domain: string, selection?: BusinessContextSelection): Promise<OverviewDashboard>;
  getProcesses(domain: string, selection?: BusinessContextSelection): Promise<ProcessCatalog>;
  getAccessProfile(user?: string): Promise<AccessProfileSummary>;
  explainPermission(doctype: string, name?: string, selection?: BusinessContextSelection, user?: string): Promise<EffectivePermissionResult>;
  addUserPermission(args: { user: string; allow: string; forValue: string; applicableFor?: string; isDefault?: boolean; hideDescendants?: boolean }): Promise<Record<string, unknown>>;
  removeUserPermission(name: string): Promise<void>;
  setUserRoles(user: string, roles: string[], roleProfile?: string): Promise<string[]>;
  resolveDisplayValues(items: DisplayValueRequest[]): Promise<DisplayValueResult[]>;
  translateStrings(strings: string[], lang?: string): Promise<Record<string, string>>;
  /** Cài CSRF token (từ boot) cho mọi request ghi sau đó (P1-AUTH-01: AuthBoundary gọi ngay khi boot xong). */
  setCsrfToken(token: string): void;
  /** Đăng ký callback khi PHÁT HIỆN mất xác thực (kind "auth" — 401/AuthenticationError/SessionExpired)
   * từ BẤT KỲ lời gọi nào (không chỉ getBoot ban đầu) → dùng để tự đưa UI về trạng thái guest giữa phiên
   * (session-expiry recovery), KHÔNG đợi reload trang. Trả về hàm huỷ đăng ký. */
  onSessionExpired(cb: () => void): () => void;

  // meta + assets — §2 / §Q
  getMeta(doctype: string): Promise<DocTypeMeta>;
  getAssets(doctype: string): Promise<RuntimeAssets>;

  // document CRUD — §3
  getDoc(dt: string, name: string): Promise<{ doc: Doc; docinfo: DocInfo }>;
  getList(dt: string, opts?: ListOpts): Promise<Doc[]>;
  /** Server-scoped list: applies Company/Fiscal Year/Warehouse, including warehouse fields in child tables. */
  getContextualList(dt: string, opts?: ListOpts, selection?: BusinessContextSelection): Promise<Doc[]>;
  /** P1-10 — đếm KHỚP list: có orFilters ⇒ reportview.get_count (nhận or_filters), khớp search. */
  getCount(dt: string, filters?: Filters, orFilters?: Filters): Promise<number>;
  getContextualCount(dt: string, filters?: Filters, orFilters?: Filters, selection?: BusinessContextSelection): Promise<number>;
  getValue(dt: string, filters: Filters, field: string): Promise<unknown>;
  createDoc(dt: string, doc: Partial<Doc>): Promise<Doc>;
  updateDoc(dt: string, name: string, doc: Partial<Doc>, modified: string): Promise<Doc>;
  deleteDoc(dt: string, name: string): Promise<void>;
  submit(doc: Doc): Promise<Doc>;
  cancel(dt: string, name: string): Promise<Doc>;
  rename(dt: string, oldName: string, newName: string, merge?: boolean): Promise<string>;
  bulkDelete(dt: string, names: string[]): Promise<Array<{ name: string; ok: boolean }>>;
  amend(dt: string, name: string): Promise<Doc>; // §13

  // gọi whitelisted-method generic — cho App-mode experiences dùng API nghiệp vụ tuỳ app
  // (vd aphvh.api.wms.transfer_receive). Trả message đã unwrap.
  callGet<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T>;
  callPost<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T>;

  // workflow — §4 / §11
  applyWorkflow(doc: Doc, action: string): Promise<Doc>;
  workflowActionWithComment(dt: string, name: string, action: string, comment?: string): Promise<Doc>;
  /** nguồn sự thật cho nút workflow — server lọc theo state+role (frappe.model.workflow.get_transitions). */
  /** P1-WF-01 — has_workflow tách bạch "không có workflow" khỏi "có workflow nhưng hết transition
   * cho user/trạng thái hiện tại" (transitions=[] tự nó không phân biệt được 2 case). */
  getTransitions(doc: Doc): Promise<WorkflowTransitionsResult>;

  // timeline/social/search/file — §5
  addComment(dt: string, name: string, content: string): Promise<{ name: string }>;
  assign(args: AssignArgs): Promise<void>;
  /** gỡ 1 người khỏi assignment (frappe.desk.form.assign_to.remove). */
  assignRemove(dt: string, name: string, assignTo: string): Promise<void>;
  /** gắn tag (_user_tags) — frappe.desk.doctype.tag.tag.add_tag → trả tên tag. */
  addTag(dt: string, name: string, tag: string): Promise<string>;
  removeTag(dt: string, name: string, tag: string): Promise<void>;
  /** P0-09 — Link typeahead (frappe.desk.search.search_link) với filters/query/reference/page_length. */
  searchLink(dt: string, txt: string, opts?: LinkSearchArgs): Promise<LinkResult[]>;
  /** tìm bản ghi xuyên DocType (orch metaforge.api.global_search). */
  globalSearch(text: string, opts?: { doctype?: string; limit?: number }): Promise<GlobalSearchResult[]>;
  /** §9 — Effective capabilities fail-closed (metaforge.api.get_capabilities). name bỏ ⇒ new-doc. */
  getCapabilities(doctype: string, name?: string): Promise<Capabilities>;
  uploadFile(file: File, opts: UploadOpts): Promise<{ file_url: string; name: string }>;

  // share / connections — §5
  /** danh sách chia sẻ (DocShare) của 1 doc — frappe.share.get_users. */
  getShares(dt: string, name: string): Promise<ShareInfo[]>;
  /** thêm 1 người vào chia sẻ (mặc định read=1) — frappe.share.add. */
  addShare(dt: string, name: string, user: string, perms?: { read?: 0 | 1; write?: 0 | 1; share?: 0 | 1 }): Promise<void>;
  /** gỡ 1 người khỏi chia sẻ — frappe.share.remove. */
  removeShare(dt: string, name: string, user: string): Promise<void>;
  /** số doc liên kết theo dashboard link — frappe.desk.notifications.get_open_count (đã normalize). */
  getConnections(dt: string, name: string): Promise<ConnectionCount[]>;

  // print/email — §6
  printHtml(dt: string, name: string, format?: string): Promise<string>;
  downloadPdf(dt: string, name: string, format?: string): Promise<Blob>;
  sendEmail(a: EmailArgs): Promise<{ name: string }>;

  // report — §7
  getReportScript(name: string): Promise<ReportScript>;
  runReport(name: string, filters?: Filters, o?: RunReportOpts): Promise<ReportResult>;
  exportQuery(dt: string, o: Record<string, unknown>): Promise<Blob>;

  // data import — §8 (raw status)
  import: {
    downloadTemplate(dt: string, o?: TemplateOpts): Promise<Blob>;
    preview(dataImport: string, file: string): Promise<ImportPreview>;
    start(dataImport: string): Promise<void>; // form_start_import (KHÔNG start_import)
    status(dataImport: string): Promise<ImportStatus>;
    erroredTemplate(dataImport: string): Promise<Blob>;
  };

  // permission — §9 (ptype ĐỘNG, SysMgr)
  perm: {
    rolesAndDoctypes(): Promise<RolesAndDoctypes>;
    get(dt?: string, role?: string): Promise<DocPermRule[]>;
    add(parent: string, role: string, permlevel: number): Promise<void>;
    update(dt: string, role: string, permlevel: number, ptype: string, value: 0 | 1, ifOwner?: 0 | 1): Promise<void>;
    remove(dt: string, role: string, permlevel: number, ifOwner?: 0 | 1): Promise<void>;
    reset(dt: string): Promise<void>;
  };

  // dashboard/tree/backup — §10
  numberCardResult(doc: unknown, filters: Filters): Promise<number>;
  dashboardChart(name: string, filters?: Filters): Promise<{ labels: string[]; datasets: unknown[] }>;
  treeChildren(dt: string, parent: string, includeDisabled?: boolean): Promise<TreeNode[]>;
  treeAddNode(args: TreeNodeArgs): Promise<void>; // native add_node → null, sau đó refetch
  addTreeNodeReturning?(args: TreeNodeArgs): Promise<TreeNode>; // orch §11 nếu cần node ngay
  treeReparent(dt: string, name: string, newParent: string, modified: string): Promise<Doc>;
  listRecentBackups(): Promise<BackupList>; // LIST 30 ngày, KHÔNG tạo

  // session — §9/§11
  updatePassword(newPwd: string, o?: { logoutAll?: 0 | 1; oldPassword?: string; key?: string }): Promise<void>;
  logoutOtherSessions(): Promise<void>; // orch wrap clear_sessions(keep_current=True)

  // notification / workspace / kanban — §12
  notifications: {
    list(limit?: number): Promise<NotificationListResult>;
    markAsRead(docname: string): Promise<void>;
    markAllRead(): Promise<void>;
    triggerIndicatorHide(): Promise<void>;
  };
  getWorkspaces(): Promise<WorkspaceItem[]>;
  getWorkspace(page: string | WorkspacePageRef): Promise<WorkspacePage>; // string = tên; nên truyền ref để cache-hit
  kanban: {
    boards(dt: string): Promise<KanbanBoard[]>;
    moveCard(a: KanbanMoveArgs): Promise<void>; // update_order_for_single_card → set_value(field=to)
    moveCardWithComment?(a: KanbanMoveArgs & { comment: string }): Promise<void>; // orch §11
  };

  // builder schema mutations — §13 (CRUD meta-DocType)
  saveMeta(dt: string, meta: DocTypeMetaInput): Promise<void>;
  saveCustomize(dt: string, c: CustomizeChanges): Promise<void>;
  saveWorkflow(wf: WorkflowDef): Promise<void>;
  savePrintFormat(pf: PrintFormatDef): Promise<void>;
  saveDashboard(d: DashboardDef): Promise<void>;

  // cross-cutting — client-side (KHÔNG RPC)
  mapError(e: unknown): AppError;
  csrfToken(): string;
  deskFallbackUrl(dt: string, name?: string): string;
  realtime?: { on(event: string, cb: (...a: unknown[]) => void): () => void };
}
