# Changelog

## v1.0.0-rc.1 — Product hardening

- Closed Goal100 release blockers: role/effective-permission Business Context, contextual list/count including warehouse child tables, advanced KPI/Process route filters, selected-user permission traces, native User Permission management and native Role Profile support.
- Reports now receive server-resolved Company/Fiscal Year/Warehouse context and resolve Link display titles.
- Process stages have distinct state filters and counters; unsupported modules fail visibly instead of falling back to Stock.
- Workspace renderer now exposes shortcuts, cards, number cards, charts, quick lists, onboarding and custom blocks without silently dropping unsupported artifacts.
- Link filters and Table MultiSelect no longer accept arbitrary identifiers; list/form/report display values use shared resolution.
- Added offline product gates: `npm run product:check` and `npm run product:backend`.
- This is a release candidate. Production sign-off still requires frozen install, full monorepo build and live Frappe acceptance on the deployment site.

## Unreleased — Visual Directions review import

- Alumdoor `2.0.1`: Phiếu nhập mua hiển thị Cao, Rộng, Số cái/bộ, Tổng kg và tự tính TL thực `kg/m² = kg ÷ (cao × rộng × số cái/bộ)` cho cửa/tấm; giữ riêng `kg/m` cho nhôm cây và xác minh lại công thức ở server.
- Alumdoor `1.18.2`: dọn 43 khách thử, 22 NCC thử, 9 bảng giá đại lý giả và 2 phiếu thu nháp không có bút toán; xoá cả chỉ mục tìm kiếm mồ côi.
- Alumdoor: vật chất hoá 6 bộ quy cách tồn, 6 mã màu từ lịch sử tồn nhôm, 8 thương hiệu xuất hiện trực tiếp trong danh mục và 15 quy cách lá có đủ độ dày/bản lá; liên kết lại 55 mặt hàng theo hãng và 15 mặt hàng theo quy cách.
- Warehouse master screens now render the existing lazy tree view correctly; expand/add/rename/delete controls no longer bubble into record navigation.
- Nới riêng trường `Datetime` để không cắt phần phút/nút lịch trên Chromium Windows.
- Link picker bỏ filter phụ thuộc còn rỗng; backend luôn tìm theo `title_field` ngoài mã bản ghi.
- Imported the Claude Design review handoff under `docs/design/visual-directions-review/` for traceability.
- Mapped Run2–Run6 into the shared production design layer instead of copying prototype HTML.
- Added semantic visual hooks and elevations for shell, login, awesomebar, list, form, split/context, workspace, report, kanban, calendar, gantt, tree, dashboard, print and builders.
- Behaviour, metadata, permission, routing and adapter contracts are unchanged; generated apps inherit the new styling through `@metaforge/ui/styles.css`.

## v0.6.0 — 2026-07-24 — App-mode (touch-first mobile/tablet) — MetaForge ≠ chỉ Desk 1:1

MetaForge thêm **App-mode**: màn nghiệp vụ đóng gói tay (touch-first, mobile/tablet) BÊN CẠNH Desk-mode (auto-sinh List/Form). Chứng minh MetaForge vượt "bản sao Frappe Desk" → nền dựng trải nghiệm riêng (POS, kho nhận/xuất) mà vẫn 1 engine. Verified phone (iPhone 12) + tablet (iPad) trên deploy công khai `/wms/x/receive`.
- **Khung engine** (`packages/shell/src/app-mode/`): `MobileShell` (header dính + nội dung cuộn + action bar đáy safe-area; phone full-width, tablet canh giữa) · touch primitives `TouchCard`/`BigButton`/`QtyStepper`/`ScanField` · `createExperienceRegistry`/`Experience`. Theme/brand-aware qua token @metaforge/ui.
- **Adapter** `callGet`/`callPost` — gọi whitelisted-method generic (cho App-mode dùng API nghiệp vụ tuỳ app).
- **Màn demo** `apps/demo/src/experiences/ReceiveExperience.tsx` — **Kho: Nhận / Giao hàng** touch-first: danh sách phiếu (thẻ to + status), chạm → dòng hàng + QtyStepper SL nhận, nút **GIAO/NHẬN** to đáy → gọi **`aphvh.api.wms.transfer_issue/transfer_receive` THẬT** (ép người nhận≠giao, tạo Stock Entry, tự phiếu chênh lệch nếu thiếu). Route `/x/receive` (KHÔNG DemoShell — MobileShell toàn màn; tự mount Toaster).
- **Seed state** (`scripts/seed_wms_{flow,types,stock}.py`): Allow Negative Stock + Stock Entry Type (Material Transfer/Receipt/Issue — site không setup-wizard nên thiếu) + tồn kho mở đầu (valuation) + role Stock Manager/User cho user demo + 2 In Transit (Admin giao)/2 Draft.
- **Verify Playwright phone+tablet**: NHẬN 200 (SE thật, status Received, toast ✅) · GIAO 200 ("hàng đang ở Transit", toast ✅). Ảnh `screenshots/wms-app-{list,receive,issue,after}-phone` + `wms-app-list-tablet`. tsc0·lint0·build0.
- **Bug thật (deploy lộ)**: SL nhận mặc định `qty_received ?? qty_issued` — qty_received=0 (không null) → `0 ?? x`=0 → Stock Entry rỗng → MandatoryError; fix default = qty_issued. `<Toaster/>` chỉ ở DemoShell → app-mode câm toast → mount ở route app-mode.

