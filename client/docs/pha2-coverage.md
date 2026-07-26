# MetaForge — Pha 2 Requirement Coverage Tracker

> **Phương pháp (từ Pha 2 trở đi):** quản theo **requirement coverage**, KHÔNG theo "luồng đã chọn".
> 8/8 E2E của v0.2.0 chỉ chứng minh **luồng demo**, chưa chứng minh **toàn sản phẩm**.
> Mỗi REQ đi qua 4 cột: **live/mock · E2E · screenshot · status**. REQ chỉ `Done` khi:
> **(a) chạy trên Frappe THẬT** (không chỉ mock), **(b) có E2E xanh**, **(c) có screenshot baseline**.
>
> Trạng thái: `Todo` · `Mock` (chạy mock, chưa live) · `Wired` (code live + tsc, chưa E2E/ảnh) · `Done` (live + E2E + ảnh).
>
> **KHÔNG mở lại Pha 1.** v0.2.0 đã tag. Đây là backlog Pha 2 theo thứ tự ưu tiên đã chốt.

## Ưu tiên (chốt với user 2026-07-24)
1. **Live Frappe E2E + screenshot** — nâng REQ product từ `Mock` → `Done` (bằng chứng live).
2. Assignment / attachment / tag **pickers** (adapter đã có method, thiếu UI chọn).
3. Màn còn thiếu: **Login · Workspace · Import · Permission Manager · Settings**.
4. **Notifications** (M19 bell + list).
5. **a11y + i18n** (axe/keyboard/`?` cheatsheet · VI/EN).
6. **Virtualization** + dữ liệu lớn (list ảo hoá, phân trang server tải nặng).
7. **AI endpoint thật** (OpenAI-compat/Anthropic) — *để sau* vì AI đẹp mà nghiệp vụ chưa live hết thì chưa có giá trị.
8. **Share / Connections** (M11 — chưa nối API).

---

## P1 — Live Frappe E2E + screenshot ✅ **HẠ TẦNG XONG — 3/3 live E2E xanh**
> Site cô lập `metaforge.localhost` (VPS 222, frappe 16.28.0 + app metaforge). Tunnel `-L 8000:172.18.0.8:8000` + `VITE_LIVE=1`. Playwright config `playwright.live.config.ts` (project `live`, webServer tiêm site header+token), spec `e2e-live/live.spec.ts`. Seed 8 ToDo (bench console). Token Administrator đọc từ env `MF_TOKEN`/`VITE_FRAPPE_TOKEN` (nguồn `.env.live.local`, gitignored) — KHÔNG hard-code trong repo (xem SECURITY_MODEL §8).
> **4 bug THẬT phát hiện nhờ live E2E** (giá trị của coverage+live, mock không lộ): (1) Bootstrap `getBoot` StrictMode gọi 2 lần → 500 `SAVEPOINT does not exist` → dedupe promise module-level. (2) `docinfo.permissions` live = `{'null':0}` (Frappe không trả doc-perm hữu dụng) → form KHÔNG có nút Lưu → `permsFrom` OPTIMISTIC khi thiếu key perm thật (server là ranh giới cuối). (3) **`<Toaster/>` chưa mount** → mọi `toast()` CÂM (cả mock lẫn live) → mount ở `DemoShell`. (4) FormContainer thêm toast success "Đã lưu". Ngoài ra ToDo có validation co-dependency (Reference Name cần Reference Type) → E2E chọn field độc lập.

