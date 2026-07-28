/**
 * FrappeAdapterImpl — implement FrappeAdapter bằng frappe-js-sdk + call() theo api-map.md.
 * Đây là nơi DUY NHẤT chạm HTTP Frappe. Mọi endpoint bám contract đã verified 16.29.0.
 *
 * Lưu ý SDK: call().get/post trả `response.data` (envelope `{message}` cho method call),
 * nên phải tự bóc `.message`. Lỗi ném ra đã kèm `exc_type` + `httpStatus` → mapError §0.
 */
import { FrappeApp } from "frappe-js-sdk";
import {
  mapError as coreMapError,
  normalizeMeta,
  type AppError,
  type DocTypeMeta,
  type Doc,
  type DocInfo,
  type ListOpts,
  type Filters,
  type LinkResult,
  type RuntimeAssets,
  type BusinessContextState,
  type BusinessContextSelection,
  type BusinessContextKey,
  type ApplicationCatalog,
  type AppManifest,
  type OverviewDashboard,
  type ProcessCatalog,
  type AccessProfileSummary,
  type TenantUser,
  type EffectivePermissionResult,
  type DisplayValueRequest,
  type DisplayValueResult,
} from "@metaforge/core";
import type {
  FrappeAdapter,
  AssignArgs,
  EmailArgs,
  RunReportOpts,
  TemplateOpts,
  UploadOpts,
  CustomizeChanges,
  WorkflowDef,
  PrintFormatDef,
  DashboardDef,
  DocTypeMetaInput,
} from "./adapter.js";
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
  WorkflowTransitionsResult,
  GlobalSearchResult,
  LinkSearchArgs,
  Capabilities,
  ShareInfo,
  ConnectionCount,
} from "./dto.js";

interface Envelope<T> {
  message: T;
}

export interface FrappeAdapterOptions {
  /** base URL site Frappe headless (rỗng = same-origin khi nhúng trong app metaforge). */
  url?: string;
  getCsrfToken?: () => string;
  /** Token auth (dùng cho headless/Node/smoke test — trình duyệt dùng cookie session). */
  token?: {
    /** trả về "api_key:api_secret" (type "token") hoặc JWT (type "Bearer"). */
    value: () => string;
    type?: "Bearer" | "token";
  };
  /** header tuỳ biến mỗi request — vd `{ "X-Frappe-Site-Name": "metaforge.localhost" }`
   * cho site sau nginx hardcode. Trình duyệt thường để proxy tiêm, headless thì set ở đây. */
  headers?: Record<string, string>;
}

export class FrappeAdapterImpl implements FrappeAdapter {
  private app: FrappeApp;
  private csrf: () => string;
  private csrfValue = "";
  private sessionExpiredHandlers = new Set<() => void>();

  constructor(opts: FrappeAdapterOptions = {}) {
    const tokenParams = opts.token
      ? { useToken: true, token: opts.token.value, type: opts.token.type ?? "token" }
      : undefined;
    this.app = new FrappeApp(opts.url ?? "", tokenParams, undefined, opts.headers);
    this.csrf = opts.getCsrfToken ?? (() => this.csrfValue);
    // frappe-js-sdk tự đọc `window.csrf_token` trong interceptor riêng của nó (không đi qua getCsrfToken
    // ở trên) — setCsrfToken() ghi cả 2 nơi để mọi request ghi (db/call/file, cùng dùng chung axios) đều
    // tự động có X-Frappe-CSRF-Token mà không cần app tự set header thủ công.
    this.app.axios.interceptors.response.use(
      (response) => response,
      (error: unknown) => {
        // Chỉ kind "auth" (401/AuthenticationError/SessionExpired) mới là MẤT XÁC THỰC thật —
        // "permission" (403 trên 1 bản ghi cụ thể) KHÔNG được coi là hết phiên (tránh đá user
        // về màn login chỉ vì thiếu quyền một thao tác).
        if (coreMapError(error).kind === "auth") {
          for (const cb of this.sessionExpiredHandlers) {
            try {
              cb();
            } catch {
              // cô lập lỗi của 1 handler, không làm hỏng chuỗi reject gốc
            }
          }
        }
        return Promise.reject(error);
      },
    );
  }

  setCsrfToken(token: string): void {
    this.csrfValue = token;
    if (typeof globalThis !== "undefined") {
      (globalThis as { csrf_token?: string }).csrf_token = token;
    }
  }
  onSessionExpired(cb: () => void): () => void {
    this.sessionExpiredHandlers.add(cb);
    return () => {
      this.sessionExpiredHandlers.delete(cb);
    };
  }

  private unwrap<T>(r: Envelope<T> | T): T {
    return r && typeof r === "object" && "message" in (r as object)
      ? (r as Envelope<T>).message
      : (r as T);
  }

