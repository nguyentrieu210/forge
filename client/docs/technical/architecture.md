# MetaForge — Kiến trúc kỹ thuật (PHA 3d)

> Engine kit tái dùng + app demo, trên headless Frappe 16. Sơ đồ tổng: appendix §A. Build order: appendix §B.

## 1. Monorepo (pnpm workspaces)
```
C:\MetaForge\
  packages/
    core/         @metaforge/core     — MetaResolver, PermissionResolver, FieldRegistry,
                                         ViewEngine, lifecycle(§D), state(§E), Cache(§G),
                                         ClientScriptExecutor(§F3), mapError(§F), NamingPreview
    controls/     @metaforge/controls — 43 control (field-ledger.md) trên shadcn/ui
    views/        @metaforge/views    — List/Report/Kanban/Calendar/Gantt/Tree/Dashboard/Form/Print
    adapter-frappe/ @metaforge/adapter-frappe — FrappeAdapter bọc frappe-react-sdk (api-map.md)
    builder/      @metaforge/builder  — BuilderKernel + 4 CanvasAdapter (brd-builder)
    shell/        @metaforge/shell    — AppShell/sidebar/topbar/BottomNav/CommandPalette/Theme/PWA
  apps/
    demo/         Vite React SPA mount engine vào site Frappe thật (DocType ERPNext)
  frappe-app/     metaforge/          — Frappe custom app: đóng gói SPA + orchestration methods (§11/§R: get_boot, workflow_action_with_comment, kanban_move_with_comment?, add_tree_node?, logout_other_sessions?)
  docs/           BRD + technical + appendix + builder
```
> Kit (`packages/*`) = sản phẩm tái dùng; `apps/demo` = 1 tập plugin + theme (Plugin Arch §K) chứng minh 1:1.

## 2. Stack (chốt cứng, RULES.md + review)
- **Vite + React 18 + TypeScript** · **shadcn/ui + Tailwind** (palette KeToan/Toka) · **TanStack Query** (cache/SWR) + **TanStack Table** · **React Hook Form + Zod** · **Recharts** (dataviz) · **frappe-react-sdk** (data, bọc sau adapter).
- Builder: **dnd-kit** (tree/paper/grid) + **React Flow** (workflow graph) + **react-grid-layout** (dashboard).
- Lazy (>100KB): monaco (Code/JSON/HTML), TipTap (Text Editor), map (Geolocation), qr/1D scanner (Barcode), frappe-gantt (Gantt).
- Versioning (§J): Engine **1.x ↔ Frappe 16**; đổi Frappe = đổi adapter + versioned meta-mapper.