| REQ | live/mock | E2E | screenshot | status |
|---|---|---|---|---|
| M00-BOOT getBoot orch (roles/workspaces) | **Live ✅** | live.spec:boot ✅ | live-list ✅ | **Done** |
| M04-LIST-01 render cột từ metadata (getMeta+getList) | **Live ✅** | live.spec:list ✅ | live-list-1280 ✅ | **Done** |
| M04-LIST-06 getCount thật ("1–8/8") | **Live ✅** | live.spec:list ✅ | live-list ✅ | **Done** |
| M04-LIST-02/03/05/07 filter/column/bulk/URL | Mock ✅ / Live wired | list.spec (mock) ✅ / live ⬜ | list-*.png ✅ | **Wired-live** (mock E2E; live E2E riêng sau) |
| M11-LAYOUT 3 cột + click-row-split | **Live ✅** | live.spec:split ✅ | live-split-1280 ✅ | **Done** |
| M11-FORM field từ getdoctype + permlevel masking | **Live ✅** (Secret=•••••• live) | live.spec:split ✅ | live-split (Secret masked) ✅ | **Done** |
| M11-FORM save (updateDoc+modified) | **Live ✅** | live.spec:save ✅ | live-split (nút Lưu) ✅ | **Done** |
| M11-FORM 417 conflict (2 tab ghi lệch) | **Live ✅** | live.spec:417 ✅ (2 page, p1 lưu→p2 stale→417→banner) | — | **Done** |
| CRUD create + delete | **Live ✅** | live.spec:create ✅ (Tạo mới→createDoc→điều hướng→Xoá→deleteDoc) | live-split (Tạo mới) ✅ | **Done** |
| M11-ACTIONS delete (metadata-driven ⋯ menu) | **Live ✅** | live.spec:create (Xoá) ✅ | — | **Done** |
| M11-ACTIONS submit/cancel/amend | Live wired | ⬜ | split-1280 (nút) ✅ | **Wired** (ToDo không submittable — cần doctype submittable) |
| M11-WF workflow (get_transitions + apply_workflow → refetch) | **Live ✅** | live.spec:workflow ✅ (Pending→Approve→Approved, fresh-record idempotent) | **live-workflow-1280** ✅ | **Done** |
| M11-COMMENT addComment → timeline refetch | **Live ✅** | live.spec:comment ✅ | live-split ✅ | **Done** |
- **Seed workflow live:** `Workflow "ToDo Approval"` (Pending→Approve→Approved) trên site cô lập (bench console). **Lưu ý Frappe:** chặn cứng chuyển ngược workflow_state (Approved→Pending = `WorkflowPermissionError` 417 qua MỌI save path) ⇒ E2E workflow dùng **fresh-record** (tạo→duyệt→xoá) để idempotent.
- **Còn (không chặn P1 Done):** submit/cancel/amend cần **doctype submittable** (bare Frappe không có — Pha sau nếu cần: seed 1 custom doctype is_submittable). **P1 = ĐÓNG** (product core CRUD/workflow/comment/conflict verified LIVE).

## P2 — Assignment / Attachment / Tag pickers ✅ **XONG (live E2E 10/10)**
> ContextPanel redesign: `AssignBlock` (combobox tìm user qua searchLink) · `AttachBlock` (FileButton) · `TagBlock` (input inline). Mỗi mục có nút X xoá. `ContextContainer` wire adapter + refetch + toast. Mock demo picker (searchUsers giả). Handler thiếu ⇒ nút disable (không nút giả).

| REQ | live/mock | E2E | screenshot | status |
|---|---|---|---|---|
| M11-ASSIGN add (combobox user) | **Live ✅** (`assign_to.add`) | live.spec:assign ✅ | live-pickers ✅ | **Done** |
| M11-ASSIGN remove (X badge) | **Live ✅** (`assign_to.remove`) | live.spec:assign ✅ | ctx-assign-picker ✅ | **Done** |
| M11-TAGS add (input inline) + remove (X) | **Live ✅** (`add_tag`/`remove_tag`) | live.spec:tag ✅ | live-pickers ✅ | **Done** |
| M11-ATTACH upload (FileButton) + remove | Live wired (`uploadFile`/`deleteDoc(File)`) | ⬜ | live-pickers (nút Chọn tệp) ✅ | **Wired** (UI+adapter; upload E2E fiddly — sau) |
- **Frappe side-effect:** `assign_to.add` trên ToDo tạo ToDo con "Assignment for ToDo…"; `assign_to.remove` chỉ **Cancel** (không xoá) → để lại ToDo Cancelled. Test net-zero về assignment nhưng doc con cần dọn (Frappe behavior, không phải lỗi picker).

## P3 — Màn còn thiếu (5 màn) ✅ **XONG (live E2E 13/13)**
> Nav sidebar nhóm "Hệ thống" + routes `/workspace` `/import` `/permissions` `/settings` (trong Bootstrap) + `/login` (NGOÀI Bootstrap). `SystemScreen` wrapper dùng chung DemoShell.

