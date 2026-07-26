# BRD — MetaForge (FE meta-driven 1:1 Frappe/ERPNext)

> **Đây là bản SPINE (mục 0-6, 8-10 + §0 + §2 + index màn hình mục 7).** Chi tiết từng màn = `docs/brd-screens/<NN>-<slug>.md` (tách theo guide §1.1 vì >8 màn). Chi tiết field meta model = `docs/brd-entities/` khi cần.
>
> Chuẩn nghiệm thu: một AI/dev khác đọc xong code đúng renderer, không hỏi lại. Cấm "sẽ bổ sung sau" (user đã chốt **full 1:1, không hoãn**).

---

## §0. Nhật ký đọc contract (đọc TRƯỚC khi viết — đã hoàn tất)

| Contract | Đọc? | Rule cụ thể đã áp dụng | Áp dụng ở mục BRD |
|---|---|---|---|
| `screen-catalog-contract.md` | ✅ | "Layout 3 cột list–detail–context cho 100% màn bảng desktop; bấm dòng → bảng co trái + chi tiết giữa + ngữ cảnh phải" | Form View (M11) render 3 cột; List View (M04) bấm dòng mở 3 cột |
| `data-table-contract.md` | ✅ | "Cột 1 checkbox pin trái, cột 2 STT cố định, cột 3 ảnh; resize + chọn cột lưu localStorage theo user; Nhập Excel wizard 5 bước" | List View (M04) — sinh cột từ `in_list_view` của DocField; Data Import (M14) |
| `form-workflow-contract.md` | ✅ | "Link field kiểu ERPNext: combobox tìm được + dòng `+ Thêm mới` mở FORM GỐC đầy đủ nested, prefill, quay về focus field kế; autofill chỉ điền ô chưa dirty" | Form View (M11) — fieldtype `Link`/`Dynamic Link`; autofill = `fetch_from` |
| `mobile-pwa-contract.md` | ✅ | "BottomNav 4 mục + FAB 56px `-mt-8 ring-4`; form CRUD mobile full-screen; PWA install + update banner" | Shell (M00); mọi renderer có bản mobile riêng |
| `master-data-contract.md` | ✅ | "Mọi field chọn-từ-danh-sách phải là Link Field có +Thêm mới, không select cứng; sidebar 'Danh mục' riêng" | Trong Frappe MỌI Link field vốn đã đúng cơ chế này (bản chất đề bài) — M04/M11 thoả tự nhiên; module launcher = danh mục DocType |
| `media-capture-contract.md` | ✅ | "Ảnh lên R2/file service, DB lưu key; signature pad xuất PNG; QR sinh mã; OCR 'Điền từ ảnh/tệp' là bản nháp ✨" | fieldtype `Attach`/`Attach Image`/`Signature`/`Barcode`/`Geolocation` (M11); Frappe File + `/api/method/upload_file` |
| `print-contract.md` | ✅ | "Route in riêng `/print/<loại>/<id>` + `window.print()`; `@page size`; bản in có QR + số chứng từ + tiền bằng chữ" | Print View (M13) render Frappe **Print Format** (Jinja/HTML) |
| `notify-contract.md` | ✅ | "In-app bell + badge chưa đọc, deep-link mở đúng bản ghi; cổng nối Zalo OA; log gửi + opt-out" | Notifications (M19) map `Notification Log` DocType của Frappe |
| `polish-contract.md` | ✅ | "Bấm <100ms optimistic; list >200 dòng virtualize; autosave draft + optimistic lock chống sửa đè; `?` cheatsheet phím tắt" | Xuyên suốt; verify PHA 6. Optimistic lock = Frappe `modified` (lệch → `TimestampMismatchError`/HTTP **417**, nhận qua `exc_type`, KHÔNG phải 409) |
| `backend-contract.md` | ✅ (ADAPT) | "Middleware chain auth→permission→validate→audit; webhook idempotent; optimistic lock qua `updated_at`" — nhưng backend là **Frappe** (không Hono/D1): auth/permission/audit/naming/counter do Frappe lo sẵn | Mục 6 (quyền = Frappe DocPerm); audit = Frappe `Version`/`Activity Log` |
| `field-ledger.md` | ✅ | "1 field = 1 dòng 9 cột; danh mục UI control ĐÓNG (text/link-field/select-enum/money/date/signature/barcode…)" | Ánh xạ **43 fieldtype authorable (builder picker) + Long Int runtime = 44 dòng → control kit** (bảng PHA 3 Field Ledger); mục 4 |
| `operator-convenience.md` | ✅ | "#14 tìm khách bằng 4 số cuối SĐT; #25 dòng tổng ghim cuối bảng; #29 queue mode duyệt; #2 Lưu & tạo tiếp" | List View (M04) + Form View (M11) — Frappe hỗ trợ sẵn (awesomebar, `Ctrl+S`, `Save & New`) |
| `pos-fnb-contract.md` | ⛔ N/A | Demo không phải F&B/POS (dùng DocType ERPNext chung: Item/Sales Order) | — |

---

## Mục 0 — Assumptions & Câu hỏi mở

### 0.1 Giả định đã tự quyết (mặc định xưởng, user đổi được ở Cổng 2)