## 3. FrappeAdapter — interface (TS, bọc api-map.md)
```ts
interface FrappeAdapter {
  // auth/boot
  login(usr: string, pwd: string): Promise<void>
  logout(): Promise<void>
  getBoot(): Promise<MetaForgeBootDTO>            // wrap frappe.boot.get_bootinfo (§S)
  // meta
  getMeta(doctype: string): Promise<DocTypeMeta>  // getdoctype: fields+perms+links+__assets+masked_fields
  // document
  getDoc(dt: string, name: string): Promise<{ doc: Doc; docinfo: DocInfo }>
  getList(dt: string, opts: ListOpts): Promise<Doc[]>   // fields/filters/orFilters/orderBy/limitStart/pageLength
  getCount(dt: string, filters?: Filters): Promise<number>
  getValue(dt: string, filters: Filters, field: string): Promise<any>   // fetch_from
  createDoc(dt: string, doc: Partial<Doc>): Promise<Doc>
  updateDoc(dt: string, name: string, doc: Partial<Doc>, modified: string): Promise<Doc>  // 417 nếu lệch
  deleteDoc(dt: string, name: string): Promise<void>
  submit(doc: Doc): Promise<Doc>; cancel(dt: string, name: string): Promise<Doc>
  // workflow
  applyWorkflow(doc: Doc, action: string): Promise<Doc>
  workflowActionWithComment(dt: string, name: string, action: string, comment?: string): Promise<Doc> // §R orchestration
  // timeline/social
  addComment(dt: string, name: string, content: string): Promise<Comment>
  assign(args: AssignArgs): Promise<void>
  // search/link
  searchLink(dt: string, txt: string, filters?: Filters, pageLength?: number): Promise<LinkResult[]>
  // file/print
  uploadFile(file: File, opts: UploadOpts): Promise<FileDoc>
  printHtml(dt: string, name: string, format?: string): Promise<string>
  downloadPdf(dt: string, name: string, format?: string): Promise<Blob>
  // document extra
  rename(dt: string, oldName: string, newName: string, merge?: boolean): Promise<string>
  bulkDelete(dt: string, names: string[]): Promise<BulkResult>
  amend(dt: string, name: string): Promise<Doc>                       // doc mới amended_from
  // report (B5)
  getReportScript(name: string): Promise<ReportScript>               // {script, html_format}
  runReport(name: string, filters?: Filters, o?: RunReportOpts): Promise<ReportResult> // {result,columns,message,chart,report_summary,skip_total_row}
  exportQuery(dt: string, o: ExportOpts): Promise<Blob>              // binary
  // dashboard
  numberCardResult(doc: any, filters: Filters): Promise<number>
  dashboardChart(name: string, filters?: Filters): Promise<ChartData>
  // tree (C5)
  treeChildren(dt: string, parent: string, includeDisabled?: boolean): Promise<TreeNode[]>
  treeAddNode(args: TreeNodeArgs): Promise<void>                     // native add_node trả null → sau đó refetch children (§10)
  addTreeNodeReturning?(args: TreeNodeArgs): Promise<TreeNode>       // optional orch metaforge.api.add_tree_node (§11) nếu cần node ngay
  treeReparent(dt: string, name: string, newParent: string, modified: string): Promise<Doc> // updateDoc(parent_<dt>)+save → NSM rebuild
  // permission (M16 — ptype ĐỘNG, toàn module chỉ SysMgr)
  perm: {
    rolesAndDoctypes(): Promise<{ roles: LabelValue[]; doctypes: LabelValue[]; doctypePtypeMap: Record<string, string[]> }> // ptype theo TỪNG doctype
    get(dt?: string, role?: string): Promise<DocPermRule[]>
    add(parent: string, role: string, permlevel: number): Promise<void>
    update(dt: string, role: string, permlevel: number, ptype: string, value: 0|1, ifOwner?: 0|1): Promise<void>
    remove(dt: string, role: string, permlevel: number, ifOwner?: 0|1): Promise<void>
    reset(dt: string): Promise<void>
  }
  // data import (B3 — partial success)
  import: {
    downloadTemplate(dt: string, o?: TemplateOpts): Promise<Blob>
    preview(dataImport: string, file: string): Promise<ImportPreview>
    start(dataImport: string): Promise<void>                        // form_start_import (KHÔNG start_import)
    status(dataImport: string): Promise<{ status: DataImportRawStatus; success?: number; failed?: number; total_records: number }> // raw: Pending|Success|Partial Success|Error|Timed Out
    erroredTemplate(dataImport: string): Promise<Blob>
  }
  // kanban (M06 — di chuyển card = set field, KHÔNG phải workflow)
  kanban: {
    boards(dt: string): Promise<KanbanBoard[]>
    moveCard(a: { board: string; docname: string; from: string; to: string; oldIndex: number; newIndex: number }): Promise<void> // update_order_for_single_card → set_value(field_name=to)
    moveCardWithComment?(a: KanbanMoveArgs & { comment: string }): Promise<void>  // orch §11 nếu cần atomic
  }
  // email / password / session
  sendEmail(a: EmailArgs): Promise<{ name: string }>                // communication.email.make (perm email)
  updatePassword(newPwd: string, o?: { logoutAll?: 0|1; oldPassword?: string; key?: string }): Promise<void> // logoutAll=1 = đổi mật khẩu + đăng xuất thiết bị khác (KHÔNG có logout-only độc lập)
  logoutOtherSessions(): Promise<void>                              // orchestration §11 (wrap clear_sessions internal); per-device logout cần wrapper get_my_sessions riêng — V1 chưa có
  listRecentBackups(): Promise<{ database: string; public: string; private: string; config: string }> // LIỆT KÊ path 30 ngày (SysMgr), KHÔNG tạo backup
  // notification / realtime
  notifications: {
    list(limit?: number): Promise<{ notification_logs: NotificationLog[]; user_info: Record<string, UserInfo> }> // get_notification_logs
    markAsRead(docname: string): Promise<void>                      // mark_as_read
    markAllRead(): Promise<void>                                    // mark_all_as_read
    triggerIndicatorHide(): Promise<void>                           // trigger_indicator_hide
  } // unread count KHÔNG có API riêng → đọc từ boot
  realtime?: { on(event: string, cb: Fn): Unsubscribe }             // socketio (P-sau, optional)
  // workspace / sidebar
  getWorkspaces(): Promise<WorkspaceItem[]>                         // desktop.get_workspaces
  getWorkspace(page: string): Promise<WorkspacePage>               // desktop.get_desktop_page(page): charts/shortcuts/cards/links
  // builder schema mutations (M17/18/21/22 — ghi meta-DocType)
  saveMeta(dt: string, meta: Partial<DocTypeMeta>): Promise<void>          // DocType → schema sync (KHÔNG bench migrate)
  saveCustomize(dt: string, c: CustomizeChanges): Promise<void>            // Custom Field + Property Setter
  saveWorkflow(wf: WorkflowDef): Promise<void>                             // Workflow + Document State + Transition
  savePrintFormat(pf: PrintFormatDef): Promise<void>                      // format_data | html/css
  saveDashboard(d: DashboardDef): Promise<void>                           // Dashboard(charts/cards/chart_options)
  // external runtime assets (§Q) + fallback
  getAssets(dt: string): Promise<RuntimeAssets>            // __js/__list_js/__calendar_js/__tree_js/__dashboard/__kanban_column_fields/__workflow_docs/…
  deskFallbackUrl(dt: string, name?: string): string      // mở Desk gốc khi renderer/executor không kham nổi
  // cross-cutting
  mapError(e: unknown): AppError    // exc_type → §F Error Matrix (417 conflict vs validation)
  csrfToken(): string
}
```
> Renderer/View/Builder CHỈ phụ thuộc interface này — không import frappe-react-sdk trực tiếp (Plugin Arch: AdapterRegistry).