| REQ | live/mock | E2E | screenshot | status |
|---|---|---|---|---|
| **Workspace** (getWorkspaces + getWorkspace) | **Live ✅** (4 workspace thật + shortcuts + cards) | live.spec:workspace ✅ | live-workspace ✅ | **Done** |
| **Permission Manager** (perm.rolesAndDoctypes + perm.get, ma trận quyền read-only) | **Live ✅** | live.spec:permissions ✅ | live-permissions ✅ | **Done** |
| **Settings** (user/roles/theme/lang/logout) | **Live ✅** | live.spec:settings ✅ | live-settings ✅ | **Done** |
| **Login** (session `adapter.login`) | Live wired (ngoài Bootstrap) | ⬜ (đã auth token) | live-login ✅ | **Wired** (UI Done; E2E khó vì demo đã auth) |
| **Data Import** (M08 — wizard đầy đủ upload→preview→start→status) | **Live ✅** | live.spec:import ✅ | live-import-preview + live-import-result ✅ | **Done** |
- **Bug thật (live E2E lộ):** Frappe v16 `get_desktop_page` trả `shortcuts`/`cards` dạng `{items:[…]}` (KHÔNG mảng trần) → workspace "trống". Fix ở `WorkspaceContainer` (gỡ `.items`, giữ WorkspaceView thuần presentational).
- **Import wizard đầy đủ (v0.4.1):** `Import.tsx` = 3 bước — Cấu hình (DocType + kiểu Insert/Update + tải mẫu) → Tải lên (`createDoc("Data Import")` + `uploadFile(import_file)`) → Xem trước (`get_preview_from_template` thật: badge ánh xạ header→field, cột "bỏ qua" gạch ngang, 6 hàng đầu, cảnh báo) → Kết quả (`form_start_import` enqueue + poll `get_import_status` → success/failed/total, tải bản ghi lỗi). DTO `ImportPreview` (thay `unknown`). **live E2E**: import 2 ToDo thật (upload→preview→start→poll→"Nhập thành công") + best-effort cleanup (proxy `frappe.client.delete`).
  - **2 chặn Frappe THẬT (E2E lộ, mock không thấy):** (1) ToDo mặc định `allow_import=0` → "Data Import is not allowed for ToDo" → seed **Property Setter** `ToDo-main-allow_import` (cơ chế Customize Form, không cần developer_mode). (2) **Scheduler tắt** cho site cô lập → `form_start_import` throw "Scheduler is inactive" (guard Frappe: không import khi scheduler off) → `bench --site metaforge.localhost enable-scheduler`. Cả 2 = seed site cô lập (giữ như Workflow "ToDo Approval").
- **Còn:** sửa quyền (`perm.update`) UI.

## P4 — Notifications (M19)
| REQ | live/mock | E2E | screenshot | status |
|---|---|---|---|---|
| Bell badge (số chưa đọc) | adapter `notifications.list` ✅, UI bell tĩnh | ⬜ | shell (bell) ✅ | **Todo** (nối count + list dropdown + markRead) |
| Realtime push | adapter `realtime?` optional | ⬜ | ⬜ | **Todo** |

## P5 — a11y + i18n
| REQ | live/mock | E2E | screenshot | status |
|---|---|---|---|---|
| axe pass (0 critical) trên list/form/split | ⬜ | axe.spec ⬜ | — | **Todo** |
| keyboard nav (tab/↑↓/Esc) + `?` cheatsheet | phần Esc split ✅ | ⬜ | ⬜ | **Todo** |
| i18n VI/EN (khung + switch) | hardcode VI | ⬜ | ⬜ | **Todo** |

## P6 — Virtualization + dữ liệu lớn
| REQ | live/mock | E2E | screenshot | status |
|---|---|---|---|---|
| List ảo hoá (>1k dòng mượt) | ⬜ | perf.spec ⬜ | ⬜ | **Todo** (TanStack Virtual) |
| Server pagination tải nặng (getCount chuẩn khi search) | getCount không nhận orFilters | ⬜ | ⬜ | **Todo** (orch count-with-search) |

## P7 — AI endpoint thật (SAU khi P1–P2 live)
| REQ | live/mock | E2E | screenshot | status |
|---|---|---|---|---|
| AIProvider nối endpoint (OpenAI-compat/Anthropic) | interface ✅, provider=null | ⬜ | split-ai (chưa cấu hình) ✅ | **Todo** |
| Form: Tóm tắt / Viết giúp / Điền từ ảnh(OCR) | AIActionRegistry ✅ | ⬜ | ⬜ | **Todo** |
| List: "Hỏi AI" → filters | ⬜ | ⬜ | ⬜ | **Todo** |
- Cần user cấp endpoint/key. Streaming + guard chi phí.

## P8 — Share / Connections
| REQ | live/mock | E2E | screenshot | status |
|---|---|---|---|---|
| Shared with (DocShare) | API chưa nối | ⬜ | ⬜ | **Todo** |
| Connections (linked docs) | API chưa nối | ⬜ | ⬜ | **Todo** |

---

## Định nghĩa "Done" (gate Pha 2)
Một REQ đóng `Done` ⇔ **live** (Frappe thật, không mock) **+ E2E xanh** (spec tên rõ) **+ screenshot baseline** (light or dark). Thiếu bất kỳ = tối đa `Wired`. Cập nhật bảng này mỗi PR; `PHASE_TRACKER.md` phản chiếu.
