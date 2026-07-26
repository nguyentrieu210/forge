# APP_MANIFEST — MetaForge app factory

> Nguồn: `@metaforge/core/app/manifest.ts` · `@metaforge/shell/auth` · `create-metaforge-app` ·
> `apps/*/app-manifest.ts` + `main.tsx`.

App MetaForge được khai báo bằng **DỮ LIỆU** (manifest), suy từ nhu cầu runtime (nav/home/brand/locale).
Engine dựng shell/nav/home/auth từ manifest ⇒ **KHÔNG hard-code** HOME_DOCTYPE/NAV (P1-01 khép).
Manifest **serializable** (icon = tên chuỗi, app map sang component).

## Schema (`AppManifest`)
```ts
AppManifest {
  id: string          // kebab (máy): /^[a-z][a-z0-9-]*$/
  name: string        // hiển thị
  version?: string
  brand?: "zinc" | "blue" | "warm"
  locale?: { numberFormat?; currency?; dateFormat? }   // override TỪNG field; field không set giữ boot.sysdefaults
  home: { doctype?; route? }                            // trang đích gốc app
  nav: AppNavItem[]
}
AppNavItem { key; label; icon?; group?; kind?: "doctype"|"route"|"workspace"|"system"|"experience"; route? }
```

## API (thuần, test — `packages/core/src/app/manifest.ts`)
- `validateManifest(m)` → `{ ok, issues }`. **Error** (chặn): id sai kebab · thiếu name · brand lạ ·
  home không doctype/route · nav rỗng · nav key trùng/thiếu label · kind lạ · kind=route thiếu route ·
  **`home.route` không khớp route/workspace/system/experience nào trong nav** (P1-MANIFEST-01 — mismatch
  này gây redirect loop thật ở runtime, xem §2) · **`route` tương đối** (thiếu `/` đầu — resolve SAI
  trong React Router, review độc lập) · **2 nav item cùng resolve 1 path** (`resolveNavPath` trùng —
  React Router chỉ khớp `<Route>` ĐẦU TIÊN, item còn lại không bao giờ tới được, review độc lập).
  **Warning** (không chặn): `home.doctype` không có trong nav.
- `resolveHomeRoute(m)` → path đích: `home.route` → `/app/${home.doctype}` → nav doctype đầu.
- `navGroups(m)` → gom nav theo `group`, GIỮ thứ tự xuất hiện.
- **`resolveNavPath(navItem, paths?)`** (P1-MANIFEST-01, mới) — đích điều hướng THẬT theo `kind`:
  `doctype`→`${doctypeBase}/${key}` · `route`→chính `route` khai báo · `workspace`→`workspacePath`
  (mặc định `/workspace`) · `system`→`/${key không tiền tố "__"}` · **`experience`→`${experienceBase}/
  ${key}`** (mặc định `/x`, review độc lập — Experience plugin system, xem §5). Trả `null` cho kind
  KHÔNG NHẬN RA hoặc `route` thiếu — caller PHẢI xử lý tường minh, **KHÔNG được ngầm coi là doctype**
  (đây chính là bug review bắt được: runtime cũ gửi MỌI nav item tới `/app/<key>` bất kể kind thật).
- **`mergeLocale(bootSysdefaults, manifestOverride)`** (mới) — override TỪNG FIELD (không thay nguyên
  cục): ép `currency` không làm mất `dateFormat`/`numberFormat` của boot.

