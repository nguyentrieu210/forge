# MetaForge — Engineering Spec (Appendix, cross-cutting mọi renderer)

> Bổ sung sau review độc lập (2026-07-23). Đóng các điểm #2–#11, #13–#17. Áp cho MỌI card `brd-screens/*`. Card nào lệch phải ghi rõ override. Mốc đối chiếu: Frappe **16.28.0** (đã grep xác minh trên VPS 222). Dòng đánh `⚠️verify` = tên method chưa grep, phải xác minh ở PHA 3 trước khi code (không lặp lỗi "tự tin chưa kiểm").

---

## §A. Sơ đồ Engine (#7)
```
                         ┌─────────────────────────────────────┐
   URL /app/*  ──▶  Router ──▶ Shell(M00) ──▶ View Engine
                         └─────────────────────────────────────┘
                                        │  (chọn view theo /view/<x>)
     ┌──────────────┬──────────────┬────┴────┬──────────┬──────────┐
   ListView      FormView       Kanban    Calendar    Dashboard  Builder*
   (M04/05)      (M11)⭐        (M06)     (M07/08/09) (M10)      (M17/18/21/22)
        │             │
        │             ▼
        │        Field Renderer  ──▶  Control (per fieldtype, 43 authorable + Long Int)
        │             │                    (Link/Select/Currency/Signature/...)
        └─────────────┴────────────────────┐
                                            ▼
                     ┌───────────── Core services ─────────────┐
                     │ MetaResolver · PermissionResolver ·      │
                     │ ClientScriptExecutor · Cache · Format ·  │
                     │ NamingPreview · WorkflowResolver         │
                     └────────────────────┬─────────────────────┘
                                          ▼
                                    FrappeAdapter        ← ranh giới đổi backend
                                          ▼
                                   frappe-react-sdk
                                          ▼
                                 Frappe 16 (REST + /api/method)
```
`*Builder` ghi ngược vào meta-DocType (DocType/Workflow/Print Format/Number Card…) qua cùng Adapter.

## §B. Dependency Graph — thứ tự build (#8)
Build từ đáy lên (mỗi tầng chỉ phụ thuộc tầng dưới):
```
FrappeAdapter  ──▶  MetaResolver + Cache  ──▶  PermissionResolver
   │                        │
   │                        ├──▶ Field Registry ──▶ Controls(40) ──▶ Field Renderer
   │                        │
   └──▶ Format/Naming       └──▶ ClientScriptExecutor ─┐
                                                        ▼
List Engine ─┐                                     Form Engine(M11) ──┐
Kanban ──────┤ (đều cần Meta+Perm+Field)                              │ cần thêm:
Calendar ────┤                                                       Workflow, Timeline(docinfo),
Report ──────┘                                                       Child-grid, Print, Comments
Shell(M00) + Router  ──▶ bọc tất cả
Builders ──▶ cần Meta + Field Registry + Canvas engine (BRD riêng)
```
**Form(M11) depends on:** Meta · Permission · Field controls · ClientScriptExecutor · Workflow · Timeline/docinfo · Child-grid(M12) · Print(M13) · Naming. ⇒ Form build SAU khi các cái này xong.

## §C. Screen Priority (#9)
| Tier | Màn | Lý do |
|---|---|---|
| **P0** (nền, không có = vô dụng) | M00 Shell, M01 Login, MetaResolver+PermissionResolver+Cache+FrappeAdapter (hạ tầng), **M04 List**, **M11 Form**, M12 Child-grid | trục CRUD lõi + hạ tầng |
| **P1** (giá trị chính hằng ngày) | M02 Workspace, M03 Awesomebar, M06 Kanban, M13 Print, M19 Notifications, M20 Settings, M16 Permission Manager | dùng mỗi ngày |
| **P2** (bề rộng view + nhập/báo cáo) | M05 Report, M07 Calendar, M08 Gantt, M09 Tree, M10 Dashboard, M14 Import, M15 Report-runner | phủ đủ view |
| **P3** (authoring) | M17 DocType Builder, M18 Workflow Builder, M21 Print Format Builder, M22 Dashboard Builder | tầng tác giả — BRD riêng |