## v0.5.0 — 2026-07-24 — Deploy CÔNG KHAI + module kho APHVH WMS (real business module)

Deploy MetaForge công khai lên VPS 222, render module nghiệp vụ THẬT **APHVH WMS** (kho) — chứng minh engine meta-driven vượt doctype ToDo đơn giản sang module đa-doctype phức tạp (child table + nhiều Link + section). Chi tiết: `docs/DEPLOY-WMS.md`.
- **URL công khai** http://222.255.238.178/wms/ · login demo `wms.demo@aphvh.local`. Backend = site cô lập `metaforge.localhost` (+ erpnext + aphvh WMS, cài site-level — KHÔNG đụng site khách `frontend`). Phục vụ qua path `/wms` nginx site khách (block additive TRƯỚC `location /`, header site metaforge).
- **FE public session-auth** (không token): adapter base + router `basename` + login redirect lấy từ `import.meta.env.BASE_URL` (build `--base=/wms/`); `globalThis.csrf_token = boot.csrf_token` cho write; guest boot → redirect `/login`. NAV thêm nhóm **Kho (WMS)** (Chuyển kho/Chênh lệch/Giữ lô/Loại kho), landing = Warehouse Transfer. Sửa: `apps/demo/src/LiveApp.tsx`, `system/Login.tsx`.
- **Seed multi-company** (`scripts/seed_wms.py`): 5 Company (group + APH/VH/HKD01/HKD02) · 41 Warehouse · 6 Kind · Warehouse Type Transit · 3 Item · 7 Reason · 2 Warehouse Transfer mẫu.
- **Verify Playwright CÔNG KHAI**: guest→login · login→boot→CSRF · List Warehouse Transfer metadata-driven · **split 3 cột** (form + child *Dòng hàng* + context) · **WRITE CSRF** (comment→timeline). Site khách `frontend` `pong`+`/login 200` xuyên suốt. Ảnh `screenshots/wms-{list,split,split,write}.png`. tsc0·lint0·build0.
- **Chặn Frappe gặp** (deploy thật lộ): Company mandatory `valuation_method`; ERPNext `create_default_warehouses` cần Warehouse Type "Transit" (site không setup-wizard); MSYS mangle `--base=/wms/` (build qua PowerShell). Caveat: nginx block ephemeral khi recreate container (re-apply `scripts/nginx_patch.py`); cookie `sid` cùng host (dùng incognito); user demo = System Manager (fail-closed multi-company Pha sau).

## v0.4.1 — 2026-07-24 — Data Import wizard đầy đủ (live-verified)

Nâng màn **Nhập dữ liệu** (M08) từ `Wired` (mới tải mẫu) → **`Done`** — wizard đủ luồng Frappe Data Import Tool, verify trên Frappe THẬT (`docs/pha2-coverage.md`). **Live E2E 17/17.**
- `apps/demo/src/system/Import.tsx` viết lại thành 3 bước: **Cấu hình** (DocType · kiểu Insert/Update · tải mẫu) → **Tải lên** (`createDoc("Data Import")` + `uploadFile(import_file)`) → **Xem trước** (`get_preview_from_template` thật: badge ánh xạ header→field, cột bỏ qua gạch ngang, 6 hàng đầu, cảnh báo) → **Kết quả** (`form_start_import` enqueue + poll `get_import_status` → thành công/thất bại/tổng · tải bản ghi lỗi).
- Adapter: DTO **`ImportPreview`** (thay `preview(): Promise<unknown>`), giữ nguyên `import.{downloadTemplate,preview,start,status,erroredTemplate}` + `createDoc` + `uploadFile`.
- **2 chặn Frappe THẬT do live E2E lộ** (mock không thấy): ToDo `allow_import=0` → seed Property Setter `allow_import=1`; scheduler tắt cho site cô lập → `enable-scheduler` (guard "Scheduler inactive" của Data Import). Cả 2 xử lý ở site cô lập (seed).
- Verify: tsc0 · lint0 · build0 · **live E2E 17/17** (thêm `live.spec:import` — import 2 ToDo thật, cleanup net-zero) · screenshot `live-import-preview` + `live-import-result`.