## 2) App tiêu thụ manifest (`main.tsx` mỏng — CLI sinh + `apps/demo` cùng dùng)
```
AuthBoundary(adapter)                          — @metaforge/shell (§3), Guest/401 detect trước boot
  → loading | guest(LoginForm) | error
  → boot: MetaForgeProvider{ roles, scopeKey=createScopeKey(boot), locale=mergeLocale(boot.sysdefaults, manifest.locale) }
    → AppShell{ nav = manifest.nav.map(icon resolve), onLogout }
      → validateManifest(APP_MANIFEST) chạy lúc module load — sai cấu trúc → throw rõ, KHÔNG chạy tiếp
      → Routes:
          "/"                          → Navigate resolveHomeRoute(manifest)
          "/app/:doctype[/:name]"      → DoctypeWorkspace (kind=doctype)
          "/workspace"                 → WorkspaceContainer THẬT (chỉ đăng ký nếu có nav kind=workspace)
          resolveNavPath(item) mỗi item kind=route|system → <Route> THẬT (placeholder "chưa triển khai"
                                          nếu app chưa cấp component riêng — route LUÔN tồn tại, không
                                          bao giờ rơi vào catch-all "*" gây redirect loop)
          "*"                          → Navigate resolveHomeRoute(manifest)
```
Icon: `resolveIcon(name)` (`@metaforge/shell`, review độc lập) — tra ĐỘNG toàn bộ bộ icon `lucide-react`
theo tên kebab-case (`"arrow-left-right"` → `ArrowLeftRight`), KHÔNG map tay danh sách cố định (trước
đây CLI template chỉ map 2 icon `"layout-grid"/"settings"` — icon khác app chọn MẤT ÂM THẦM, cùng gap ở
`apps/demo` với map tay 12 icon). Bridge URL-state = ~12 dòng `useSearchParams` (routing glue cấp app;
giữ `@metaforge/views` router-agnostic).

**Trước fix (P1-MANIFEST-01, review độc lập)**: `main.tsx` chỉ map `key/label/group` (bỏ icon), gửi
MỌI nav click tới `/app/<key>` bất kể `kind` (route/workspace/system bị coi NGẦM là DocType → 404/mis-
route), và `manifest.locale` bị bỏ qua hoàn toàn (chỉ dùng `boot.sysdefaults`). `apps/demo` đã tự sửa
lấy (logic riêng, KHÔNG chia sẻ) trước khi lỗi này bị review bắt — cùng pattern trôi dạt (drift) như
P1-AUTH-01. Đã hợp nhất về 1 chỗ (`resolveNavPath`/`mergeLocale`, `@metaforge/core`), `apps/demo` VÀ
template CLI dùng CHUNG, không còn 2 bản logic riêng.

## 3) Auth (P1-AUTH-01, review độc lập — xem SECURITY_MODEL.md + `@metaforge/shell/auth`)
`AuthBoundary` + `LoginForm` (mới) — app sinh ra trước đây KHÔNG có auth boundary thật: `getBoot()` fail
→ hiện lỗi thô, không phát hiện Guest/401, không login form, không CSRF, không đăng xuất. Nay:
- `AuthBoundary(adapter)`: dedupe boot theo adapter instance, phân loại lỗi qua `adapter.mapError` →
  guest (auth/permission) hoặc error (khác), cài CSRF từ `boot.csrf_token` tự động
  (`adapter.setCsrfToken`), expose `logout()` cho `AppShell.onLogout`.
- `adapter.onSessionExpired(cb)`: interceptor axios trên adapter — BẤT KỲ call nào (không chỉ boot ban
  đầu) trả lỗi kind "auth" (401/AuthenticationError/SessionExpired — GỒM CẢ trường hợp Frappe trả
  `PermissionError`/403 kèm message "Login to access" khi Guest gọi method cần login, xác nhận LIVE) →
  tự đưa UI về guest NGAY, không cần reload trang.
- `LoginForm`: `adapter.login()` → cookie session THẬT (KHÔNG token/bí mật ở trình duyệt).
- Live-verify: `TEST_REPORT.md` Phase 1 — cookie-session thật, user hạn chế (KHÔNG Administrator),
  9/9 PASS (guest/login/edit/forbidden/logout/session-expiry).