## §D. Event Lifecycle (#2)
**Form renderer (M11) — chuẩn, mọi renderer khác là tập con:**
```
mount
  └─ resolveMeta      (MetaResolver: getdoctype → cache; masked_fields)
  └─ resolvePermission(DocPerm + docinfo.permissions → khả năng đọc/sửa/mask)
  └─ loadDoc | newDoc (getdoc áp apply_fieldlevel_read_permissions | defaults)
  └─ buildSchema      (Zod từ DocField + mandatory/mandatory_depends_on)
  └─ registerScripts  (ClientScriptExecutor nạp __js/__custom_js)
  └─ computeDynamic   (eval depends_on / read_only_depends_on / collapsible_depends_on)
render
  └─ afterRender      (chạy script 'refresh')
[loop] onFieldChange(field)
  └─ recomputeDynamic (depends_on… của field phụ thuộc)
  └─ runFetchFrom     (Link đổi → get_value, chỉ ô chưa dirty)
  └─ runScript(<field>) (executor)
  └─ validate(on-blur)
save
  └─ runScript('validate','before_save')
  └─ persist          (POST/PUT → naming cấp số; 417 → conflict)
  └─ onSaved          (script 'after_save', reload docinfo/timeline)
destroy
  └─ cleanup          (huỷ executor scope, clear autosave draft)
```
**List/View renderer:** `mount → resolveMeta → resolvePermission → resolveViewConfig(cột/filter/sort) → fetch(get_list) → render → [onFilter/onSort/onPage → refetch] → onRowClick(→Form) → destroy`.
**Builder:** thêm `loadDesign → canvasInit → [edit(drag/prop) → pushHistory] → serialize → persist(meta-DocType) → migrate/clearCache`.

## §E. State Machines (#3)
**Form document state (client):**
```
             ┌───────────── userEdit ─────────────┐
   Clean ───▶ Dirty ───▶ Validating ──ok──▶ Saving ──ok──▶ Clean(Saved)
     ▲          │            │(fail)            │(417)
     │          │            ▼                  ▼
     └── reload Invalid ◀────┘             Conflict ──user──▶ Reload ──▶ Clean
                                                       └─keepMine? merge UI
   (bất kỳ) ──unmount──▶ Destroyed
```
**Docstatus overlay (song song, do server):** `Draft(0) ──submit──▶ Submitted(1) ──cancel──▶ Cancelled(2) ──amend──▶ (Draft mới amended_from)`. Field editable ∩ (state=Clean/Dirty) ∩ (docstatus=0 ∨ allow_on_submit).
**List row (bulk/inline):** `Idle → Selected → Mutating → (Idle refetch | Error rollback)`.

## §F. Error Matrix (#4) — Frappe v16 dùng `exc_type`, KHÔNG chỉ HTTP code
| Tín hiệu | Frappe exc_type | Xử lý UX |
|---|---|---|
| **401** (chưa login / hết phiên) | — | toast vàng "Phiên hết hạn, đăng nhập lại" TRƯỚC → `/login?reason=expired`; giữ draft |
| **403** | `PermissionError` | empty-state không-quyền (cả trang) hoặc toast (1 thao tác); KHÔNG lộ dữ liệu |
| **404** | `DoesNotExistError` | "Không tìm thấy <dt> <name>" + nút về list |
| **417 (validation)** | `ValidationError`, `MandatoryError`, `LinkValidationError` | inline đỏ dưới field + scroll/focus field đầu + đếm ở nút |
| **417 (conflict)** | **`TimestampMismatchError`** | Conflict UI "vừa được sửa — xem khác biệt/tải lại" (KHÔNG ghi đè). Phân biệt với validation **bằng `exc_type`, không bằng HTTP code** |
| **409** | *(Frappe hầu như không dùng)* | KHÔNG hardcode 409 = conflict — conflict là 417/`TimestampMismatchError` |
| **429** | rate limit | "Thao tác quá nhanh — thử lại sau" |
| **500** | `ServerError`/khác | toast + **mã tra cứu ngắn** (server log theo mã); nút Thử lại; không lộ stack/SQL |
| **Network/offline** | — | banner offline; **V1: đọc từ cache (SWR) OK, GHI disable** (nút mờ); hàng đợi ghi offline = **P2** |
> Adapter phải parse `exc_type` + `_server_messages` của Frappe → map về bảng này ở MỘT chỗ (`FrappeAdapter.mapError`).