  // ── auth/boot §1 ──────────────────────────────────────────────────────────
  async login(usr: string, pwd: string): Promise<void> {
    await this.app.auth().loginWithUsernamePassword({ username: usr, password: pwd });
  }
  async logout(): Promise<void> {
    await this.app.auth().logout();
  }
  async getBoot(): Promise<MetaForgeBootDTO> {
    const r = await this.app.call().get<Envelope<MetaForgeBootDTO>>("metaforge.api.get_boot");
    return this.unwrap(r);
  }
  async getBusinessContext(appId: string, dimensions?: BusinessContextKey[], selection?: BusinessContextSelection): Promise<BusinessContextState> {
    const r = await this.app.call().get<Envelope<BusinessContextState>>("metaforge.api.get_business_context", {
      app_id: appId,
      dimensions: dimensions ? JSON.stringify(dimensions) : undefined,
      selection: selection ? JSON.stringify(selection) : undefined,
    });
    return this.unwrap(r);
  }
  async getApplicationCatalog(appId?: string): Promise<ApplicationCatalog> {
    const r = await this.app.call().get<Envelope<ApplicationCatalog>>("metaforge.api.get_application_catalog", { app_id: appId });
    return this.unwrap(r);
  }
  async getAppManifest(appId?: string): Promise<AppManifest> {
    const r = await this.app.call().get<Envelope<AppManifest>>("metaforge.api.get_app_manifest", { app: appId });
    return this.unwrap(r);
  }
  async getOverview(domain: string, selection?: BusinessContextSelection): Promise<OverviewDashboard> {
    const r = await this.app.call().get<Envelope<OverviewDashboard>>("metaforge.api.get_overview", {
      domain,
      context: selection ? JSON.stringify(selection) : undefined,
    });
    return this.unwrap(r);
  }
  async getProcesses(domain: string, selection?: BusinessContextSelection): Promise<ProcessCatalog> {
    const r = await this.app.call().get<Envelope<ProcessCatalog>>("metaforge.api.get_processes", {
      domain,
      context: selection ? JSON.stringify(selection) : undefined,
    });
    return this.unwrap(r);
  }
  async getAccessProfile(user?: string): Promise<AccessProfileSummary> {
    const r = await this.app.call().get<Envelope<AccessProfileSummary>>("metaforge.api.get_access_profile", { user });
    return this.unwrap(r);
  }
  async explainPermission(doctype: string, name?: string, selection?: BusinessContextSelection, user?: string): Promise<EffectivePermissionResult> {
    const r = await this.app.call().get<Envelope<EffectivePermissionResult>>("metaforge.api.explain_permission", {
      doctype, name, user, context: selection ? JSON.stringify(selection) : undefined,
    });
    return this.unwrap(r);
  }
  async addUserPermission(args: { user: string; allow: string; forValue: string; applicableFor?: string; isDefault?: boolean; hideDescendants?: boolean }): Promise<Record<string, unknown>> {
    const r = await this.app.call().post<Envelope<Record<string, unknown>>>("metaforge.api.add_user_permission", {
      user: args.user, allow: args.allow, for_value: args.forValue, applicable_for: args.applicableFor,
      is_default: args.isDefault ? 1 : 0, hide_descendants: args.hideDescendants ? 1 : 0,
    });
    return this.unwrap(r);
  }
  async removeUserPermission(name: string): Promise<void> {
    await this.app.call().post("metaforge.api.remove_user_permission", { name });
  }
  async setUserRoles(user: string, roles: string[], roleProfile?: string): Promise<string[]> {
    const r = await this.app.call().post<Envelope<{ roles: string[] }>>("metaforge.api.set_user_roles", { user, roles: JSON.stringify(roles), role_profile: roleProfile ?? "" });
    return this.unwrap(r).roles ?? [];
  }
  /** Mọi tài khoản đăng nhập được của tenant, kèm vai trò và danh sách vai trò có thể gán. */
  async listUsers(): Promise<{ users: TenantUser[]; available_roles: string[] }> {
    const r = await this.app.call().get<Envelope<{ users: TenantUser[]; available_roles: string[] }>>("metaforge.api.list_users", {});
    const value = this.unwrap(r);
    return { users: value?.users ?? [], available_roles: value?.available_roles ?? [] };
  }
  /** Tạo tài khoản + đặt mật khẩu + gán vai trò trong MỘT lời gọi — xem `createUser` phía server. */
  async createUser(input: { user: string; password: string; fullName?: string; email?: string; roles?: string[] }): Promise<{ user: string; roles: string[] }> {
    const r = await this.app.call().post<Envelope<{ user: string; roles: string[] }>>("metaforge.api.create_user", {
      user: input.user, password: input.password,
      full_name: input.fullName ?? "", email: input.email ?? "",
      roles: JSON.stringify(input.roles ?? []),
    });
    const value = this.unwrap(r);
    return { user: value?.user ?? input.user, roles: value?.roles ?? [] };
  }
  /** Khoá hoặc mở lại một tài khoản. Không xoá — user id là `owner` của mọi chứng từ họ đã lập. */
  async setUserEnabled(user: string, enabled: boolean): Promise<void> {
    await this.app.call().post("metaforge.api.set_user_enabled", { user, enabled: enabled ? 1 : 0 });
  }
  async resolveDisplayValues(items: DisplayValueRequest[]): Promise<DisplayValueResult[]> {
    const r = await this.app.call().post<Envelope<DisplayValueResult[]>>("metaforge.api.resolve_display_values", { items: JSON.stringify(items) });
    return this.unwrap(r) ?? [];
  }
  async translateStrings(strings: string[], lang?: string): Promise<Record<string, string>> {
    const r = await this.app.call().post<Envelope<Record<string, string>>>("metaforge.api.translate_strings", {
      strings: JSON.stringify(strings), lang,
    });
    return this.unwrap(r) ?? {};
  }