- **Pre-auth i18n** (review độc lập, vòng 2): `LoginForm`/`LoginScreen` render TRƯỚC boot (chưa có
  session, chưa biết `boot.sysdefaults`) — trước đây HARD-CODE tiếng Việt dù `I18nProvider` (đọc
  locale từ `localStorage`, KHÔNG cần network) đã bọc ngoài, nên app tiếng Anh vẫn mở đầu bằng màn
  login tiếng Việt. Nay `LoginForm`/`LoginScreen` gọi `useT()` (key `auth.*`, `@metaforge/shell/i18n`)
  — tôn trọng lựa chọn ngôn ngữ đã lưu TRƯỚC lúc boot. **Giới hạn còn lại** (ghi trung thực): CLI sinh
  app CHƯA tự mount `I18nProvider` (thin scaffold, chỉ `apps/demo` có sẵn) — `useT()` fallback an toàn
  về tiếng Việt khi KHÔNG có Provider (không lỗi, không regressions), nhưng chưa tự hỗ trợ đổi ngôn ngữ
  cho tới khi app tự thêm `I18nProvider`.

## 4) create-metaforge-app (CLI, hardening P2-CLI-01 + external package strategy)
```
create-metaforge-app <id> [--name] [--home <Doctype>] [--dir]
                      [--force] [--source workspace|external|local]
                      [--version <range>] [--metaforge-root <path>]
```
- **Validate manifest bằng chính `validateManifest`** trước khi sinh (không sinh app cấu hình sai).
- `renderTemplates(opts)` (thuần) → 9 file: package.json (deps `@metaforge/*`), tsconfig, vite.config
  (+@tailwindcss/vite), index.html, `src/styles.css` (@source quét dist engine để compile utility
  class), `src/app-manifest.ts`, `src/main.tsx`, .gitignore, README.
- **KHÔNG copy engine source** — app import chỉ `@metaforge/*` (dist).
- **`scaffold()` transactional** — ghi vào thư mục tạm cạnh đích trước, chỉ thay thế đích (xoá cũ +
  đổi tên tạm) SAU KHI ghi xong toàn bộ không lỗi. Lỗi giữa chừng → dọn thư mục tạm, đích giữ nguyên.
- **`--force` bắt buộc** nếu đích không rỗng (từ chối mặc định — trước đây ghi đè âm thầm).
- **`--source workspace`**: mặc định tự phát hiện nếu tìm thấy `pnpm-workspace.yaml` ở thư mục cha của
  đích (trong monorepo này) → `@metaforge/* = workspace:*`.
- **`--source external --version "<semver>"`**: cho registry THẬT có `@metaforge/*` (chưa publish —
  xem `KNOWN_GAPS.md`). Scaffold được nhưng KHÔNG install được cho tới khi có registry.
- **`--source local --metaforge-root "<path>"`** (mới — review độc lập, external-package-strategy):
  install được THẬT ngoài monorepo mà KHÔNG cần registry. **KHÔNG dùng `file:<thư mục package>` trực
  tiếp** — mỗi `@metaforge/*` tự khai `workspace:*` cho NHAU trong package.json riêng, pnpm cố resolve
  cái đó khi cài qua `file:` ngoài 1 workspace pnpm thật → `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` (xác nhận
  LIVE — đây chính là lý do `--source external` "scaffold được nhưng không install được"). Fix:
  `pnpm pack` từng package (tự REWRITE `workspace:*` → version thật, hành vi chuẩn pnpm cho publish) →
  tarball `.tgz` độc lập; app sinh ra khai `file:<tarball>` cho dep TRỰC TIẾP **+ `pnpm.overrides`**
  cùng map (dep TRUNG GIAN giữa các `@metaforge/*` package cũng phải trỏ tarball, không thì pnpm lại cố
  fetch version thật từ npm registry → 404). Live-verify: sinh app vào thư mục NGOÀI repo hoàn toàn →
  `pnpm install` (222 package, exit 0) → `pnpm run typecheck` (exit 0) → `pnpm run build` (vite build
  thật, exit 0) — KHÔNG cần registry, KHÔNG cần workspace pnpm nào.