## §G. Cache Architecture (#6)
| Cache | Khoá | Nguồn | TTL / Invalidate |
|---|---|---|---|
| **Meta** | `doctype` (+ Frappe cache version) | getdoctype | SWR; invalidate khi Customize Form/Property Setter/DocType save (M17) hoặc version bump; LRU |
| **Document** | `doctype:name` | getdoc | SWR ngắn; invalidate on save/submit/realtime(P2) |
| **Permission** | `user` | boot + docinfo.permissions + masked_fields | theo phiên; invalidate on role change/login |
| **Workspace** | `user` | boot sidebar items | theo phiên |
| **Route** | path | client router | trong phiên |
| **Icon/static** | tên | bundle | vĩnh viễn (hashed) |
| **Search/Link** | `doctype:query` | search_link | rất ngắn (30–60s) |
> Nguyên tắc: **client cache chỉ để UX; permission-critical luôn để server chốt lần ghi** — không tin cache để cấp quyền.

## §H. Performance Budget (#5)
| Chỉ tiêu | Ngân sách |
|---|---|
| Form first render (meta đã cache) | < **300ms** |
| Form first render (meta chưa cache) | < 800ms (1 round-trip getdoctype) |
| List 5.000 dòng (virtualize) | < **16ms/frame** (60fps) khi cuộn |
| Chunk chính | ≤ **300KB gzip**; lib nặng (monaco/qr/gantt/richtext) lazy |
| LCP (4G giả lập) | < 2.5s |
| Meta cache | LRU, trần ~**200 doctype** / ~15MB (con số mày nêu "200MB" là trần an toàn tuyệt đối, thực tế nhắm 15MB) |
| Bấm bất kỳ | phản hồi < 100ms (optimistic hoặc loading cục bộ) |

## §I. Non-Functional Requirements (#16)
| NFR | Yêu cầu |
|---|---|
| Accessibility | WCAG 2.1 AA: keyboard đầy đủ (§polish), aria-label icon-button, focus ring, contrast token |
| i18n / L10n | nhãn từ Frappe translations (EN/VI theo site); chrome engine mặc định VI; số/ngày/tiền qua `shared/format.ts` |
| Timezone | theo `System Settings.time_zone` + tz user; Datetime hiển thị local, lưu UTC như Frappe |
| RTL | **out of scope v1** (cấu trúc token không chặn thêm sau) |
| Dark mode | 3 chế độ (Sáng/Tối/Hệ thống) |
| PWA/Offline | install + update banner. **V1: ĐỌC từ cache offline được phép; GHI bị disable** (banner + nút mờ). Offline write-queue = **P2** (KHÔNG hứa V1) |
| Memory/FPS | theo §H |
| SEO | N/A (app sau đăng nhập, noindex) |

## §J. Versioning & Meta-schema Strategy (#14)
- Engine **semver**. Ma trận tương thích: **Engine 1.x ↔ Frappe 16**; **2.x ↔ Frappe 17** (khi có).
- **FrappeAdapter** cô lập version backend; đổi Frappe = đổi adapter, không đụng renderer.
- **Versioned meta-mapper**: getdoctype payload → model nội bộ MetaForge đi qua `mapMetaV16()`; Frappe 17 đổi shape → thêm `mapMetaV17()`, renderer không đổi.
- **Snapshot/contract test**: fixture getdoctype thật của vài DocType (Item, Sales Order…) commit làm golden; CI so shape → phát hiện Frappe đổi API sớm.
- Migration: engine bump major có `MIGRATION.md`.