  // ── meta §2 / §Q ──────────────────────────────────────────────────────────
  async getMeta(doctype: string): Promise<DocTypeMeta> {
    const r = await this.app
      .call()
      .get<{ docs: DocTypeMeta[]; masked_fields?: string[] }>("frappe.desk.form.load.getdoctype", {
        doctype,
        with_parent: 1,
      });
    /**
     * PHẢI tìm theo TÊN, không lấy `docs[0]`.
     *
     * `getdoctype(..., with_parent=1)` khi được hỏi về một CHILD DocType sẽ trả về nguyên bundle
     * của DocType CHA (mã Frappe: `if with_parent and (parent_dt := get_parent_dt(doctype)):
     * docs = get_meta_bundle(parent_dt)`). Bundle đó xếp cha ở đầu, các child theo sau — nên
     * `docs[0]` là CHA chứ không phải thứ mình hỏi.
     *
     * Hậu quả khi lấy mù phần tử đầu: hỏi meta "Material Request Item" lại nhận về "Material
     * Request", và MỌI BẢNG CON trong app vẽ cột bằng field của phiếu cha — bảng dòng hàng hiện
     * "Mục đích / Ngày giao dịch" lặp lại của đầu phiếu, trong khi Mã hàng và Số lượng biến mất
     * hoàn toàn, tức là không nhập được thứ cần nhập.
     */
    const raw = r.docs?.find((d) => d?.name === doctype) ?? r.docs?.[0];
    if (!raw) throw { httpStatus: 404, exc_type: "DoesNotExistError", doctype };
    // P0-08: raw → VALIDATE + normalize → canonical (không cast mù; giữ extension; tag _compat).
    const normalized = normalizeMeta(raw, r.masked_fields);
    // Metadata label từ Frappe thường là chuỗi nguồn tiếng Anh. Batch qua frappe._() theo lang user
    // để Form/List/Child/Builder dùng label đã dịch, không render thẳng key/source text.
    // Nhãn do APP KHAI cũng vào từ điển: nó có thể đã là tiếng Việt (thì `dict` không có
    // và nó tự giữ nguyên), hoặc là tiếng Anh và cần dịch như mọi chuỗi nguồn khác.
    const sources = new Set<string>([normalized.name, ...(normalized.label ? [normalized.label] : [])]);
    for (const field of normalized.fields ?? []) {
      if (field.label) sources.add(field.label);
      // `description` = dòng chú thích dưới label (vd "Disabled items cannot be selected in any
      // transaction."). TRƯỚC ĐÂY KHÔNG gom ⇒ label ra tiếng Việt còn chú thích vẫn tiếng Anh,
      // form nhìn như dịch dở. Frappe/ERPNext có sẵn bản dịch cho các chuỗi này.
      if (typeof field.description === "string" && field.description) sources.add(field.description);
      if (field.fieldtype === "Select" && field.options) for (const option of field.options.split("\n")) if (option) sources.add(option);
    }
    const dict: Record<string, string> = await this.translateStrings([...sources]).catch(() => ({} as Record<string, string>));
    return {
      ...normalized,
      /**
       * Nhãn do APP KHAI thắng, rồi mới tới bản dịch của TÊN.
       *
       * Dòng này trước đây là `dict[normalized.name] ?? normalized.name` — tức là vứt bỏ
       * `label` server vừa gửi và thay bằng chính cái tên kỹ thuật. Nó đúng với giả định
       * của Frappe (nhãn sinh ra từ `frappe._()` trên chuỗi nguồn tiếng Anh), nhưng sai
       * với nền tảng này: app KHAI nhãn trong brief, và đó là ý định của tác giả app.
       *
       * Hậu quả rất khó truy: server trả đúng "Khách hàng", trình duyệt nhận đúng
       * "Khách hàng", mà màn hình vẫn hiện "Tạo customer" — vì nhãn bị thay ở đúng bước
       * cuối cùng, sau khi mọi phép thử phía server đã xanh.
       */
      label: normalized.label
        ? (dict[normalized.label] ?? normalized.label)
        : (dict[normalized.name] ?? normalized.name),
      fields: normalized.fields.map((field) => ({
        ...field,
        label: field.label ? (dict[field.label] ?? field.label) : field.label,
        description: typeof field.description === "string" && field.description
          ? (dict[field.description] ?? field.description)
          : field.description,
        /**
         * GIỮ NGUYÊN `options` gốc. Bản trước dịch thẳng vào đây và gây hai lỗi cùng lúc:
         *  1. Doc đã lưu giá trị gốc ("Material Transfer") không khớp option nào (giờ là "Chuyển
         *     kho") ⇒ ô Select hiện RỖNG dù bản ghi có giá trị.
         *  2. Người dùng chọn một mục ⇒ ghi chuỗi TIẾNG VIỆT xuống DB, trong khi ERPNext so khớp
         *     theo chuỗi tiếng Anh ⇒ hỏng dữ liệu, sai cả logic tồn kho.
         * Bản dịch để hiển thị đưa sang `optionLabels`.
         */
        optionLabels: field.fieldtype === "Select" && field.options
          ? Object.fromEntries(
              field.options.split("\n").filter(Boolean).map((option) => [option, dict[option] ?? option]),
            )
          : undefined,
      })),
    };
  }
  async getAssets(doctype: string): Promise<RuntimeAssets> {
    return this.getMeta(doctype);
  }