- Không phát hiện monorepo VÀ không chỉ định `--source` → CLI từ chối, liệt kê cả 3 lựa chọn (trước đây
  LUÔN mặc định `workspace:*` dù ngoài monorepo, sinh ra app KHÔNG BAO GIỜ install được ở đó).
- Regenerate app đã tồn tại (`--force`) sẽ **xoá `node_modules` cùng lúc** với các file cũ (scaffold
  chỉ sở hữu source file, không quản node_modules) — cần `pnpm install` lại sau, đúng như bước "Bước
  tiếp" CLI tự in ra.

## 5) Experience plugin system (App-mode, review độc lập — nay đã nối vào runtime)
`createExperienceRegistry`/`Experience`/`ExperienceRoute` (`@metaforge/shell/app-mode`) tồn tại từ
CHANGELOG v0.6.0 nhưng KHÔNG runtime nào dùng — `apps/demo/src/LiveApp.tsx` hard-code thẳng
`<Route path="/x/receive" element={<ReceiveRoute/>}>`, app-manifest.ts khai nav item đó `kind:"route"`
(không phải `"experience"`), CLI sinh app không biết gì về Experience. Nay:
- `AppNavItem.kind` thêm `"experience"` — `resolveNavPath` map `${experienceBase}/${key}` (mặc định
  `/x`, khớp `Experience.key` registry).
- **`ExperienceRoute`** (`@metaforge/shell/app-mode`, mới) — cầu route→registry, ROUTER-AGNOSTIC (nhận
  `activeKey` thẳng, giống `@metaforge/views`): `registry.get(activeKey)?.render()`, `renderNotFound`
  khi key chưa đăng ký (KHÔNG throw/crash).
- `apps/demo`: `experienceRegistry` đăng ký `{key:"receive", render: () => <ReceiveRoute/>}`,
  app-manifest.ts nav item đổi `kind:"experience"` (key `"receive"`, trước là `"__receive_app"`
  `kind:"route"` trỏ tay `/x/receive`), Routes dùng `<Route path="/x/:key" element={<ExperienceScreen/>}>`
  generic thay vì `/x/receive` hard-code.
- `create-metaforge-app` template: `experienceRegistry` RỖNG mặc định (app mỏng không tự có Experience)
  + route `/x/:key` CHỈ đăng ký khi manifest có nav item `kind:"experience"` (giống điều kiện
  `workspace`) + `ExperienceNotRegisteredScreen` placeholder (giống `NotImplementedScreen`) khi key
  chưa đăng ký — app thêm Experience mới CHỈ cần sửa `experienceRegistry`, KHÔNG cần tự viết Routes.
- Live-verify: `app-mode-receive.spec.ts` (2/2 PASS) chạy lại nguyên vẹn qua route generic mới — hành
  vi `/x/receive` KHÔNG đổi, chỉ đổi CÁCH route tới đó (registry thay vì hard-code).

## Verify (live — `TEST_REPORT.md` Phase 0–6 cho chi tiết)
2 app sinh ra: **sample-wms** (home ToDo, manifest MỞ RỘNG route+workspace+system+icon+locale làm
fixture E2E cho ManifestAppRuntime parity) + **sample-sales** (home User, module khác) → install +
typecheck + build + **RUNTIME E2E live** (boot/manifest-nav mọi kind/locale/route/list/mở-doc/sửa-lưu-
reload/auth cookie-session/workflow). Generator **tổng quát** (2 manifest khác → cùng chạy, main.tsx
KHÔNG sửa tay).

## Runtime chung (`@metaforge/views/DoctypeWorkspace`)
Điều phối `SplitView(list | form | context)` theo doctype+name — dùng CHUNG demo + app sinh ra (không
lặp). App chỉ cấp doctype/name + onNavigate + bridge.