## §K. Plugin Architecture (#13)
Engine kit `@metaforge/core` expose các **registry** (mở rộng không sửa lõi):
| Registry | Đăng ký gì | Ví dụ |
|---|---|---|
| `FieldTypeRegistry` | control cho 1 fieldtype | thêm fieldtype tuỳ biến / override control mặc định |
| `ViewRegistry` | 1 view mới `/view/<x>` | thêm "Map view", "Timeline view" |
| `ActionRegistry` | nút hành động trên List/Form | "Gửi hợp đồng ký số" |
| `ThemeRegistry` | token màu/typography | brand khách |
| `HookRegistry` | chèn vào lifecycle §D | `onBeforeSave`, `onAfterRender` |
| `AdapterRegistry` | backend adapter | Frappe (mặc định); (tương lai) khác |
Mỗi plugin = `{ name, version, register(engine) }`. App demo = 1 tập plugin + theme.

## §L. Risk Register (#10)
| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Frappe v17 đổi API meta | Trung | Cao | FrappeAdapter + versioned meta-mapper + snapshot test |
| getdoctype payload không tài liệu hoá / đổi shape | Cao | Cao | golden fixture từ site thật + CI diff; **grep verify trước khi code** |
| Client Script 1:1 bất khả thi cho script phức tạp (phụ thuộc `frappe.*` desk runtime) | Cao | Cao | executor best-effort + **fallback mở Desk gốc** cho doc đó + log script không chạy được; liệt kê API `frm.*` hỗ trợ |
| permission model đổi | Thấp | Cao | **server luôn là chốt**; không bao giờ tin client cấp quyền |
| frappe-react-sdk bỏ bê | Trung | Trung | FrappeAdapter cô lập; có thể thay bằng fetch thuần |
| Builder phức tạp vượt ước lượng | Cao | Trung | **BRD Builder riêng** + P3 + phased |
| Perf trên DocType khổng lồ (nhiều field/child) | Trung | Trung | virtualize + tab lazy + pagination child |
| Fieldtype hiếm render sai | Trung | Trung | Field Ledger 43 authorable + Long Int (PHA 3) + visual test từng control |

## §M. Out of Scope — tường minh (#17)
KHÔNG làm ở v1 (AI không tự thêm):
- Multi-backend (chỉ Frappe adapter; GraphQL — không)
- Web Form / Portal công khai (Guest)
- Realtime socketio (doc_update live, presence) — P-sau
- POS offline-first, hàng đợi ghi offline đầy đủ — P2
- Mobile native / Electron / Capacitor
- RTL; ngôn ngữ ngoài EN/VI
- Report Builder tạo Query Report bằng UI viết SQL (chạy/xem report có sẵn thì CÓ — M15)
- Sửa/fork Frappe core; viết lại backend
- Email client đầy đủ (chỉ gửi từ Print/Communication cơ bản)

## §N. Acceptance Criteria — template chung (#1)
Mỗi card `brd-screens/*` gắn khối "## Acceptance Criteria" theo khung này (đánh dấu N/A nếu không áp dụng, kèm lý do):
- [ ] **Render 100% từ metadata** — bật 1 DocType chưa từng thấy, đúng như Desk (không hardcode)
- [ ] **Responsive** — desktop + mobile tách cây, test 390/412/768/1280
- [ ] **Keyboard** — phím tắt màn này (§polish) + `?` cheatsheet
- [ ] **Permission** — role thấp bị chặn ở **server** (bypass UI vẫn 403/mask), không chỉ ẩn nút
- [ ] **Loading skeleton** khớp cấu trúc; **empty 3 trạng thái**; **error tiếng Việt**
- [ ] **Optimistic + undo/rollback** cho thao tác nhẹ; **417 conflict** không ghi đè
- [ ] **Lifecycle §D + State §E** đúng (không tự chế state)
- [ ] **Error Matrix §F** map đủ
- [ ] **Perf §H** đạt ngân sách của màn
- [ ] **Test**: unit (logic) + integration (API+quyền) + visual baseline (screenshot) — theo §O
- [ ] **Screenshot baseline** 390/768/1280 đính PR