| Giả định | Căn cứ | Rủi ro nếu sai |
|---|---|---|
| Tên/slug/vị trí = **MetaForge / `meta-forge` / `C:\MetaForge`** (root, không dưới `C:\AppWeb`) | Là Frappe SPA giống `C:\Kairo`/`C:\OngXanh`, không phải Cloudflare app | Đổi tên = rename thư mục, rẻ |
| Kiến trúc = **headless Frappe + React SPA**, KHÔNG D1/Worker/multi-tenant AppWeb | User chọn "FE mới cắm Frappe backend thật" | Nếu đổi sang tự-dựng-D1 phải viết lại toàn bộ tầng data |
| Data layer = **`frappe-react-sdk`** bọc sau **`FrappeAdapter`** (`useFrappeGetDoc/DocList/Auth`, `db.*`, `call.*`, `file.uploadFile`) | SDK **cộng đồng** cho React/Frappe, hiện do **The Commit Company** duy trì (repo The Commit Company, KHÔNG phải repo lõi tổ chức Frappe) | Engine chỉ gọi qua `FrappeAdapter` — đổi/nâng SDK không khóa chặt engine vào API của package |
| Auth = **Frappe session cookie** (`/api/method/login`, boot data), KHÔNG JWT/D1 tự dựng | Frappe lo auth/permission/CSRF sẵn | — |
| Đa khách = **site-per-tenant của Frappe** (1 site = 1 khách), engine không tự làm tenancy | Frappe chuẩn | — |
| Chuẩn "1:1" đối chiếu = **Frappe Desk form renderer** (`frappe/public/js/frappe/form`), KHÔNG phải CRM/Helpdesk Vue | PHA 1: CRM renderer bỏ `read_only_depends_on` | Nếu đối chiếu CRM sẽ thiếu hành vi |
| Stack FE = **Vite + React + TypeScript + shadcn/ui + Tailwind + TanStack Table/Query + RHF + Zod + Recharts** | RULES.md FE (bất biến); dark mode 3 chế độ | — |
| UI kit + palette = **KeToan/Toka shared** (primary `#1B4DFF`), KHÔNG tự đặt màu | RULES.md; app dùng chung palette | — |
| Ngôn ngữ UI = **song ngữ**: nhãn field lấy `label`/`translation` từ Frappe (EN/VI theo site), chrome của engine mặc định **tiếng Việt** | Frappe có i18n sẵn; user Việt | — |
| Site demo = **site riêng trên bench VPS 222** (VD `meta.kairo.vn`/`metaforge.localhost`), seed = ERPNext DocType có sẵn, thoải mái tạo/xóa | User: "demo không có khách, thoải mái sửa xóa" | Không đụng erp.kairo.vn/ongxanh.kairo.vn (LIVE chung bench) |
| Deploy = **compose thủ công đúng 5 file, KHÔNG `dc.sh`**; SPA build → served qua Frappe `www`/`assets` (kiểu Doppio) | Memory Ong Xanh: `dc.sh` postgres bug sập cả 2 site | Dùng `dc.sh` = downtime khách thật |

### 0.2 Câu hỏi mở (gom 1 lượt, chờ user — KHÔNG chặn viết BRD)

| # | Câu hỏi | Mặc định nếu không trả lời |
|---|---|---|
| Q-A | Tên sản phẩm giữ **MetaForge** hay đổi (vd "Kairo Meta", "DeskFrame")? | Giữ MetaForge |
| Q-B | Site Frappe demo: tạo site MỚI `meta.kairo.vn` hay dùng site sẵn có (`erp.kairo.vn` là LIVE — KHÔNG nên)? | Tạo site mới riêng cho demo |
| Q-C | App demo là 1 **Frappe custom app đóng gói SPA** (bench build) hay chỉ **Vite dev proxy** vào site? | Đóng gói Frappe app (production-real hơn) |
| Q-D | Client Script 1:1: chạy JS `frappe.ui.form.on` gốc trong **compatibility executor** (`new Function`, code tin cậy cùng site) hay yêu cầu viết lại theo API MetaForge? | Compatibility executor chạy script gốc (đúng "1:1"); rõ ràng KHÔNG phải security sandbox — server Frappe là ranh giới bảo mật |
| Q-E | ✅ **ĐÃ CHỐT (user, 2026-07-23): GỒM LUÔN builder kéo-thả đầy đủ ngay vòng đầu** — DocType Builder + Workflow Builder + Print Format Builder + Dashboard Builder WYSIWYG. "Không hoãn" tuyệt đối: cả tầng RUNTIME (render+vận hành) lẫn tầng AUTHORING (thiết kế meta trực quan) đều 1:1 ngay từ đầu. | — |

> **Hệ quả Q-E:** phạm vi gồm cả builder → thêm màn M17 (DocType Builder đầy đủ), M18 (Workflow Builder), M21 (Print Format Builder), M22 (Dashboard Builder). Builder GHI vào chính các meta-DocType của Frappe (DocType/DocField/Workflow/Print Format/Property Setter/Custom Field/Number Card/Dashboard Chart) qua API — KHÔNG fork core, chỉ tạo/sửa document meta như Desk builder gốc làm.

---

## Mục 1 — Vấn đề (Problem)

Frappe/ERPNext mạnh nhất ở tầng **metadata-driven**: định nghĩa 1 DocType (schema field + quyền + workflow + naming + print) là tự có List/Form/Report/API — không code UI từng màn. Nhưng tầng render mặc định (**Desk**) là jQuery/Bootstrap đời cũ: UX nặng nề, mobile kém, khó nhúng thương hiệu, không phải React/shadcn hiện đại.

Các FE hiện đại chính chủ của Frappe (**CRM/Helpdesk viết Vue**) đẹp nhưng **render meta KHÔNG đầy đủ** — mỗi app hardcode lại một phần, bỏ nhiều hành vi meta (`read_only_depends_on`, permlevel masking, child-table đầy đủ, client script). Hệ quả: muốn FE đẹp thì mất tính "data-driven", muốn data-driven thì kẹt Desk cũ.

**Nỗi đau (xếp hạng theo độ khó × giá trị, từ PHA 1):**
1. **Form động 1:1** (depends_on/fetch_from/section-tab/child-grid/Link) — nơi mọi renderer bên thứ 3 hụt. ★★★★ khó / ★★★★★ giá trị → **màn chính = Form View (M11)**.
2. **Client Script engine** (`frappe.ui.form.on` chạy trong React) — khó nhất kỹ thuật.
3. **Permission 1:1** (role + permlevel mask field + user permission + if_owner + workflow-state) — sai tinh vi = lộ dữ liệu.
4. **Workflow engine** (state machine + nút action gated theo role).
5. **List/Report + đa view** (Kanban/Calendar/Gantt/Tree/Dashboard) sinh từ meta.

## Mục 2 — Mục tiêu (Goal)

