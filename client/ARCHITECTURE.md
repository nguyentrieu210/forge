# ARCHITECTURE — MetaForge

> Mô tả hệ ĐÃ CHẠY THẬT (verify live, xem TEST_REPORT). Không phải thiết kế dự kiến.

MetaForge là bộ engine React **meta-driven** phủ Frappe/ERPNext Desk trên **headless Frappe v16**: UI 100% suy từ metadata DocType (không hard-code nghiệp vụ). Cùng một canonical model phục vụ **runtime** (render form/list) lẫn **Builder** (chỉnh sửa DocType) lẫn **app factory** (sinh app).

## Đồ thị package (phụ thuộc 1 chiều)
```
@metaforge/core        types (DocTypeMeta/DocField/DocPerm) · resolveMeta · safe-eval · normalize ·
                       serialize · link-query · fetch-from · i18n (translate/format) · security (sanitize/url) ·
                       app/manifest                                   ← THUẦN, không React
   ↑            ↑
@metaforge/adapter-frappe   FrappeAdapter: NƠI DUY NHẤT chạm API Frappe (getMeta/getDoc/getList/updateDoc/
                            searchLink/getCapabilities/get_boot…). Trả canonical qua normalizeMeta.
@metaforge/ui          shadcn/Radix + Tailwind v4 tokens (design system). Không logic.
@metaforge/controls    fieldtype → control (registry). Tiêm FieldServices (searchLink/uploadFile/fetchValue).
   ↑
@metaforge/views       runtime renderer: FormView · ListView · SplitView · ContextPanel · container/*
                       (MetaForgeProvider · hooks TanStack Query · DoctypeWorkspace) · useLocaleFormat
   ↑
@metaforge/shell       AppShell · CommandPalette · brand/theme · i18n chrome · AIPanel ·
                       auth (AuthBoundary/LoginForm — Guest/401 detect, CSRF, session-expiry mid-use)
@metaforge/builder     BuilderKernel (draft+history) · DocTypeBuilder · diffMeta/metaEqual (GỒM
                       diffPermissions — role+permlevel+if_owner) · validateDraft ·
                       serializeDocTypeForSave (Gate 6, permissions canonical hoá GIỐNG fields)
   ↑
apps/* (demo, sample-wms, sample-sales)   TIÊU THỤ qua dist. app = manifest + mount runtime.
create-metaforge-app   CLI sinh app mỏng.
```
**Ranh giới (verify)**: không package nào import `apps/*`, `/dist/`, hay `@metaforge/*/src` (grep = 0). Cross-package chỉ qua public entry. Build = `tsc -b` project references; mỗi package xuất `dist/index.{js,d.ts}` (7/7).

## Luồng dữ liệu runtime
0. **AuthBoundary** (`@metaforge/shell/auth`, bọc NGOÀI CÙNG mọi app): gọi `adapter.getBoot()` dedupe
   theo adapter instance; Guest/401 (hoặc phiên hết hạn GIỮA lúc dùng, qua `adapter.onSessionExpired`)
   → render `LoginForm` (cookie-session, không token/bí mật ở trình duyệt); thành công → cài CSRF
   (`adapter.setCsrfToken`) rồi mới render cây provider bên dưới.
1. **Adapter** = biên API duy nhất. `getMeta` → `normalizeMeta(raw)` → **canonical DocTypeMeta** (validate + tag `_compat`, giữ mọi extension key). Renderer/Builder KHÔNG chạm API trực tiếp.
2. **MetaForgeProvider** (views/container/provider): cấp adapter + registry + roles + `scopeKey =
   createScopeKey(boot)` (**site_name**+user+lang+**frappe_version** THẬT từ `get_boot()` — prefix MỌI
   queryKey, tách cache khi đổi site/user/lang/version, không rò giữa 2 site chung trình duyệt) +
   `fmt` (LocaleContext từ `mergeLocale(boot.sysdefaults, manifest.locale)`).
3. **DoctypeWorkspace** (views/app): điều phối GENERIC `SplitView(list | form | context)` theo `doctype`+`name`. Dùng chung demo + app sinh ra.
4. **FormView** (runtime renderer): `resolveMeta(meta, {doc, roles, maskedFields, forceReadOnly})` →
   trạng thái từng field (hidden/masked/locked/editable) → group layout → control từ registry.
   `forceReadOnly` = `!caps.write`/`!caps.create` (effective capabilities server, KHÔNG chỉ role/
   permlevel tĩnh) — field/Table con tự khoá theo quyền THẬT, không chỉ ẩn nút hành động. State =
   React Hook Form; validate required = Zod. **Builder preview dùng CHÍNH FormView** (không renderer riêng).
5. **Ghi**: create → `serializeCreateDocument` (full authorable doc); edit → `serializeUpdatePatch` (chỉ field đổi + `modified` OCC → 417 conflict).
6. **Workflow**: `hasWorkflow` (server-authoritative, `metaforge.api.get_workflow_transitions`) tách
   bạch "không có workflow" khỏi "có workflow nhưng hết transition" — KHÔNG suy từ độ dài mảng transitions.

## Cache (TanStack Query)
Mọi queryKey prefix `scopeKey` (`createScopeKey(boot)` — site+user+lang+version); mọi `invalidateQueries` PHẢI gồm `scopeKey` (nếu thiếu → không khớp → không refetch). Đã sửa hồi quy này ở ContextContainer/WorkspaceContainer (review fix H2/M1).

## App factory
`AppManifest` (core/app/manifest) = khai báo app bằng DỮ LIỆU (id/brand/home/nav/locale). `nav.kind`
(doctype/route/workspace/system) map qua `resolveNavPath` — route/workspace/system có `<Route>` THẬT,
KHÔNG rơi vào catch-all (P1-MANIFEST-01). `create-metaforge-app` sinh app mỏng: `app-manifest.ts` +
`main.tsx` (AuthBoundary → MetaForgeProvider → AppShell + DoctypeWorkspace + route mọi kind) + deps
`@metaforge/*` (`workspace:*` trong monorepo, hoặc `--version` tường minh ngoài monorepo — CLI từ chối
mặc định `workspace:*` khi không phát hiện được monorepo, P2-CLI-01) (dist). **Không copy engine
source**. Scaffold transactional (thư mục tạm → đổi tên khi ghi xong, không để lại nửa-vời) + `--force`
bắt buộc cho đích không rỗng. Verify live: 2 app (wms/sales) boot/list/edit-save/auth-cookie-session/
workflow/mọi nav-kind thật — xem TEST_REPORT.md Phase 0–6.

## Xem thêm
METADATA_SCHEMA · PERMISSION_MODEL · SECURITY_MODEL · I18N_MODEL · APP_MANIFEST · BUILDER_ROUNDTRIP · FIELD_TYPE_COMPATIBILITY · API_CONTRACT_MATRIX · KNOWN_GAPS · TEST_REPORT.