## v0.4.0 — 2026-07-24 — Design import (3 brand switchable)

Import diện mạo từ Claude Design project "MetaForge prototype tương tác" (`docs/design-import.md`).
- **3 visual direction** làm brand switchable: **Zinc** (mặc định) · **Electric Blue** (#1B4DFF) · **Warm Terracotta** (#b15b2e), mỗi cái × light/dark = 6 bộ token.
- `packages/ui/src/styles.css` viết lại: token HEX + `data-brand` + `@theme inline: var()` (bỏ hsl); font **Geist/Geist Mono**; radius 0.625rem.
- `packages/shell/src/brand.ts` (`useBrand`/`applyBrand`/`BRANDS`); apply lúc khởi động (main.tsx); switcher ở **Thiết lập → Giao diện → Thương hiệu** (swatch màu).
- Re-skin TOÀN app chỉ bằng remap token (list/form/split/context/builders/system/badge/button). Verify: tsc0 · lint0 · build0 · 6 screenshot (3 brand × light/dark) + Settings switcher live.

## v0.3.0 — 2026-07-24 — Pha 2 (P1–P8, live-verified)

Quản theo **requirement coverage** (`docs/pha2-coverage.md`), verify trên Frappe THẬT (metaforge.localhost) — **live E2E 16/16**. Dùng subagent song song cho phần live + luôn tự verify độc lập.
- **P1 CRUD/workflow/comment/conflict live**: create+read+update+delete · addComment · 417 conflict 2-tab · workflow get_transitions/apply_workflow (seed Workflow ToDo Approval). `NewFormContainer`. 5 bug thật do live E2E lộ (boot SAVEPOINT dedupe · perms optimistic `{'null':0}` · **Toaster chưa mount** · save toast · Due Date flaky).
- **P2 pickers live**: assign (combobox user → assign_to.add/remove) · tag (inline → add_tag/remove_tag) · attach (FileButton, wired). ContextPanel redesign.
- **P3 5 màn hệ thống**: Workspace (getWorkspaces/getWorkspace) · Permission Manager (perm.rolesAndDoctypes/get) · Settings · Import (downloadTemplate) · Login. Bug: v16 get_desktop_page trả `{items:[]}`.
- **P4 Notifications** (bell dropdown + list + markAllRead) · **P6 virtualize** ListView (@tanstack/react-virtual >50) · **P7 AI** (createOpenAICompatProvider endpoint thật + echo, config Settings) · **P8 Share/Connections** (adapter + ContextPanel) · **P5 a11y** (e2e spec) + **i18n** (VI/EN switch + shell useT).
- Deferred: attach upload E2E · perm.update · import wizard đầy đủ · submit/cancel/amend (cần doctype submittable) · AI endpoint LLM thật (user cấp key).

## v0.2.0 — 2026-07-24 — Sprint "Product Shell + Detail Layout"

Mở lại sau review độc lập (bản v0.1.0 = *dev-harness*: chứng minh component render, chưa phải sản phẩm). Nguyên tắc: **UI chỉ Done khi có SCREENSHOT + E2E — không báo bằng số test.**

### Design system (MỚI)
- `@metaforge/ui`: 22 shadcn/ui primitive (Radix) + Tailwind **v4** (`@tailwindcss/vite`, tokens + `@custom-variant dark` + `@source` quét toàn kit) + `cn` + `FileButton` (bọc `<input type=file>`). CSS build ~30KB thật.

### Shell (M00/M03)
- **AppShell** sản phẩm: sidebar nhóm/collapse + **drawer mobile** (<768), topbar breadcrumb/Awesomebar/AI/bell/theme/avatar. Dùng CHUNG mock & LiveApp (qua `DemoShell`).
- **Awesomebar** cmdk thật: Ctrl+K & `/`, debounce + AbortController + chống-stale.
- react-router-dom (route `/view/:key`, `/app/:dt/:name`). AI shell placeholder ("chưa cấu hình").

### List data-table (M04)
- Server-side: search→`orFilters` LIKE, standard-filter (`in_standard_filter`), column-picker (localStorage), checkbox+STT+status-badge+số-phải+ngày, bulk bar, Σ summary, pagination "X–Y/Z".
- **URL-state** q/filter/sort/page/selected (`useListUrlState` + bridge injectable — views KHÔNG cứng router).

### Detail 3 cột (M11)
- **SplitView** resizable+`autoSaveId` (≥1280) / list+detail+context-Sheet (768) / stack+drawer (390), Esc order, **click-row mở split KHÔNG chuyển màn**.
- FormView re-skin (header+tabs sticky). **FormActionBar + WorkflowActionBar** metadata/server-driven (`resolveFormActions`: docstatus+is_submittable+perms+workflow).
- **ContextPanel** (Timeline/comment/assign/attach/tags) + `ContextContainer` (docinfo→timeline + comment mutation thật). Tab **AI**.

### Adapter (+5 method, verify 16.x)
- `getTransitions` · `assignRemove` · `addTag`/`removeTag` · `globalSearch`. DTO `WorkflowTransition`, `GlobalSearchResult`.

### Re-skin toàn bộ → lint no-native-UI = 0 (GATE CỨNG)
- Controls/media (Input/Select-Radix/Combobox-cmdk/Checkbox/FileButton) + 7 view (Kanban/Tree/Report/Calendar/Dashboard/ChildGrid/table-controls) + 4 builder + BuilderRoutes.
- `scripts/check-native-ui.mjs`: vá regex bắt element multi-line (`\b`) → TRUE 120→**0**; **exit 1 nếu >0**.

### Verify (không test-count)
- **Playwright E2E 8/8** (`apps/demo/e2e/{list,split}.spec.ts`, webServer mock :8099). ~16 screenshot (`screenshots/`). tsc-b 0 · selfcheck 45/45 (List/Form/Workflow = test LOGIC) · vite build 2684 modules exit 0.

### Chưa làm (Pha 2 — xem `docs/pha2-coverage.md`)
Live Frappe E2E · assign/attach/tag picker UI · Login/Workspace/Import/PermMgr/Settings · Notifications · a11y+i18n · virtualization · AI endpoint thật · Share/Connections.

## v0.1.0 — 2026-07-23

Bản đầu MetaForge — engine React meta-driven copy 1:1 Frappe/ERPNext Desk trên Frappe v16 headless.

### Engine
- `@metaforge/core`: 43 fieldtype (verified `docfield.json` 16.29.0) + `mapError` §0 (417 `TimestampMismatchError`→conflict) + **MetaResolver** (6 field-state, depends_on/mandatory/read_only, permlevel, docstatus).
- `@metaforge/adapter-frappe`: `FrappeAdapter` contract đầy đủ (api-map verified) + `FrappeAdapterImpl` (frappe-js-sdk, token/headers) + 5 orch Python.

### UI
- `@metaforge/controls`: 36/43 = 100% field-value control (media + child grid).
- `@metaforge/views`: 9 view (List/Form/Kanban/Tree/Report/Print/Dashboard/Calendar/Gantt) + container (Provider/FormContainer/ListContainer).
- `@metaforge/builder`: BuilderKernel + 4 builder (DocType/Workflow/Print/Dashboard) kéo-thả.
- `@metaforge/shell`: AppShell + CommandPalette + theme.

### Stack (đúng RULES)
- TanStack Table+Query · RHF+Zod · Recharts · dnd-kit · React Flow · react-grid-layout (v1.4.4). Lazy code-split builder.

### Verify (live, Frappe 16.28.0)
- `selfcheck` 46/46 (logic + 30 render thật). Adapter E2E (curl + TS thật). 417 optimistic-lock. Phân quyền server 3 tầng (403 + field permlevel masking).

### Fix contract (verified source)
- review#4 (7): Import raw status · perm `doctype_ptype_map` · getdoctype bỏ cached_timestamp · add_node→null · session/backup nghiệp vụ · api-map↔adapter 1:1 · Kanban `update_order_for_single_card`.
- runtime (6): print `get_html_and_style` · `get_workspaces`.pages · boot `get_fullname`+workspaces.pages · logout `force=True` · download_template export_* · get_desktop_page ref.
- hotfix P0 (4): permission write-perm chặt · depends_on array-truthiness+fn: · layout no-empty-tab · form reset/dirty/required/docname/DynamicLink/Datetime.

### Deferred
- UI verify 4 luật trọng yếu (browser) · serve SPA publicly (nginx route) · server-side filter/sort/paginate · AI gợi ý · realtime · PWA offline write-queue (P2).