  // ── document CRUD §3 ──────────────────────────────────────────────────────
  async getDoc(dt: string, name: string): Promise<{ doc: Doc; docinfo: DocInfo }> {
    const r = await this.app
      .call()
      .get<{ docs: Doc[]; docinfo: DocInfo }>("frappe.desk.form.load.getdoc", { doctype: dt, name });
    const doc = r.docs?.[0];
    if (!doc) throw { httpStatus: 404, exc_type: "DoesNotExistError", dt, name };
    return { doc, docinfo: r.docinfo };
  }
  async getList(dt: string, opts: ListOpts = {}): Promise<Doc[]> {
    // orderBy "field dir" → { field, order } cho frappe-react-sdk (tránh "modified desc desc").
    let orderBy: { field: string; order?: "asc" | "desc" } | undefined;
    if (opts.orderBy) {
      const [field, order] = opts.orderBy.trim().split(/\s+/);
      orderBy = { field: field!, order: order === "asc" ? "asc" : "desc" };
    }
    return (await this.app.db().getDocList<Doc>(dt, {
      fields: opts.fields ?? ["name"],
      filters: opts.filters as never,
      orFilters: opts.orFilters as never, // search LIKE trên search_fields (M04-LIST-02)
      orderBy,
      limit: opts.pageLength,
      limit_start: opts.limitStart,
    } as never)) as Doc[];
  }
  async getContextualList(dt: string, opts: ListOpts = {}, selection?: BusinessContextSelection): Promise<Doc[]> {
    const r = await this.app.call().get<Envelope<Doc[]>>("metaforge.api.get_contextual_list", {
      doctype: dt,
      fields: JSON.stringify(opts.fields ?? ["name"]),
      filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
      or_filters: opts.orFilters ? JSON.stringify(opts.orFilters) : undefined,
      order_by: opts.orderBy,
      limit_start: opts.limitStart ?? 0,
      page_length: opts.pageLength ?? 20,
      context: selection ? JSON.stringify(selection) : undefined,
    });
    return this.unwrap(r) ?? [];
  }
  async getContextualCount(dt: string, filters?: Filters, orFilters?: Filters, selection?: BusinessContextSelection): Promise<number> {
    const r = await this.app.call().get<Envelope<number>>("metaforge.api.get_contextual_count", {
      doctype: dt,
      filters: filters ? JSON.stringify(filters) : undefined,
      or_filters: orFilters ? JSON.stringify(orFilters) : undefined,
      context: selection ? JSON.stringify(selection) : undefined,
    });
    return Number(this.unwrap(r) ?? 0);
  }
  async getCount(dt: string, filters?: Filters, orFilters?: Filters): Promise<number> {
    // Không search → get_count nhanh (frappe.client.get_count).
    if (!orFilters) return this.app.db().getCount(dt, filters as never);
    // Có search (or_filters) → reportview.get_count (giống Desk) để đếm KHỚP list (P1-10).
    const r = await this.app.call().get<Envelope<number>>("frappe.desk.reportview.get_count", {
      doctype: dt,
      filters: filters ? JSON.stringify(filters) : undefined,
      or_filters: JSON.stringify(orFilters),
    });
    return Number(this.unwrap(r) ?? 0);
  }
  async getValue(dt: string, filters: Filters, field: string): Promise<unknown> {
    const r = await this.app.call().get<Envelope<Record<string, unknown>>>("frappe.client.get_value", {
      doctype: dt,
      filters: JSON.stringify(filters),
      fieldname: field,
    });
    return this.unwrap(r)?.[field];
  }
  async createDoc(dt: string, doc: Partial<Doc>): Promise<Doc> {
    return (await this.app.db().createDoc<Partial<Doc>>(dt, doc)) as Doc;
  }
  async updateDoc(dt: string, name: string, doc: Partial<Doc>, modified: string): Promise<Doc> {
    // gửi lại `modified` để server bắt TimestampMismatch → 417 (mapError → conflict)
    return (await this.app.db().updateDoc<Partial<Doc>>(dt, name, { ...doc, modified })) as Doc;
  }
  async deleteDoc(dt: string, name: string): Promise<void> {
    await this.app.db().deleteDoc(dt, name);
  }
  async submit(doc: Doc): Promise<Doc> {
    const r = await this.app.call().post<Envelope<Doc>>("frappe.client.submit", { doc: JSON.stringify(doc) });
    return this.unwrap(r);
  }
  async cancel(dt: string, name: string): Promise<Doc> {
    const r = await this.app.call().post<Envelope<Doc>>("frappe.client.cancel", { doctype: dt, name });
    return this.unwrap(r);
  }
  async rename(dt: string, oldName: string, newName: string, merge = false): Promise<string> {
    const r = await this.app.call().post<Envelope<string>>("frappe.client.rename_doc", {
      doctype: dt,
      old_name: oldName,
      new_name: newName,
      merge: merge ? 1 : 0,
    });
    return this.unwrap(r);
  }
  async bulkDelete(dt: string, names: string[]): Promise<Array<{ name: string; ok: boolean }>> {
    await this.app.call().post("frappe.desk.reportview.delete_items", {
      doctype: dt,
      items: JSON.stringify(names),
    });
    return names.map((name) => ({ name, ok: true }));
  }
  async amend(dt: string, name: string): Promise<Doc> {
    const { doc } = await this.getDoc(dt, name);
    return this.createDoc(dt, { ...doc, amended_from: name, docstatus: 0, name: undefined as never });
  }