## §O. Test Matrix (#15)
| Tầng | Công cụ | Phủ gì | Gate |
|---|---|---|---|
| Unit | Vitest | parser depends_on, format, Zod-from-meta, mapError, naming preview | bắt buộc |
| Integration/API | Vitest + site test | quyền (role thấp + bypass API), CRUD qua adapter, workflow apply, permlevel mask | bắt buộc |
| Contract/snapshot | Vitest | getdoctype fixture shape (golden) — phát hiện Frappe đổi API | bắt buộc |
| Visual | Playwright screenshot | baseline mỗi renderer 390/768/1280 (light+dark) | khuyến nghị→bắt buộc |
| E2E | Playwright | happy-path: login→list→form→save→submit→print | 1 luồng bắt buộc |
| Regression | Playwright | 4 luật trọng yếu (3 cột / Kanban chip / AI / Lịch sử) | bắt buộc PHA 6 |
| Performance | Lighthouse/DevTools | §H (LCP, frame, chunk) | khuyến nghị |
| Accessibility | axe | §I WCAG AA | khuyến nghị |

## §P. Frappe API Mapping (#11) — endpoint thật (v16.28)
> ⚠️ **SUPERSEDED (2026-07-23):** bảng dưới là bản nháp PHA 2. Contract CHUẨN đầy đủ (callable/HTTP/req-resp DTO/role/type/errors, mọi method đã grep-verify 16.28) = **`technical/api-map.md`**. Dùng file đó khi code adapter, KHÔNG dùng bảng nháp này.