**Quy tắc Cổng 3 — mỗi method adapter phải có ĐÚNG 1 chỗ trong api-map (hoặc đánh dấu rõ):**
| Nhóm | Method | Nguồn contract |
|---|---|---|
| auth/boot | login/logout/getBoot | api-map §1 |
| meta/assets | getMeta, getAssets | §2 (assets = `__*` trong getdoctype) |
| CRUD | getDoc/getList/getCount/getValue/create/update/delete/submit/cancel/rename/bulkDelete | §3 |
| amend | amend | §13 |
| workflow | applyWorkflow, workflowActionWithComment | §4 + §11 (orch) |
| timeline/search/file | addComment/assign/searchLink/uploadFile | §5 |
| print/email | printHtml/downloadPdf/sendEmail | §6 |
| report | getReportScript/runReport/exportQuery | §7 |
| import | import.* | §8 |
| permission | perm.* | §9 |
| dashboard/tree/backup | numberCardResult/dashboardChart/treeChildren/treeReparent/listRecentBackups | §10 |
| tree create | treeAddNode (native, void) / addTreeNodeReturning (orch) | §10 / §11 |
| session | updatePassword/logoutOtherSessions | §9 / §11 (orch) |
| notif/workspace/kanban | notifications.*/getWorkspaces/getWorkspace/kanban.* | §12 |
| builder mutations | saveMeta/saveCustomize/saveWorkflow/savePrintFormat/saveDashboard | §13 (CRUD meta-DocType) |
| **client-side (KHÔNG RPC)** | mapError, csrfToken, deskFallbackUrl, realtime(socketio) | — (không cần entry api-map) |

## 4. Cache (§G) — TanStack Query keys
- `['meta', doctype]` (staleTime dài, invalidate khi Customize/Property Setter save)
- `['doc', doctype, name]` · `['list', doctype, hash(opts)]` (SWR) · `['boot']` (session) · `['searchLink', dt, txt]` (30s)

## 5. Deploy (site demo VPS 222 — cô lập, KHÔNG dc.sh)
- Build `apps/demo` → `dist/`; đóng vào Frappe app `metaforge` (`hooks.py`: `website_route_rules` `/app/<path>` → SPA page; `app_include_js/css`); `bench build --app metaforge`.
- Site demo RIÊNG (vd `meta.kairo.vn`) trên bench 222; deploy **compose thủ công 5 file** (memory Ong Xanh); KHÔNG đụng erp.kairo.vn/ongxanh.kairo.vn.
- `/api/health` tương đương: `get_logged_user` + version.

## 6. Bảo mật (nhắc lại, chốt)
- Server Frappe = ranh giới cuối; engine chỉ mirror (permission §F5).
- ClientScriptExecutor = compatibility, KHÔNG sandbox (§F3); chỉ chạy script tin cậy cùng site.
- CSRF header mọi ghi; file private qua permission.