**Kết quả định lượng:**
- **G1 — Zero hardcode màn nghiệp vụ:** thêm/sửa 1 DocType trong Frappe → MetaForge tự render List + Form + các view đúng, **không sửa 1 dòng code FE**. Nghiệm thu: bật 1 DocType ERPNext bất kỳ chưa từng thấy (vd `Sales Order`, `Item`, `Delivery Note`) → dùng đầy đủ được.
- **G2 — Phủ 100% fieldtype Frappe** (43 authorable từ builder + Long Int runtime = 44 dòng, field-ledger.md) — mỗi fieldtype có control render đúng + đọc/ghi đúng.
- **G3 — Hành vi động 1:1:** `depends_on`, `mandatory_depends_on`, `read_only_depends_on`, `collapsible_depends_on`, `fetch_from`, section/column/**tab** break, child-table grid, Link + Dynamic Link, naming series — hoạt động y Desk.
- **G4 — Permission 1:1:** đúng những gì Desk cho thấy/sửa: create/read/write/delete/submit/cancel/amend theo role; **permlevel mask field**; user permission lọc record; `if_owner`; field khoá theo workflow-state. FE ẩn đúng + **Frappe server vẫn là chốt**.
- **G5 — 1:1 các view:** List, Report (group-by), Kanban (chip lý do khi đổi cột — luật AppWeb), Calendar, Gantt, Tree, Dashboard (Number Card + Chart).
- **G6 — Client Script + Workflow + Print Format** chạy được từ meta có sẵn của site.

**Quy tắc bất biến (không được vi phạm):**
- **Không bao giờ hiển thị/cho sửa field mà Frappe permission cấm** — engine phân biệt 6 trạng thái field (tồn tại-schema / được-hiển-thị / đọc-được-giá-trị / sửa-được / bị-mask / bị-khóa-bởi-permlevel·docstatus·workflow). **Frappe server là security boundary cuối cùng**; engine chỉ phản chiếu cho UX, không tự "mở khoá".
- **Không xoá cứng bypass Frappe** — mọi delete/cancel đi qua API Frappe (Frappe tự lo submit/cancel/soft rules).
- **Client Script compatibility executor (KHÔNG phải security sandbox)** — chạy script do **System Manager/Developer của site cài đặt & tin cậy** (full-compatibility, cùng site); `new Function` là cơ chế **thực thi tương thích** — nó chạy ở global scope và là điểm thực thi code động có nguy cơ injection, **truyền vài biến whitelist KHÔNG biến nó thành môi trường cô lập**; whitelist API chỉ để kiểm soát **contract MetaForge**, không được coi là ranh giới cô lập bảo mật.

**Điều kiện tin dùng (tiêu chí nghiệm thu, nguyên văn tinh thần user):** *"copy 1:1 tính năng metadata-driven của Frappe ERPNext hoàn toàn"* — một DocType bất kỳ dựng trong Frappe phải dùng được trọn vẹn trên MetaForge y như trên Desk, đẹp hơn, mobile tốt hơn, **không cần sửa code FE**.

## Mục 3 — Actor & Vai trò

Actor của MetaForge = **role của Frappe** (không phải role tự chế). Engine render KHÁC NHAU theo role vì đọc DocPerm.

| Actor (persona) | Role Frappe điển hình | Nhiệm vụ | Phạm vi dữ liệu thấy (row-level) | Quyền thao tác |
|---|---|---|---|---|
| **Người dùng nghiệp vụ** | vd `Sales User`, `Stock User` | Tạo/sửa/xem document của các DocType được cấp | Theo **User Permission** + `if_owner` + company/territory Frappe áp | CRUD theo DocPerm từng DocType; submit/cancel nếu được cấp |
| **Quản trị hệ thống** | `System Manager` | Cấu hình DocType/permission/workflow/print, quản user | Tất cả (trừ giới hạn permlevel cấu hình) | Toàn quyền desk-level; sửa Customize Form, Role Permission |
| **Administrator** | `Administrator` | Siêu quản trị site | Tất cả | Tất cả, kể cả bypass permission (Frappe cho phép) |
| **Người tác giả app** (dev/BA) | `System Manager` + Developer Mode | Định nghĩa DocType/Client Script/Workflow (ở Desk gốc hoặc builder MetaForge lớp sau) | — | Thiết kế meta |
| **Guest/khách** | `Guest` | Chỉ Web Form/portal công khai nếu site bật | Chỉ doc `Guest` được phép | Rất hạn chế |
| **Engine (hệ thống)** | — | Resolve meta, mask field theo permission server trả, render | — | Không có quyền riêng — luôn hành động DƯỚI session người dùng |

> Nguyên tắc: **MetaForge KHÔNG tự quyết quyền.** Nó phản chiếu (`mirror`) quyền Frappe cho UX; mọi ghi/đọc vẫn qua API Frappe với session người dùng — server chốt.

## Mục 4 — Thực thể dữ liệu (Meta model — chủ yếu ĐỌC từ Frappe)

MetaForge hầu như **không sở hữu bảng nghiệp vụ**; nó tiêu thụ **meta của Frappe**. Chi tiết field từng entity meta → `docs/brd-entities/` (viết ở PHA 3 kèm Field Ledger ánh xạ fieldtype). Bảng chỉ mục:

| # | Entity meta (nguồn Frappe) | Vai trò với engine | Lấy qua |
|---|---|---|---|
| E01 | **DocType** | Định nghĩa 1 loại document (module, istable, issingle, autoname, naming_rule, is_submittable, track_changes, title_field, image_field, search_fields, sort_field) | `frappe.desk.form.load.getdoctype` / `/api/resource/DocType/<name>` |
| E02 | **DocField** | 1 field: `fieldname,label,fieldtype,options,reqd,unique,read_only,hidden,default,depends_on,mandatory_depends_on,read_only_depends_on,collapsible,collapsible_depends_on,fetch_from,fetch_if_empty,in_list_view,in_standard_filter,in_preview,permlevel,precision,length,non_negative,allow_on_submit,bold,description,columns` | nested trong getdoctype `docs[].fields` |
| E03 | **DocPerm / Custom DocPerm** | Quyền theo role: `role, permlevel, read/write/create/delete/submit/cancel/amend/report/export/import/share/print/email, if_owner` | getdoctype `docs[].permissions` |
| E04 | **User Permission** | Lọc record theo user (vd chỉ Company X) | boot / `frappe.client` |
| E05 | **Workflow** (parent) + child **Workflow Document State** (`states[]`) + child **Workflow Transition** (`transitions[]`); **Workflow State** = master (Link target, KHÔNG phải child) | parent: `document_type`, `workflow_state_field`(**Data**=fieldname; field thiếu→Frappe tạo hidden Custom Field Link→Workflow State), `is_active`, `override_status`, `send_email_alert`, `enable_action_confirmation`, `workflow_data`. state: `state`(Link→Workflow State), `doc_status`, `allow_edit`(role), `update_field/update_value`, `is_optional_state`, `avoid_status_override`, `evaluate_as_expression`. transition: `state`→`action`→`next_state`, `allowed`(role), **`condition`(Python/safe_eval)**, `allow_self_approval`. **Initial = `states[0]`** (idx đầu) | `GET /api/resource/Workflow?filters=[["document_type","=",dt]]`; apply = `frappe.model.workflow.apply_workflow(doc, action)` |
| E06 | **Client behavior assets** (bundle của FormMeta v16) | JS/asset runtime cho form/list/**calendar/tree/dashboard/kanban** — nguồn là metadata bundle, KHÔNG phải resource CRUD | getdoctype bundle: `__js`, `__custom_js`, `__list_js`, `__custom_list_js`, **`__calendar_js`, `__tree_js`, `__dashboard`, `__kanban_column_fields`, `__workflow_docs`, `__print_formats`, `__templates`, `__listview_template`, `__form_grid_templates`, `__css`** (đã grep-verify meta.py 16.28). Chi tiết chuẩn hoá/thực thi từng asset: **appendix §Q External Runtime Assets Contract**. `/api/resource/Client Script` chỉ cho builder/CRUD (M17) |
| E07 | **Print Format** | HTML/Jinja + `format_data`; hoặc "Standard" | `/api/method/frappe.www.printview` / getdoctype |
| E08 | **Property Setter** + **Custom Field** | Overlay đè lên base meta (đã merge sẵn trong getdoctype) | tự áp trong getdoctype |
| E09 | **Naming Series** / autoname | Sinh mã `PRE.#####` / field / expr / prompt / hash | thuộc DocType + `/api/method` |
| E10 | **Number Card** + **Dashboard Chart** + **Dashboard** | KPI + biểu đồ meta-driven cho Workspace/Dashboard view | `/api/resource/*` |
| E11 | **Workspace** | Trang chủ: shortcut, card, chart, link theo module + role | `/api/method/frappe.desk.desktop.get_workspace_sidebar_items` + `get_desktop_page` |
| E12 | **Kanban Board** | Cấu hình board (column theo Select field, filters) | `/api/resource/Kanban Board` |
| E13 | **Report** (Query/Script/Report Builder) | Định nghĩa báo cáo | `/api/resource/Report` + `frappe.desk.query_report.run` |
| E14 | **List View Settings / List Settings** | Cấu hình cột list, filter mặc định | boot / DocType |
| E15 | **File** | Attachment (Attach/Attach Image/Signature) | `/api/method/upload_file` + `/api/resource/File` |
| E16 | **Comment / Version / Activity / Notification Log** | Timeline + audit field-level + thông báo | `/api/resource/*`, `frappe.desk.form.load.get_docinfo` |

**Entity MetaForge tự sở hữu (rất ít, chủ yếu local):**

| Entity | Lưu ở đâu | Mục đích |
|---|---|---|
| `mf_user_prefs` | localStorage (per user+site) | độ rộng/tập cột hiển thị bảng, density, theme, view mặc định/doctype (data-table-contract) |
| `mf_saved_view` (tùy chọn) | Frappe DocType tự tạo HOẶC dùng `List View Settings` sẵn | saved view chia sẻ |
| draft form | localStorage (per user+form) | autosave (polish-contract §4) |

### 4.1 Danh mục dùng chung (Master Data) — thoả tự nhiên bởi cơ chế Link

Trong Frappe, MỌI "danh mục" (Item Group, Territory, Customer Group, Department…) **tự là 1 DocType**, và mọi field chọn-từ-danh-sách là fieldtype **`Link`** (hoặc `Select` cho enum cứng). Vì engine render Link field ĐÚNG cơ chế ERPNext (combobox + `+ Thêm mới` mở form gốc — form-workflow-contract), **yêu cầu master-data-contract được thoả 100% mặc định**, không cần bảng riêng: mỗi Link field = 1 danh mục, `+ Thêm mới` = tạo document của DocType đích. Sidebar "Danh mục" = nhóm module/DocType (Workspace) — xem M02/M20.

## Mục 5 — Luồng nghiệp vụ (Business Flows)

Chi tiết per-actor từng bước + nhánh lỗi → **`docs/brd-flows/00-core-flows.md`** (F0–F9, mỗi luồng bảng 5 cột + nhánh lỗi). Bảng chỉ mục:

| Luồng | Actor chính | Tóm tắt | File chi tiết |
|---|---|---|---|
| **F0 — Login & Boot** | mọi user | login `/api/method/login` → nạp **MetaForgeBootDTO** (whitelisted read-only: user/roles/locale/CSRF/defaults/workspaces/system settings tối thiểu — `get_logged_user` CHỈ trả username) → dựng sidebar theo role | `00-core-flows.md` §F0 |
| **F1 — Mở List bất kỳ DocType** | user nghiệp vụ | chọn DocType → getdoctype (meta) → render cột từ `in_list_view` → `frappe.client.get_list` (fields/filters/order/paginate) → 3 cột khi bấm dòng | `00-core-flows.md` §F1 |
| **F2 — Mở/Tạo/Lưu document (hành vi động)** | user nghiệp vụ | render form từ meta: section/tab/column, `depends_on` ẩn/hiện realtime, `fetch_from` autofill, Link nested `+Thêm mới`, child grid, naming preview → `db.createDoc/updateDoc` (optimistic lock qua `modified` → 417) | `00-core-flows.md` §F2 |
| **F3 — Chạy Client Script** | engine | nạp client behavior assets (`__js`/`__custom_js`) của dt → **compatibility executor** (KHÔNG phải security sandbox) chạy `frappe.ui.form.on` handlers (`refresh/validate/<field>` …) map vào lifecycle React form | `00-core-flows.md` §F3 |
| **F4 — Workflow transition** | user (role) | đọc Workflow → hiện nút action đúng `Allowed` role tại state hiện tại → `apply_workflow` (nếu kèm chip lý do → **orchestration method** atomic, xem Atomic Ops Contract appendix §R) | `00-core-flows.md` §F4 |
| **F5 — Render theo permission** | engine | getdoctype trả meta + `masked_fields`; getdoc áp `apply_fieldlevel_read_permissions()` **mask GIÁ TRỊ** theo permlevel + `docinfo.permissions` → engine phân biệt 6 trạng thái field; thao tác cấm → nút ẩn + **server chốt** | `00-core-flows.md` §F5 |
| **F6 — In (Print Format)** | user | chọn Print Format → `frappe.www.printview.get_html`/render Jinja → route `/print/<dt>/<name>` + `window.print()`; QR + số chứng từ | `00-core-flows.md` §F6 |
| **F7 — Data Import** | System Manager | wizard: tải template → upload → map cột → preview → `form_start_import` → poll `get_import_status`; **partial success** (log OK/lỗi theo dòng + `download_errored_template`), KHÔNG hứa rollback toàn batch | `00-core-flows.md` §F7 |
| **F8 — Submit/Cancel/Amend** | user (role submit) | docstatus 0→1 (submit) / 1→2 (cancel) / amend → field khoá `allow_on_submit`; nút theo docstatus | `00-core-flows.md` §F8 |
| **F9 — Customize (Custom Field/Property Setter)** | System Manager | sửa property field (label/reqd/hidden/options) → ghi Property Setter/Custom Field → clear cache meta (KHÔNG bench migrate) | `00-core-flows.md` §F9 |

## Mục 6 — Ma trận quyền (nguồn chốt = Frappe server)

MetaForge **không định nghĩa endpoint NGHIỆP VỤ** — nó gọi API chuẩn Frappe; quyền do Frappe enforce theo DocPerm/permlevel/User Permission. Engine chỉ **mirror** để ẩn nút/field (UX). **Ngoại lệ được phép** (tầng adapter, KHÔNG chứa business rule): **boot DTO** (appendix §S) + **orchestration atomic** liệt kê đầy đủ ở appendix §R (vd workflow+comment 1 txn). Bảng endpoint Frappe dùng + ai gọi được:

| Method + Endpoint Frappe | Dùng để | Ai gọi | Frappe enforce gì |
|---|---|---|---|
| `POST /api/method/login` | đăng nhập | Public | rate-limit, lockout của Frappe |
| `GET /api/method/frappe.auth.get_logged_user` / boot | phiên + roles | Authenticated | trả role thật của user |
| `GET frappe.desk.form.load.getdoctype?doctype=X` | tải Form metadata bundle (fields+perms+links+`__js`+`masked_fields`) | user có `read` X | trả meta schema + **`masked_fields`** theo user/meta (permlevel) |
| `GET /api/resource/<DocType>?fields&filters&limit_start&limit_page_length&order_by` | list | user có `read` | User Permission + if_owner tự áp |
| `GET /api/resource/<DocType>/<name>` (+ `getdoc`/`get_docinfo`) | 1 doc | user có `read` doc đó | (1) check read permission → (2) **`apply_fieldlevel_read_permissions()`** mask/loại GIÁ TRỊ theo permlevel → (3) trả `docinfo.permissions` cho doc |
| `POST /api/resource/<DocType>` | tạo | user có `create` | validate + naming + mandatory server-side |
| `PUT /api/resource/<DocType>/<name>` | sửa | user có `write` | optimistic lock (`modified`), permlevel, allow_on_submit |
| `DELETE /api/resource/<DocType>/<name>` | xoá | user có `delete` | link integrity, submit rules |
| `POST /api/method/frappe.model.workflow.apply_workflow` | chuyển workflow | role trong `Allowed` của transition | chặn transition sai role/state |
| `POST /api/method/frappe.client.submit` / cancel | submit/cancel | role `submit`/`cancel` | docstatus rules |
| `POST /api/method/upload_file` | upload Attach/ảnh/chữ ký | user có `write` doc | private/public + attach permission |
| `GET frappe.desk.form.load.get_docinfo` | timeline/comment/version/assign | user có `read` | — |
| `GET frappe.desk.query_report.run` | chạy Report | role được cấp Report | scope report |
| `GET frappe.www.printview` / print API | render Print Format | user có `print` | — |
| `POST /api/method/frappe.client.get_count` / `get_value` / `get_list` | tiện ích (đếm, tra Link, autofill fetch_from) | theo doctype | permission per doctype |

> **Mô hình permission (Frappe v16 — chính xác):** meta schema CÓ THỂ vẫn chứa định nghĩa DocField; `FormMeta` trả kèm **`masked_fields`**. Khi tải document, server: (1) check read permission; (2) áp **`apply_fieldlevel_read_permissions()`** lên GIÁ TRỊ (mask/loại theo permlevel); (3) trả `docinfo.permissions`. ⇒ Engine PHẢI phân biệt: field **tồn tại schema** / **được hiển thị** / **đọc-được-giá-trị** / **sửa-được** / **bị-mask** / **bị-khóa** (permlevel·docstatus·workflow). **Server Frappe là security boundary cuối cùng.**
>
> **Test cách ly (PHA 6) — ĐÚNG hình dạng endpoint** (`/api/resource/<field>` KHÔNG hợp lệ): (a) `GET /api/resource/<dt>?fields=["<field-permlevel-cao>"]` hoặc `frappe.client.get_value` → field permlevel-cao **bị omit/mask** trong response; (b) `getdoc`/`get_docinfo` → giá trị field cao bị loại + `docinfo.permissions` báo không write; (c) **PUT ghi field permlevel-cao** → **server reject (403)**. KHÔNG đòi field biến mất khỏi metadata schema — đòi **GIÁ TRỊ bị mask + ghi trái quyền bị chặn**.

## Mục 7 — MVP Screens (index; card chi tiết ở `docs/brd-screens/`)

> Vì >8 màn (guide §1.1) → mỗi màn 1 file. "Màn" của MetaForge = **renderer generic**, dùng cho MỌI DocType. Trạng thái: ⬜ chưa viết card / ✅ đủ 6 khối + Khối 2b.
>
> **Route namespace:** `/app/*` là namespace RIÊNG của MetaForge (không đổi). Chuẩn đối chiếu hành vi = **Frappe Desk v16**, KHÔNG yêu cầu URL parity. (Desk gốc Frappe v16 đã chuyển từ `/app` sang `/desk/*`.)

| STT | Màn (renderer) | route | Role vào | Contract chính | File card | TT |
|---|---|---|---|---|---|---|
| M00 | **App Shell** (sidebar/topbar/BottomNav+FAB/CommandPalette/Theme/PWA) | khung | mọi role | frontend-360 + mobile-pwa | `brd-screens/00-app-shell.md` | ✅ |
| M01 | **Đăng nhập** (Frappe session) | `/login` | Public | screen-catalog Login + guide §8 (adapt Frappe) | `brd-screens/01-login.md` | ✅ |
| M02 | **Workspace / Trang chủ** (shortcut+number card+chart theo role) | `/app` `/app/<workspace>` | mọi role | screen-catalog Dashboard | `brd-screens/02-workspace.md` | ✅ |
| M03 | **Awesomebar / Command palette** (Ctrl+K, global search doctype+record) | overlay | mọi role | polish §3 + frontend-360 | `brd-screens/03-awesomebar.md` | ✅ |
| M04 | **List View** (generic — cột từ `in_list_view`, filter, bulk, 3 cột) | `/app/<doctype>` | có `read` | data-table + screen-catalog 3 cột | `brd-screens/04-list-view.md` | ✅ |
| M05 | **Report View** (group-by, aggregate, column picker, saved) | `/app/<doctype>/view/report` | có `read`/`report` | data-table + screen-catalog | `brd-screens/05-report-view.md` | ✅ |
| M06 | **Kanban View** (board từ Select field, chip lý do khi đổi cột) | `/app/<doctype>/view/kanban/<board>` | có `write` | screen-catalog Kanban | `brd-screens/06-kanban-view.md` | ✅ |
| M07 | **Calendar View** (từ date/start-end field) | `/app/<doctype>/view/calendar` | có `read` | screen-catalog Calendar | `brd-screens/07-calendar-view.md` | ✅ |
| M08 | **Gantt View** | `/app/<doctype>/view/gantt` | có `read` | screen-catalog Calendar (biến thể) | `brd-screens/08-gantt-view.md` | ✅ |
| M09 | **Tree View** (nested-set doctype) | `/app/<doctype>/view/tree` | có `read` | screen-catalog | `brd-screens/09-tree-view.md` | ✅ |
| M10 | **Dashboard / Chart View** (Number Card + Dashboard Chart) | `/app/dashboard/<name>` | mọi role | screen-catalog Dashboard + polish §7 | `brd-screens/10-dashboard-view.md` | ✅ |
| M11 | **Form View** ⭐ (3 cột: sidebar/form động/timeline; fieldtype đủ; depends_on/fetch_from/child-grid/Link nested; client script; workflow bar) | `/app/<doctype>/<name>` `.../new` | có `read`/`write`/`create` | form-workflow + screen-catalog Detail+History + media-capture | `brd-screens/11-form-view.md` | ✅ |
| M12 | **Child-table Grid** (editor bảng con trong form + full-page grid) | trong M11 | theo cha | form-workflow "Bảng con" + data-table | `brd-screens/12-child-grid.md` | ✅ |
| M13 | **Print View** (render Print Format) | `/print/<doctype>/<name>` | có `print` | print-contract | `brd-screens/13-print-view.md` | ✅ |
| M14 | **Data Import** (wizard 5 bước map Frappe importer) | `/app/data-import` | System Manager | data-table Nhập Excel | `brd-screens/14-data-import.md` | ✅ |
| M15 | **Report Builder / Query Report viewer** | `/app/query-report/<name>` | role report | screen-catalog + data-table | `brd-screens/15-report-runner.md` | ✅ |
| M16 | **Role Permission Manager** (xem/sửa DocPerm theo role/permlevel) | `/app/permission-manager` | System Manager | screen-catalog Users&Roles | `brd-screens/16-permission-manager.md` | ✅ |
| M17 | **DocType Builder** ⭐ (kéo-thả field/section/column/tab, đặt property/naming/permissions; + Customize Form cho Custom Field/Property Setter overlay) | `/app/doctype-builder` `/app/customize-form` | System Manager + Developer | form-workflow + field-ledger | `brd-screens/17-doctype-builder.md` | ✅ |
| M18 | **Workflow Builder** (vẽ state machine: states + transitions + role/action, kéo-nối; ghi Workflow/State/Transition) | `/app/workflow-builder/<name>` | System Manager | screen-catalog | `brd-screens/18-workflow-builder.md` | ✅ |
| M19 | **Notifications** (bell + list, deep-link — Notification Log) | overlay + `/app/notifications` | mọi role | notify-contract | `brd-screens/19-notifications.md` | ✅ |
| M20 | **Settings / My Settings + module launcher ("Danh mục")** | `/app/settings` | mọi role (theo mục) | screen-catalog Settings + master-data | `brd-screens/20-settings.md` | ✅ |
| M21 | **Print Format Builder** (WYSIWYG khối kéo-thả + editor HTML/Jinja; ghi Print Format) | `/app/print-format-builder/<name>` | System Manager | print-contract + form-workflow | `brd-screens/21-print-format-builder.md` | ✅ |
| M22 | **Dashboard Builder** (tạo/sắp Number Card + Dashboard Chart, chọn nguồn/aggregate) | `/app/dashboard/<name>/edit` | System Manager | screen-catalog Dashboard + polish §7 | `brd-screens/22-dashboard-builder.md` | ✅ |

**Đếm: 23 màn / 23 card ✅** (đủ 6 khối + Khối 2b, `docs/brd-screens/00–22`). Màn chính runtime = **M11 Form View**; màn chính authoring = **M17 DocType Builder**.

## Mục 8 — Ngoài phạm vi (vòng đầu — KHÔNG cắt khỏi dự án, xếp đợt sau trong cùng repo)

> Builder kéo-thả (DocType/Workflow/Print/Dashboard) ĐÃ ĐƯA VÀO SCOPE (Q-E chốt) — không còn ở đây.

- **Report Builder tạo Query Report bằng UI viết SQL trực quan** (vòng đầu: chạy + xem report có sẵn + Report View group-by M05; tạo Query Report SQL vẫn qua Desk gốc).
- **Web Form / Portal công khai (Guest)** — engine tập trung Desk-experience trước.
- **Realtime socketio** (doc_update live, "B đang xem") — nice-to-have, thêm sau khi core ổn (SDK chưa xác nhận socketio → dùng polling/refetch trước).
- **Đa ngôn ngữ ngoài EN/VI**, RTL.
- **Mobile app đóng gói (Capacitor)** — PWA trước.
- KHÔNG sửa/fork Frappe core; KHÔNG viết lại backend.

## Mục 9 — Ràng buộc đã chốt (Decided)

| Tham số | Giá trị |
|---|---|
| Breakpoint | `<768px` mobile / `≥768px` desktop (frontend-360) |
| Optimistic lock | gửi lại `modified` của document đã tải; Frappe phát **`TimestampMismatchError`** (kế thừa `ValidationError` → **HTTP 417** ở v16, KHÔNG hardcode 409) → nhận diện ưu tiên qua `exc_type`/API v2 error type → mở conflict UI (không ghi đè im lặng) |
| List sort mặc định | 1) saved user setting → 2) DocType `sort_field` + `sort_order` → 3) fallback **Frappe v16 = `creation desc`** (KHÔNG `modified desc`) |
| List paginate | `limit_page_length` mặc định 20/50/100; server-side |
| Meta cache | cache getdoctype theo `{doctype, version}` (SWR); invalidate khi Customize/Property Setter đổi |
| Client Script executor | **Compatibility executor**, KHÔNG phải security sandbox: `new Function` scope whitelisted (`frm`, `frappe.call` proxy, `frappe.msgprint`, `frappe.db.get_value`…). Chạy code tin cậy cùng site (System Manager/Developer). Whitelist = contract, không phải ranh giới bảo mật; server Frappe vẫn chốt mọi ghi |
| fetch_from | MetaForge chạy **client-side** đúng hành vi Desk khi Link/source đổi; tôn trọng `fetch_if_empty` + dirty-tracking; **giá trị đã fetch gửi kèm document khi save**; server tiếp tục validate/controller/business rules. KHÔNG mặc định tuyên bố server tự chạy lại mọi `fetch_from` |
| depends_on eval | biểu thức JS Frappe (`eval:doc.x=='y'` hoặc `fieldname`) — parse đúng cú pháp Frappe |
| Số/tiền/ngày | format qua `shared/format.ts`; ngày `dd/MM/yyyy`; Currency theo `currency` field/precision meta |
| Dark mode | 3 chế độ (Sáng/Tối/Hệ thống) |
| Naming preview | field `autoname`/naming_series → hiện "mã dự kiến"; số thật do Frappe cấp lúc lưu |

## Mục 10 — Định danh sản phẩm

| Field | Giá trị |
|---|---|
| `slug` | `meta-forge` |
| Tên hiển thị | **MetaForge** |
| Họ ngành | **Developer tool / Low-code platform layer** (không phải app nghiệp vụ 1 ngành) — palette KeToan/Toka chung, icon đề xuất `Blocks`/`LayoutTemplate` (lucide) |
| Tier | Không áp mô hình `shared`/`isolated` của ADR-001 (đó là cho D1). Ở đây tenancy = **Frappe site-per-tenant**; 1 bản MetaForge phục vụ 1 site (đóng gói thành Frappe app) |
| Đầu ra | **(1) engine kit** `@metaforge/*` (renderer + hooks + adapter frappe-react-sdk) tái dùng; **(2) app demo** dựng trên engine, chạy site Frappe thật (ERPNext DocType) |
| Gói bán kèm | (tương lai) bán như "modern Desk thay thế" cho khách Frappe/ERPNext; hoặc nền để dựng SPA nghiệp vụ nhanh |
| Dòng `app_catalog` | *"MetaForge — giao diện React hiện đại thay Desk cho Frappe/ERPNext: mọi DocType tự render List/Form/Report/Kanban 1:1, không code."* icon `Blocks` |

---

## §2 — Danh sách nghiệp vụ bắt buộc (rà TỪNG mục)

| # | Mục | Kết luận |
|---|---|---|
| 1 | Phân quyền & tài khoản | **Áp dụng** — mirror Frappe DocPerm/permlevel/User Permission (mục 3,6); hồ sơ + đổi mật khẩu qua Frappe User (M20); RLS = User Permission Frappe |
| 2 | Thùng rác & bất biến | **Áp dụng** — delete đi qua Frappe (tôn trọng link/submit rules); document `submitted`/`cancelled` bất biến theo docstatus (F8); không xoá cứng bypass |
| 3 | Audit log | **Áp dụng** — Frappe `Version` (field-level before/after) + `Activity Log` hiện ở timeline Form (M11), không tự dựng |
| 4 | Báo cáo & thống kê | **Áp dụng** — Report View (M05) + Query Report (M15) + Dashboard (M10); xuất Excel qua Frappe export |
| 5 | Thông báo & ca | **Áp dụng (một phần)** — Notification Log (M19); "ca làm việc" không áp dụng (engine không phải app chấm công) |
| 6 | Mã vạch–tồn kho | **Áp dụng qua fieldtype** — `Barcode` fieldtype render + sinh/scan (M11); quét súng/camera khi DocType có field barcode. Nghiệp vụ tồn kho là của ERPNext, không phải engine |
| 7 | Kanban/Pipeline | **Áp dụng** — M06, dùng Kanban Board meta + Select field; **chip lý do khi đổi cột (luật AppWeb không ngoại lệ)** ghi kèm comment/workflow |
| 8 | Tích hợp AI | **Áp dụng** — điểm AI: "Điền từ ảnh/tệp" (OCR prefill) ở Form fieldtype phù hợp; "Hỏi AI" ở List (dịch câu hỏi → filter). Chi tiết bảng màn×AI ở screen cards. (Chạy qua endpoint AI của site nếu có; nếu chưa có LLM ở Frappe → điểm AI hiện "chưa cấu hình", không chặn) |
| 9 | Layout 3 cột | **Áp dụng** — M04 bấm dòng → 3 cột; M11 Form = 3 cột (sidebar/form/timeline). 100% màn bảng desktop |
| 10 | Ảnh/chữ ký/QR/OCR | **Áp dụng** — fieldtype `Attach Image`/`Signature`/`Barcode`/`Geolocation` (M11 + media-capture); QR trên bản in (M13); OCR prefill (#8) |
| 11 | In ấn | **Áp dụng** — Print Format renderer (M13); A4/A5; QR + số + tiền bằng chữ |
| 12 | Nhắc đa kênh/Zalo | **Áp dụng (một phần)** — in-app (M19). Zalo/email tự động là của Frappe Notification (DocType `Notification`) — engine hiển thị + cho bật; cổng nối là cấu hình site, không phải engine dựng |
| 13 | Mã sinh tự động | **Áp dụng** — naming_series/autoname (mục 9 Decided); "mã dự kiến" preview, số thật Frappe cấp lúc lưu |
| 14 | Calendar view | **Áp dụng** — M07 (Ngày/Tuần/Tháng, kéo-thả dời) từ date field meta |
| 15 | Tiện VN + niềm tin | **Áp dụng** — SĐT bấm gọi/Zalo, tìm không dấu, format VN qua `shared/format.ts`; xuất toàn bộ = Frappe export/backup |
| 16 | Autofill (smart defaults) | **Áp dụng** — `fetch_from` (Link → field khác), `default`, ngày=hôm nay, user/session defaults; dirty-tracking không ghi đè (mục Decided) |
| 17 | Polish | **Áp dụng** — virtualize list, optimistic, autosave draft, Ctrl+K hành động, `?` cheatsheet (verify PHA 6) |
| 18 | Lịch sử & vòng đời | **Áp dụng** — timeline Form (M11) gộp: workflow state changes + comment + Version field-level + assignment (get_docinfo) — 1 component chuẩn |
| 19 | Danh mục (Master Data) | **Áp dụng (thoả tự nhiên)** — mọi Link field = danh mục, `+Thêm mới` mở form gốc; sidebar module/Workspace (mục 4.1). KHÔNG có danh mục hardcode |

---

## §7 — Scorecard Cổng 2 (TỰ CHẤM — sẽ hoàn tất ở PHA 2c/2d)

| # | Tiêu chí | Đạt? | Bằng chứng |
|---|---|---|---|
| 1 | Đủ 11 mục cấu trúc, đúng thứ tự | ✅ | mục 0-10 ở trên |
| 2 | MỌI màn có Screen Spec Card đủ 6 khối + Khối 2b — **23 màn / 23 card** | ✅ | `docs/brd-screens/00–22` |
| 3 | Entity **SỞ HỮU** có field table §5; entity Frappe **CONSUME** có interface/source contract (KHÔNG đòi tự định nghĩa lại) | ✅ | `brd-entities/00-entities.md` (§5 entity sở hữu) + mục 4 (source contract E01–E16); Field Ledger 43 authorable + Long Int = 44 dòng = artifact PHA 3 |
| 4 | MỌI luồng có kịch bản per-actor + nhánh lỗi | ✅ | `brd-flows/00-core-flows.md` (F0–F9, bảng 5 cột + nhánh lỗi) + Khối 4 mỗi card |
| 5 | Ma trận quyền phủ 100% endpoint | ✅ | mục 6 (endpoint Frappe) |
| 6 | Danh sách nghiệp vụ bắt buộc: từng mục có kết luận | ✅ | §2 (19 mục) |
| 7 | Assumptions & Câu hỏi mở đã lập, gom 1 lượt | ✅ | mục 0 |
| 8 | Định danh sản phẩm đủ | ✅ | mục 10 |
| 9 | Không còn placeholder | ✅ | grep `sẽ bổ sung/tương tự màn/dữ liệu giả/TODO/TBD`: chỉ khớp 'placeholder' như thuật ngữ UI (avatar/search) + câu luật — không phải nợ nội dung |
| 10 | Nhật ký đọc contract §0 đủ, có rule cụ thể | ✅ | §0 (13 dòng) |

**10 tiêu chí CẤU TRÚC app-factory: ✅.** Nhưng đó chỉ là "đủ mục", KHÔNG phải "đủ để AI tự sinh". Theo **review độc lập (2026-07-23)**, thước "AI sinh cả MetaForge không hỏi lại" cần thêm lớp kỹ thuật — trạng thái:

- ✅ **`brd-appendix/00-engineering-spec.md`** — Engine diagram, Dependency graph, Priority P0–P3, Event Lifecycle, State Machine, **Error Matrix (exc_type v16, 417 không phải 409)**, Cache, Perf budget, NFR, Versioning, Plugin, Risk register, Test Matrix, **API mapping (đánh dấu ✅verified / ⚠️to-verify)**, Out-of-scope (đóng #2–#11, #13–#17).
- ⬜ **BRD Builder riêng** `brd-builder/` (#12) — Canvas/Drag/Grid/Snap/Undo/Redo/Selection/Clipboard/Multi-select/Keyboard/History/Serialization.
- ⬜ **Acceptance Criteria từng màn** (#1) — template ở appendix §N, gắn vào 23 card (ưu tiên P0 trước).
- ⬜ **Grep-verify** mọi dòng ⚠️ trong appendix §P trên VPS 222 (đầu PHA 3).

> **Vòng review độc lập (2026-07-23) — ĐÃ VÁ.** grep-verify 12 fact v16 trên **16.28.0**; sửa xong **B1–B6 + M1–M9 + C3–C6**; thêm appendix **§Q** (External Runtime Assets), **§R** (Atomic Operations), **§S** (Boot/Auth) + **Builder BRD** riêng. **grep cuối SẠCH** (409/sandbox-cũ/PUT-thiếu-name/cùng-transaction/flow-ref không tồn tại). ⇒ **Điều kiện section-E của reviewer để duyệt Cổng 2: ĐẠT.**
>
> Acceptance Criteria per-screen: **23/23 cards** (đã gắn 2026-07-23). Các API tên **⚠️** grep-verify payload thật đầu PHA 3 (reviewer cho phép). **CỔNG 2 = DUYỆT** (user standing approval 2026-07-23). Vào PHA 3.