`✅` = đã grep-verify trên VPS 222; `⚠️` = bản nháp (xem api-map.md để có bản verified).
| Thao tác | Endpoint / method Frappe | TT |
|---|---|---|
| Login / Logout | `POST /api/method/login` · `/api/method/logout` | ⚠️ |
| Boot (user/roles/workspaces) | `frappe.boot` / `frappe.desk.desktop.get_workspace_sidebar_items` | ⚠️ |
| **Meta (form load)** | `frappe.desk.form.load.getdoctype` | ✅ |
| Doc + docinfo | `frappe.desk.form.load.getdoc` · `...get_docinfo` (timeline/version/comment/assign) | ⚠️ (load.py ✅ tồn tại) |
| Get 1 doc | `GET /api/resource/<dt>/<name>` · `frappe.client.get` | ⚠️ |
| List | `GET /api/resource/<dt>` · `frappe.client.get_list` · `frappe.desk.reportview.get` | ⚠️ |
| Count | `frappe.client.get_count` · `frappe.desk.reportview.get_count` | ⚠️ |
| Get value (fetch_from) | `frappe.client.get_value` | ⚠️ |
| Create | `POST /api/resource/<dt>` · `frappe.client.insert` | ⚠️ |
| Save/Update | `PUT /api/resource/<dt>/<name>` · `frappe.client.save` · `set_value` (kèm `modified` → 417) | ⚠️ (417 ✅) |
| Submit / Cancel | `frappe.client.submit` · `frappe.client.cancel` | ⚠️ |
| Delete | `DELETE /api/resource/<dt>/<name>` · `frappe.client.delete` | ⚠️ |
| Bulk delete | `frappe.desk.reportview.delete_items` | ⚠️ |
| Rename | `frappe.client.rename_doc` · `frappe.model.rename_doc` | ⚠️ |
| **Workflow action** | `frappe.model.workflow.apply_workflow` | ✅ |
| Assign / Unassign | `frappe.desk.form.assign_to.add` · `.remove` | ⚠️ |
| Add comment | `frappe.desk.form.utils.add_comment` | ⚠️ |
| Version/timeline | `frappe.desk.form.load.get_docinfo` | ⚠️ |
| Search Link / Autocomplete | `frappe.desk.search.search_link` · `search_widget` | ⚠️ |
| Upload | `POST /api/method/upload_file` | ⚠️ |
| Download file | `/api/method/frappe.utils.file_manager...` · `/private/files` qua File | ⚠️ |
| Print HTML / PDF | `frappe.www.printview.get_html` · `frappe.utils.print_format.download_pdf` | ⚠️ |
| Report run / export | `frappe.desk.query_report.run` · `frappe.desk.reportview.export_query` | ⚠️ |
| Data import | `frappe.core.doctype.data_import.data_import.*` (download_template, get_preview_from_template, form_start_import) | ⚠️ |
| Permission edit | `frappe.core.page.permission_manager.permission_manager.` `get_permissions`/`add`/`update`/`remove`/`reset` · Custom DocPerm | ✅ (§ api-map.md là contract chuẩn) |
| Field-level mask (đọc) | `apply_fieldlevel_read_permissions` (server tự áp trong getdoc) | ✅ |
> Việc đầu PHA 3: **grep-verify hết dòng ⚠️** trên VPS 222 (như đã làm với 6 dòng ✅) → không dòng nào vào code khi chưa xác minh.
>
> **Batch-verify 2026-07-23 (đã ✅ thêm trên 16.28.0):** `frappe.desk.query_report.get_script`/`run` · `data_import.form_start_import`/`get_preview_from_template`/`get_import_status`/`download_errored_template` · `frappe.desk.form.assign_to.add` · `frappe.desk.form.utils.add_comment` · `frappe.desk.search.search_link`/`search_widget` · permission = **`frappe.core.page.permission_manager.permission_manager.update(doctype,role,permlevel,ptype,value,if_owner)`** (KHÔNG phải `frappe.permissions.add/update`) · `auth.get_logged_user` (chỉ username) · schema Number Card / Dashboard Chart / Print Format / Workflow* (xem §S/§Q + card đã vá).

---

## §Q. External Runtime Assets Contract (#B6) — bundle FormMeta v16 (grep-verify `meta.py` 16.28)
Mỗi asset chuẩn hoá trong `FrappeAdapter` thành model có kiểu; asset JS chạy trong **compatibility executor** (§F3, KHÔNG phải sandbox); cấu trúc không hỗ trợ → log + fallback (mở Desk gốc doc đó).
| Asset | View/màn dùng | Chứa gì | MetaForge xử lý |
|---|---|---|---|
| `__js` + `__custom_js` | Form (M11) | `<doctype>.js` + `doctype_js` hook + Client Script (Form) | executor: `frappe.ui.form.on` |
| `__list_js` + `__custom_list_js` | List (M04) | list settings JS: `onload`, `get_indicator`, `formatters`, `button`, `add_fields` | executor (list ctx) |
| `__calendar_js` | Calendar (M07) | `get_events` + **field_map** (title/start/end/color/allDay) | normalize → CalendarConfig; KHÔNG chỉ "đoán date field" |
| `__tree_js` | Tree (M09) | tree config: `get_tree_nodes`, toolbar, `onrender`, right-click, reparent method | normalize → TreeConfig (NSM method từ đây, xem C5) |
| `__dashboard` | Form connections (M11 sidebar) | links/cards/charts/heatmap của doctype | render "Connections/Liên quan" |
| `__kanban_column_fields` | Kanban (M06) | field hiển thị mỗi cột | render card |
| `__workflow_docs` | Form (M11) | Workflow gắn doctype (E05) | Workflow action bar |
| `__print_formats` | Print (M13) | Print Format khả dụng | dropdown chọn mẫu |
| `__templates` / `__form_grid_templates` / `__listview_template` | Form/Grid/List | Jinja template render | render HTML |
| `__css` | mọi view | CSS chèn theo doctype | inject scoped |
> **Acceptance:** mỗi view P1/P2 phải đọc asset tương ứng, KHÔNG tự suy từ field names; ca không parse được → fallback + log.