  // ── generic whitelisted-method call (App-mode) ─────────────────────────────
  async callGet<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
    const r = await this.app.call().get<Envelope<T>>(method, args);
    return this.unwrap(r);
  }
  async callPost<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
    const r = await this.app.call().post<Envelope<T>>(method, args);
    return this.unwrap(r);
  }

  // ── workflow §4 / §11 ─────────────────────────────────────────────────────
  async applyWorkflow(doc: Doc, action: string): Promise<Doc> {
    const r = await this.app.call().post<Envelope<Doc>>("frappe.model.workflow.apply_workflow", {
      doc: JSON.stringify(doc),
      action,
    });
    return this.unwrap(r);
  }
  async workflowActionWithComment(dt: string, name: string, action: string, comment?: string): Promise<Doc> {
    const r = await this.app.call().post<Envelope<Doc>>("metaforge.api.workflow_action_with_comment", {
      doctype: dt,
      name,
      action,
      comment,
    });
    return this.unwrap(r);
  }
  async getTransitions(doc: Doc): Promise<WorkflowTransitionsResult> {
    // metaforge.api.get_workflow_transitions bọc frappe.model.workflow.get_transitions (server lọc
    // theo state hiện tại + role user) + has_workflow (P1-WF-01, get_workflow_name — KHÔNG suy từ
    // transitions rỗng, vốn không phân biệt được "không có workflow" với "hết transition khả dụng").
    const r = await this.app.call().post<Envelope<WorkflowTransitionsResult>>("metaforge.api.get_workflow_transitions", {
      doc: JSON.stringify(doc),
    });
    return this.unwrap(r) ?? { has_workflow: false, transitions: [] };
  }

  // ── timeline/search/file §5 ───────────────────────────────────────────────
  async addComment(dt: string, name: string, content: string): Promise<{ name: string }> {
    const r = await this.app.call().post<Envelope<{ name: string }>>("frappe.desk.form.utils.add_comment", {
      reference_doctype: dt,
      reference_name: name,
      content,
      comment_email: "",
      comment_by: "",
    });
    return this.unwrap(r);
  }
  async assign(args: AssignArgs): Promise<void> {
    await this.app.call().post("frappe.desk.form.assign_to.add", {
      assign_to: JSON.stringify(args.assignTo),
      doctype: args.doctype,
      name: args.name,
      description: args.description,
      assignment_rule: args.assignmentRule,
    });
  }
  async assignRemove(dt: string, name: string, assignTo: string): Promise<void> {
    await this.app.call().post("frappe.desk.form.assign_to.remove", {
      doctype: dt,
      name,
      assign_to: assignTo,
    });
  }
  async addTag(dt: string, name: string, tag: string): Promise<string> {
    const r = await this.app.call().post<Envelope<string>>("frappe.desk.doctype.tag.tag.add_tag", {
      tag,
      dt,
      dn: name,
    });
    return this.unwrap(r) ?? tag;
  }
  async removeTag(dt: string, name: string, tag: string): Promise<void> {
    await this.app.call().post("frappe.desk.doctype.tag.tag.remove_tag", {
      tag,
      dt,
      dn: name,
    });
  }
  async searchLink(dt: string, txt: string, opts?: LinkSearchArgs): Promise<LinkResult[]> {
    // P0-09: filters (link_filters+ngữ cảnh) · query (get_query) · reference_doctype (user-perm) · page_length.
    const r = await this.app.call().get<Envelope<LinkResult[]>>("frappe.desk.search.search_link", {
      doctype: dt,
      txt,
      query: opts?.query,
      filters: opts?.filters ? JSON.stringify(opts.filters) : undefined,
      reference_doctype: opts?.referenceDoctype,
      page_length: opts?.pageLength ?? 10,
    });
    return this.unwrap(r) ?? [];
  }
  async globalSearch(text: string, opts?: { doctype?: string; limit?: number }): Promise<GlobalSearchResult[]> {
    // orch server-side (permission-filter ở server) — KHÔNG loop searchLink từng DocType.
    const r = await this.app.call().get<Envelope<GlobalSearchResult[]>>("metaforge.api.global_search", {
      text,
      doctype: opts?.doctype,
      limit: opts?.limit,
    });
    return this.unwrap(r) ?? [];
  }
  async getCapabilities(doctype: string, name?: string): Promise<Capabilities> {
    // §9 — effective capabilities fail-closed (server has_permission). Không optimistic ở client.
    const r = await this.app.call().get<Envelope<Capabilities>>("metaforge.api.get_capabilities", {
      doctype,
      name,
    });
    return this.unwrap(r);
  }
  async uploadFile(file: File, opts: UploadOpts): Promise<{ file_url: string; name: string }> {
    const res = await this.app.file().uploadFile(file, {
      isPrivate: opts.isPrivate === 1,
      doctype: opts.doctype,
      docname: opts.docname,
      fieldname: opts.fieldname,
      folder: opts.folder,
    } as never);
    const data = (res.data as { message?: { file_url: string; name: string } }).message;
    return data ?? { file_url: "", name: "" };
  }

  // ── share / connections §5 ────────────────────────────────────────────────
  async getShares(dt: string, name: string): Promise<ShareInfo[]> {
    const r = await this.app.call().get<Envelope<ShareInfo[]>>("frappe.share.get_users", {
      doctype: dt,
      name,
    });
    return this.unwrap(r) ?? [];
  }
  async addShare(
    dt: string,
    name: string,
    user: string,
    perms?: { read?: 0 | 1; write?: 0 | 1; share?: 0 | 1 },
  ): Promise<void> {
    // read mặc định 1 — chia sẻ mà không cho đọc là vô nghĩa (khớp UI Frappe).
    await this.app.call().post("frappe.share.add", {
      doctype: dt,
      name,
      user,
      read: perms?.read ?? 1,
      write: perms?.write ?? 0,
      share: perms?.share ?? 0,
    });
  }
  async removeShare(dt: string, name: string, user: string): Promise<void> {
    await this.app.call().post("frappe.share.remove", { doctype: dt, name, user });
  }
  async getConnections(dt: string, name: string): Promise<ConnectionCount[]> {
    // get_open_count trả shape đa dạng theo phiên bản: {count:[{name,count,open_count}]} là chuẩn v16,
    // nhưng phòng hờ {count:{DocType:n}} / mảng phẳng / object phẳng → normalize defensive.
    const r = await this.app
      .call()
      .get<Envelope<unknown>>("frappe.desk.notifications.get_open_count", { doctype: dt, name });
    return this.normalizeConnections(this.unwrap(r));
  }
  private normalizeConnections(data: unknown): ConnectionCount[] {
    const out: ConnectionCount[] = [];
    const push = (doctype: unknown, count: unknown): void => {
      const d = typeof doctype === "string" ? doctype : "";
      const n = typeof count === "number" ? count : Number(count);
      if (d && Number.isFinite(n) && n > 0) out.push({ doctype: d, count: n });
    };
    // bóc container: ưu tiên khoá `count` (shape v16), nếu không có thì dùng chính data.
    const container =
      data && typeof data === "object" && "count" in (data as object)
        ? (data as { count: unknown }).count
        : data;
    if (Array.isArray(container)) {
      for (const it of container) {
        if (it && typeof it === "object") {
          const o = it as Record<string, unknown>;
          push(o.name ?? o.doctype ?? o.document_type, o.count ?? o.open_count ?? o.value);
        }
      }
    } else if (container && typeof container === "object") {
      for (const [k, v] of Object.entries(container as Record<string, unknown>)) {
        if (typeof v === "number") push(k, v);
        else if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          push(k, o.count ?? o.open_count ?? o.value);
        }
      }
    }
    return out;
  }

  // ── print/email §6 ────────────────────────────────────────────────────────
  async printHtml(dt: string, name: string, format?: string): Promise<string> {
    // v16: chỉ get_html_and_style được whitelist (KHÔNG có get_html) → trả {html, style}
    //
    // Tham số tên là `doc`, KHÔNG phải `doctype` — và nó mang HAI nghĩa tuỳ cách gọi (v16
    // printview.py:334):
    //     if isinstance(name, str): document = frappe.get_lazy_doc(doc, name)   ← doc = TÊN DOCTYPE
    //     else:                     document = frappe.get_doc(json.loads(doc))  ← doc = JSON tài liệu
    // Gửi `doctype` thì Frappe không nhận ra tham số nào tên vậy, còn `doc` thì thiếu ⇒ server trả
    // "missing 1 required positional argument: 'doc'" và cả tính năng In chết, chỉ hiện "Có lỗi
    // phía máy chủ". Ở các bản trước `doc` có giá trị mặc định nên bug này không lộ ra.
    const r = await this.app
      .call()
      .get<Envelope<{ html: string; style: string }>>("frappe.www.printview.get_html_and_style", {
        doc: dt,
        name,
        print_format: format,
      });
    const { html, style } = this.unwrap(r) ?? { html: "", style: "" };
    return style ? `<style>${style}</style>${html}` : html;
  }
  async downloadPdf(dt: string, name: string, format?: string): Promise<Blob> {
    const r = await this.app.axios.get("/api/method/frappe.utils.print_format.download_pdf", {
      params: { doctype: dt, name, format, no_letterhead: 0 },
      responseType: "blob",
    });
    return r.data as Blob;
  }
  async sendEmail(a: EmailArgs): Promise<{ name: string }> {
    const r = await this.app.call().post<Envelope<{ name: string }>>(
      "frappe.core.doctype.communication.email.make",
      {
        doctype: a.doctype,
        name: a.name,
        recipients: a.recipients,
        subject: a.subject,
        content: a.content,
        send_email: a.sendEmail ?? true,
        print_format: a.printFormat,
        cc: a.cc,
        bcc: a.bcc,
        attachments: a.attachments ? JSON.stringify(a.attachments) : undefined,
        send_me_a_copy: a.sendMeACopy ?? 0,
      },
    );
    return this.unwrap(r);
  }

  // ── report §7 ─────────────────────────────────────────────────────────────
  async getReportScript(name: string): Promise<ReportScript> {
    const r = await this.app.call().get<Envelope<ReportScript>>("frappe.desk.query_report.get_script", {
      report_name: name,
    });
    return this.unwrap(r);
  }
  async runReport(name: string, filters?: Filters, o?: RunReportOpts): Promise<ReportResult> {
    const exec = async (ignorePrepared: boolean): Promise<ReportResult> => {
      const r = await this.app.call().get<Envelope<ReportResult>>("frappe.desk.query_report.run", {
        report_name: name,
        filters: filters ? JSON.stringify(filters) : undefined,
        ignore_prepared_report: ignorePrepared,
        is_tree: o?.isTree ?? false,
        parent_field: o?.parentField,
      });
      return this.unwrap(r);
    };

    const first = await exec(o?.ignorePreparedReport ?? false);

    /**
     * Report bật cờ "Prepared Report" (Stock Balance, General Ledger, Accounts Receivable… —
     * phần lớn report NẶNG của ERPNext đều bật) KHÔNG trả dữ liệu ở lần gọi này. Server đẩy việc
     * vào hàng đợi nền rồi trả về đúng `{prepared_report: true, doc: null}` — không columns,
     * không result.
     *
     * Nếu cứ thế đưa lên màn hình thì người dùng thấy MỘT BẢNG TRẮNG và kết luận "kho không có
     * hàng" — sai hoàn toàn và không có gì gợi ý là đang chờ. Đây chính là lý do "Tồn kho chi
     * tiết" trống trong khi "Sổ kho" (không bật cờ) chạy bình thường.
     *
     * Xử lý: khi server báo đã xếp hàng mà chưa có bản chạy xong (`doc` rỗng), chạy lại ở chế độ
     * đồng bộ để có số liệu NGAY. Đánh đổi: report cực nặng sẽ lâu hơn — chấp nhận được, vì thà
     * chờ mà đúng còn hơn trả lời nhanh bằng một bảng trắng sai sự thật.
     */
    const queuedWithNoData = first?.prepared_report === true && !first.doc && !first.columns?.length;
    if (queuedWithNoData && !o?.ignorePreparedReport) return exec(true);

    return first;
  }
  async exportQuery(dt: string, o: Record<string, unknown>): Promise<Blob> {
    const r = await this.app.axios.get("/api/method/frappe.desk.reportview.export_query", {
      params: { doctype: dt, ...o },
      responseType: "blob",
    });
    return r.data as Blob;
  }

  // ── data import §8 (raw status) ───────────────────────────────────────────
  import = {
    downloadTemplate: async (dt: string, o?: TemplateOpts): Promise<Blob> => {
      const r = await this.app.axios.get("/api/method/frappe.core.doctype.data_import.data_import.download_template", {
        params: {
          doctype: dt,
          export_fields: o?.exportFields ? JSON.stringify(o.exportFields) : undefined,
          export_records: o?.exportRecords,
          export_filters: o?.exportFilters ? JSON.stringify(o.exportFilters) : undefined,
          file_type: o?.fileType ?? "CSV",
        },
        responseType: "blob",
      });
      return r.data as Blob;
    },
    preview: async (dataImport: string, file: string): Promise<ImportPreview> => {
      const r = await this.app
        .call()
        .get<Envelope<ImportPreview>>("frappe.core.doctype.data_import.data_import.get_preview_from_template", {
          data_import: dataImport,
          import_file: file,
        });
      return this.unwrap(r);
    },
    start: async (dataImport: string): Promise<void> => {
      await this.app
        .call()
        .post("frappe.core.doctype.data_import.data_import.form_start_import", { data_import: dataImport });
    },
    status: async (dataImport: string): Promise<ImportStatus> => {
      const r = await this.app
        .call()
        .get<Envelope<ImportStatus>>("frappe.core.doctype.data_import.data_import.get_import_status", {
          data_import_name: dataImport,
        });
      return this.unwrap(r);
    },
    erroredTemplate: async (dataImport: string): Promise<Blob> => {
      const r = await this.app.axios.get(
        "/api/method/frappe.core.doctype.data_import.data_import.download_errored_template",
        { params: { data_import_name: dataImport }, responseType: "blob" },
      );
      return r.data as Blob;
    },
  };

  // ── permission §9 (ptype ĐỘNG, SysMgr) ────────────────────────────────────
  perm = {
    rolesAndDoctypes: async (): Promise<RolesAndDoctypes> => {
      const r = await this.app
        .call()
        .get<Envelope<RolesAndDoctypes>>("frappe.core.page.permission_manager.permission_manager.get_roles_and_doctypes");
      return this.unwrap(r);
    },
    get: async (dt?: string, role?: string): Promise<DocPermRule[]> => {
      const r = await this.app
        .call()
        .get<Envelope<DocPermRule[]>>("frappe.core.page.permission_manager.permission_manager.get_permissions", {
          doctype: dt,
          role,
        });
      return this.unwrap(r) ?? [];
    },
    add: async (parent: string, role: string, permlevel: number): Promise<void> => {
      await this.app.call().post("frappe.core.page.permission_manager.permission_manager.add", { parent, role, permlevel });
    },
    update: async (dt: string, role: string, permlevel: number, ptype: string, value: 0 | 1, ifOwner: 0 | 1 = 0): Promise<void> => {
      await this.app.call().post("frappe.core.page.permission_manager.permission_manager.update", {
        doctype: dt,
        role,
        permlevel,
        ptype,
        value,
        if_owner: ifOwner,
      });
    },
    remove: async (dt: string, role: string, permlevel: number, ifOwner: 0 | 1 = 0): Promise<void> => {
      await this.app.call().post("frappe.core.page.permission_manager.permission_manager.remove", {
        doctype: dt,
        role,
        permlevel,
        if_owner: ifOwner,
      });
    },
    reset: async (dt: string): Promise<void> => {
      await this.app.call().post("frappe.core.page.permission_manager.permission_manager.reset", { doctype: dt });
    },
  };

  // ── dashboard/tree/backup §10 ─────────────────────────────────────────────
  async numberCardResult(doc: unknown, filters: Filters): Promise<number> {
    const r = await this.app
      .call()
      .get<Envelope<number>>("frappe.desk.doctype.number_card.number_card.get_result", {
        doc: JSON.stringify(doc),
        filters: JSON.stringify(filters),
      });
    return this.unwrap(r);
  }
  async dashboardChart(name: string, filters?: Filters): Promise<{ labels: string[]; datasets: unknown[] }> {
    const r = await this.app
      .call()
      .get<Envelope<{ labels: string[]; datasets: unknown[] }>>("frappe.desk.doctype.dashboard_chart.dashboard_chart.get", {
        chart_name: name,
        filters: filters ? JSON.stringify(filters) : undefined,
      });
    return this.unwrap(r);
  }
  async treeChildren(dt: string, parent: string, includeDisabled = false): Promise<TreeNode[]> {
    const r = await this.app.call().get<Envelope<TreeNode[]>>("frappe.desk.treeview.get_children", {
      doctype: dt,
      parent,
      include_disabled: includeDisabled ? 1 : 0,
    });
    return this.unwrap(r) ?? [];
  }
  async treeAddNode(args: TreeNodeArgs): Promise<void> {
    // native trả null; caller refetch children sau đó
    await this.app.call().post("frappe.desk.treeview.add_node", { ...args, is_root: args.is_root ? "true" : "false" });
  }
  async addTreeNodeReturning(args: TreeNodeArgs): Promise<TreeNode> {
    const r = await this.app.call().post<Envelope<TreeNode>>("metaforge.api.add_tree_node", {
      ...args,
      is_root: args.is_root ? "true" : "false",
    });
    return this.unwrap(r);
  }
  async treeReparent(dt: string, name: string, newParent: string, modified: string): Promise<Doc> {
    const parentField = `parent_${dt.toLowerCase().replace(/ /g, "_")}`;
    return this.updateDoc(dt, name, { [parentField]: newParent } as Partial<Doc>, modified);
  }
  async listRecentBackups(): Promise<BackupList> {
    const r = await this.app.call().get<Envelope<BackupList>>("frappe.utils.backups.fetch_latest_backups");
    return this.unwrap(r);
  }

  // ── session §9/§11 ────────────────────────────────────────────────────────
  /**
   * `user` bỏ trống = đổi mật khẩu của CHÍNH mình, và khi đó server đòi mật khẩu cũ.
   *
   * Thiếu tham số này thì quản trị viên không có cách nào đặt lại mật khẩu cho người khác —
   * server vẫn hỗ trợ, chỉ là adapter không gửi lên, nên nút "cấp lại mật khẩu" trong màn
   * phân quyền không thể tồn tại.
   */
  async updatePassword(newPwd: string, o?: { logoutAll?: 0 | 1; oldPassword?: string; key?: string; user?: string }): Promise<void> {
    await this.app.call().post("frappe.core.doctype.user.user.update_password", {
      new_password: newPwd,
      logout_all_sessions: o?.logoutAll ?? 0,
      old_password: o?.oldPassword,
      key: o?.key,
      user: o?.user,
    });
  }
  async logoutOtherSessions(): Promise<void> {
    await this.app.call().post("metaforge.api.logout_other_sessions");
  }

  // ── notification / workspace / kanban §12 ─────────────────────────────────
  notifications = {
    list: async (limit = 20): Promise<NotificationListResult> => {
      const r = await this.app
        .call()
        .get<Envelope<NotificationListResult>>("frappe.desk.doctype.notification_log.notification_log.get_notification_logs", {
          limit,
        });
      return this.unwrap(r);
    },
    markAsRead: async (docname: string): Promise<void> => {
      await this.app.call().post("frappe.desk.doctype.notification_log.notification_log.mark_as_read", { docname });
    },
    markAllRead: async (): Promise<void> => {
      await this.app.call().post("frappe.desk.doctype.notification_log.notification_log.mark_all_as_read");
    },
    triggerIndicatorHide: async (): Promise<void> => {
      await this.app.call().post("frappe.desk.doctype.notification_log.notification_log.trigger_indicator_hide");
    },
  };
  async getWorkspaces(): Promise<WorkspaceItem[]> {
    // v16: get_workspaces trả {pages, has_access, has_create_access} — KHÔNG phải mảng.
    const r = await this.app
      .call()
      .get<Envelope<{ pages: WorkspaceItem[]; has_access: boolean; has_create_access: boolean }>>(
        "frappe.desk.desktop.get_workspaces",
      );
    return this.unwrap(r)?.pages ?? [];
  }
  async getWorkspace(page: string | WorkspacePageRef): Promise<WorkspacePage> {
    // page phải là JSON {name,title?,public?} để backend loads(page).get("name") — bare name cũng ok (min = name).
    const ref: WorkspacePageRef = typeof page === "string" ? { name: page } : page;
    const r = await this.app
      .call()
      .get<Envelope<WorkspacePage>>("frappe.desk.desktop.get_desktop_page", {
        page: JSON.stringify(ref),
      });
    return this.unwrap(r);
  }
  kanban = {
    boards: async (dt: string): Promise<KanbanBoard[]> => {
      const r = await this.app.call().get<Envelope<KanbanBoard[]>>("frappe.desk.doctype.kanban_board.kanban_board.get_kanban_boards", {
        doctype: dt,
      });
      return this.unwrap(r) ?? [];
    },
    moveCard: async (a: KanbanMoveArgs): Promise<void> => {
      await this.app.call().post("frappe.desk.doctype.kanban_board.kanban_board.update_order_for_single_card", {
        board_name: a.board,
        docname: a.docname,
        from_colname: a.from,
        to_colname: a.to,
        old_index: JSON.stringify(a.oldIndex),
        new_index: JSON.stringify(a.newIndex),
      });
    },
    moveCardWithComment: async (a: KanbanMoveArgs & { comment: string }): Promise<void> => {
      await this.app.call().post("metaforge.api.kanban_move_with_comment", {
        board_name: a.board,
        docname: a.docname,
        from_colname: a.from,
        to_colname: a.to,
        old_index: JSON.stringify(a.oldIndex),
        new_index: JSON.stringify(a.newIndex),
        comment: a.comment,
      });
    },
  };

  // ── builder schema mutations §13 (CRUD meta-DocType) ──────────────────────
  async saveMeta(dt: string, meta: DocTypeMetaInput): Promise<void> {
    await this.app.db().updateDoc("DocType", dt, meta as never);
  }
  async saveCustomize(dt: string, c: CustomizeChanges): Promise<void> {
    await this.app.call().post("frappe.custom.doctype.customize_form.customize_form.save_customization", {
      doctype: dt,
      ...c,
    });
  }
  async saveWorkflow(wf: WorkflowDef): Promise<void> {
    await this.app.db().updateDoc("Workflow", wf.name, wf as never);
  }
  async savePrintFormat(pf: PrintFormatDef): Promise<void> {
    await this.app.db().updateDoc("Print Format", pf.name, pf as never);
  }
  async saveDashboard(d: DashboardDef): Promise<void> {
    await this.app.db().updateDoc("Dashboard", d.name, d as never);
  }

  // ── cross-cutting (client-side, KHÔNG RPC) ────────────────────────────────
  mapError(e: unknown): AppError {
    return coreMapError(e);
  }
  csrfToken(): string {
    return this.csrf();
  }
  deskFallbackUrl(dt: string, name?: string): string {
    return name ? `/app/${encodeURIComponent(dt)}/${encodeURIComponent(name)}` : `/app/${encodeURIComponent(dt)}`;
  }
}