## §R. Atomic Operations Contract (#B2) — chốt endpoint chuẩn vs orchestration
Điều hoà với "MetaForge KHÔNG viết endpoint NGHIỆP VỤ": vẫn được phép có **orchestration method mỏng** (tầng adapter, KHÔNG chứa business rule) CHỈ cho thao tác cần atomic ≥2 ghi trong 1 DB transaction. Liệt kê ĐẦY ĐỦ (app không thêm ngoài danh sách mà không cập nhật bảng này):
| Thao tác | Atomic? | Cơ chế |
|---|---|---|
| CRUD 1 doc (create/update/delete/submit/cancel) | tự atomic/doc | API chuẩn Frappe (`db.*`, `/api/resource`, `frappe.client.submit/cancel`) |
| **Workflow transition + chip lý do (comment)** | **CÓ** | orchestration `metaforge.api.workflow_action_with_comment(doctype, name, action, comment)` → 1 txn (`apply_workflow` + `add_comment`) + audit. KHÔNG business rule (rule vẫn ở Frappe) |
| **Kanban đổi cột + chip lý do** | **CÓ (orch RIÊNG)** | `metaforge.api.kanban_move_with_comment` → native `kanban_board.update_order_for_single_card` (đổi cột = `set_value(field_name=to_colname)`, board-aware, KHÔNG phải workflow) + `add_comment`. **KHÔNG tái dùng `workflow_action_with_comment`** (method đó nhận `action`, không nhận `fieldname/value`). Nếu không cần atomic → 2 request rời (move rồi comment). |
| Bulk delete/đổi status | mỗi item 1 txn | API chuẩn, báo kết quả từng item (KHÔNG atomic cả lô) |
| Data Import | **partial success**, per-row | Frappe `data_import` (KHÔNG rollback toàn batch) — §S/F7 |
| Builder save (DocType/Workflow/Print/Dashboard) | per meta-doc | API chuẩn create/update meta-DocType |
> Bỏ mọi câu "cùng transaction" mơ hồ giữa 2 HTTP request rời — chỗ cần atomic thì DÙNG orchestration method ở bảng này; chỗ không, mô tả compensating rõ (comment lỗi sau khi state đã đổi = non-critical, retry + log).

## §S. Boot & Auth Contract (#B4)
`frappe.auth.get_logged_user` **chỉ trả username** → KHÔNG đủ dựng SPA. Định nghĩa:
- **`MetaForgeBootDTO`** (một whitelisted read-only method `metaforge.api.get_boot()` sau login, wrap `frappe.boot.get_bootinfo` — ✅ đã pin PHA 3, api-map §1): `{ user, full_name, roles[], user_permissions, locale/lang, csrf_token, system_settings(tối thiểu: date/number/time_zone/currency), workspaces_sidebar[], default_filters/defaults, allowed_doctypes? }`.
- **Public login context** (TRƯỚC login, không auth): `{ social_login_providers[], app_name, logo, allow_signup?, lang }` — từ website context/server-injected; social provider KHÔNG lấy từ boot-authenticated.
- **"Ghi nhớ đăng nhập"** (✅ chốt PHA 3): Frappe không cho SPA tự đặt TTL session tùy ý → V1 **chỉ là UI** (giữ email localStorage) + dùng cơ chế session-expiry sẵn của Frappe; KHÔNG hứa "kéo dài TTL".
- CSRF: mọi ghi gửi `X-Frappe-CSRF-Token` từ boot (FrappeAdapter tự gắn).
