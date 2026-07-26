# Known Gaps — MetaForge

> Ledger trung thực theo audit. Cập nhật mỗi gate/phase. "Đóng" = có test/live evidence + commit.
> **Gate numbering**: KHÔNG có "Gate 8" thay Gate 0–7. "Phase 0–6" (mục riêng cuối file) là 1 chương
> trình sửa lỗi ĐỘC LẬP trên nền Gate 0–7 đã đóng — vá review độc lập tìm thấy, không đổi số Gate. Xem
> [`TEST_REPORT.md`](TEST_REPORT.md) cho bằng chứng lệnh+exit-code+live evidence đầy đủ của Phase 0–6.

## P0 findings (10)
| ID | Nội dung | Trạng thái |
|---|---|---|
| P0-01 | Reproducibility (dist-exports, CI) | ✅ ĐÓNG (Gate 0, `173d2ac`) |
| P0-02 | global_search backend thiếu | ✅ ĐÓNG (live, `aa2582b`) |
| P0-03 | Create gửi dirty-only | ✅ ĐÓNG (serializeCreateDocument, `02a963b`) |
| P0-04 | Submit/workflow trên stale form | ✅ ĐÓNG (dirty-submit guard, `5a3bff7`) |
| P0-05 | Optimistic full-perm | ✅ ĐÓNG (capabilities fail-closed, `c2c93db`) |
| P0-06 | `new Function` | ✅ ĐÓNG (safe-eval allowlist, `96c2989`) |
| P0-07 | Print/report HTML injection | ✅ ĐÓNG (sandbox+sanitize, `fb0478b`) |
| P0-08 | Raw metadata cast | ✅ ĐÓNG (normalizeMeta, `72484c3`) |
| P0-09 | Link → text fallback | ✅ ĐÓNG (Link subsystem: filters/context/trang-đầu-gõ-thêm/race, `<gate3-p09>`). Fallback khi thiếu service/config sửa TRIỆT ĐỂ hơn ở Phase 5 (P1-LINK-01, xem cuối file) — trước đó vẫn còn free-text khi thiếu search/options. |
| P0-10 | Error mapping | ✅ ĐÓNG (mapError normalize, `250bf5a`) |

**10/10 P0 đóng.** ✅

## Gate status
- **Gate 0** ✅ ĐÓNG — repro/dist-exports/CI/BUILD_REPORT.
- **Gate 1** ✅ ĐÓNG — inventory/global_search/error-norm/cache-scope/capabilities/contract-tests.
- **Gate 2** ✅ ĐÓNG — safe-eval + canonical pipeline + fieldtype matrix.
- **Gate 3** ✅ ĐÓNG — P0-03 ✅ · P0-04 dirty-submit guard ✅ · P0-09 Link subsystem ✅ (filters/link_filters+eval ngữ cảnh/pagination/race-fix) · P1-06 child-table canonical resolver ✅ · P1-10 count-match ✅ (countQuery + reportview.get_count) · field-error→control ✅ · unsaved-nav guard ✅ · scopeKey-invalidation regression fix ✅. Verify: tsc0 · lint0 · selfcheck 55 nhóm · build dist 7 pkg + vite · e2e mock 13 passed · **live: reportview.get_count(or_filters) + search_link(filters/reference) VERIFIED 2026-07-24** (TEST_REPORT §C).
- **Gate 4** 🟢 GẦN ĐÓNG — **P1-12 i18n translator** ✅ · **P1-09 fetch_from** ✅ · **P1-16 locale format** ✅. **Section B** ✅: Duration+Rating → **PARTIAL** (không tuyên bố giả) · Duration **canonical seconds** (parse/format round-trip lossless) · **LocaleContext** DUY NHẤT từ boot.sysdefaults (`makeLocaleFormat` + `useLocaleFormat`, prop-driven memo theo localeKey ⇒ đổi user/site không stale) · gỡ constant cứng ở cells · nối List (Currency/Float/Int/Percent/Duration/Date) + Builder preview (chung provider). CÒN (ghi rõ, không giả supported): widget đầy đủ Code/JSON/HTML/Markdown/Text Editor + Duration d/h/m/s · catalog dịch server (chưa xây) · Datetime locale ở cells + format field read-only trong Form (follow-up, cùng dùng `useLocaleFormat`).
- **Gate 5** 🟡 PHẦN LỚN — new Function✅ · print sandbox✅ · sanitize✅ · **URL scheme validate** ✅ (sanitizeUrl/Image, malicious-payload suite) · **AI secret khỏi localStorage** ✅ (→ sessionStorage). CÒN: CSP header (deploy-level) · mở rộng malicious-payload suite (server_messages/exception injection).
- **Gate 6** 🟢 CORE ĐÓNG (DocType) — **canonical model dùng chung** (builder model = `DocTypeMeta`, preview = runtime `FormView`, không renderer riêng) · **diffMeta/metaEqual** tất định (6.1) · **validateDraft + draft/baseline session** validate-trước-apply fail-closed (6.2, đã gate nút Lưu) · **serializeDocTypeForSave** + **round-trip THUẦN** (6.3) · **LIVE round-trip trên DocType dùng-một-lần**: apply/reload/**conflict 417**/semantic-equality PASS + cleanup (6.4, TEST_REPORT §C2). CÒN (mở rộng): serializer Customize/Workflow/Print/Dashboard · UI diff-preview panel · Property Setter cho standard DocType (hiện test trên custom DocType).
- **Gate 7** ✅ ĐÓNG — **AppManifest** schema (7.1) · **demo driven by manifest**, bỏ hard-code (**P1-01**, 7.2) · **DoctypeWorkspace** runtime tái dùng (7.3a) · **create-metaforge-app CLI** + template mỏng (7.3b) · **app sinh ra install+typecheck+build** qua dist (7.4) · **RUNTIME E2E LIVE**: 2 app sinh ra (wms/sales) chạy thật với metaforge.localhost — boot/manifest/locale/route/**live list**/mở-doc/**sửa-lưu(PUT 200)-reload**/network-sạch, ALL PASS (TEST_REPORT §C3b, `e2e-factory`). CÒN (debt): permission fail-closed live (cần user hạn chế, đã unit+live-verify ở Gate 1) · CSS @import-order cosmetic.
- **Gate 8** — a11y/visual-regression/perf-budget/error-boundary/release.

## Phạm vi hoãn có chủ đích (đúng "không sa đà")
- Raw-DTO runtime validation MỞ RỘNG (mọi response, không chỉ meta) — làm dần theo endpoint khi cần.
- global_search global-mode phụ thuộc index `__global_search` (site chưa build → []). Scoped OK.
- submit/cancel/amend + permission-mutate: UNVERIFIED_LIVE (cần doctype submittable + fixture).
- `frappe.desk.reportview.get_count` (count-match có search): ✅ **VERIFIED LIVE** 2026-07-24 (search=14 vs total=815, xem TEST_REPORT §C).
- Link `search_link` + `filters` + `reference_doctype`: ✅ **VERIFIED LIVE** 2026-07-24 (Warehouse is_group=0 → 5 kho lá). `link_filters` metadata→filters là client-side, đã unit-test (`buildLinkFilters`); phần server nhận filters đã xác nhận.
- Translation catalog từ server: **CHƯA XÂY** (không phải unverified) — translator core thuần+test xong, catalog để tiêm; chưa nối endpoint nạp.
- **serializeCreateDocument workflow_state** → ✅ **SỬA** (`2c7c583`, TRƯỚC cả checkpoint review đầu
  tiên): `SYSTEM_FIELDS += workflow_state` (server-managed, không gửi khi create/patch). Phát hiện lúc
  runtime E2E. Ghi chú trung thực (review vòng 2 bắt được doc mâu thuẫn — dòng này đúng, nhưng Gate 7 +
  Phase 0–6 debt list dưới vẫn còn ghi "CHƯA sửa" tới tận checkpoint `453d322` — đã dọn ở cả 2 chỗ):
  **500 khi tạo ToDo VẪN còn thật sự tái hiện được** cho tới vòng sửa lỗi thứ 2 này, nhưng root cause
  **KHÁC HẲN** `workflow_state` — xem `NEWFORM-DEFAULT-MAGIC-01` cuối file.
- **Builder serializer mở rộng**: #1 Custom Field/Property Setter ✅ live · #2 Workflow ✅ live (+ `workflowMasters` insert-if-missing) · #3 Print ✅ live · **#4 Dashboard** pure+test, **live hoãn** (Dashboard Chart cần cấu hình nguồn/time-series đầy đủ). UI diff-preview panel = follow-up.
- **CSP header**: mẫu đề xuất đã ghi SECURITY_MODEL §7 (deploy-level, nginx/frontend). App không cần external host; đã loại `unsafe-eval` (safe-eval allowlist).

## Review findings (250bf5a..HEAD, độc lập) — trạng thái
- **H1** child-table read-only (Blocker) ✅ SỬA `6d93ec0` (assumeWritable inherit cha).
- **H2** context-panel stale sau mutation + **M1** cache leak workspace/shares (Must) ✅ SỬA `6d93ec0` (scopeKey đủ).
- **M2** safeEval thiếu unary-minus → depends_on âm sai (Must) ✅ SỬA `6d93ec0`.
- **M3** i18n/currency/date tested-but-unwired → Section B (LocaleContext).
- **L1** fetch_from re-dirty khi conflict-reload ✅ SỬA `6d93ec0`. **L2** link-filter silent-drop ✅ warn-once. **L3** get_count ✅ verified live (Section A). **L4** svg+xml ✅ bỏ khỏi image allowlist.
- **DEBT còn ghi**: **L5** LinkCombobox `pickedDesc` không xoá khi value đổi ngoài (mỹ thuật) · **L6** `packages/ui/src/styles.css` `@source "../../../apps/*"` (Tailwind build-time scan → app; xử lý ở Gate 7 khi publish/generated app).
- Deliverable docs: **ĐỦ** — ARCHITECTURE/METADATA_SCHEMA/PERMISSION_MODEL/I18N_MODEL/SECURITY_MODEL/APP_MANIFEST/BUILDER_ROUNDTRIP/TEST_REPORT/API_CONTRACT_MATRIX/FIELD_TYPE_COMPATIBILITY đều đã viết (xem root `*.md`), cập nhật lại ở Phase 7 (repair program) cho khớp trạng thái hiện tại.

## Phase 0–6 — chương trình sửa lỗi review độc lập (checkpoint `d9c5c8b`) — trạng thái
Bằng chứng đầy đủ (lệnh+exit-code+live evidence) ở [`TEST_REPORT.md`](TEST_REPORT.md). Đây chỉ là ledger
tóm tắt trạng thái từng finding.

| ID | Nội dung | Trạng thái |
|---|---|---|
| P0-SEC-01 | Credential Administrator thật hard-code trong source + 8 commit git history | ✅ ĐÓNG — token xoay (cũ→401), source dùng env bắt buộc, history purge (0 hit toàn bộ object), `458eae1` |
| P0-SEC-02 | e2e proxy = open-proxy tiềm ẩn (không bind loopback, không allowlist, tiêm token bất kỳ ai gọi được) | ✅ ĐÓNG — bind `127.0.0.1`, allowlist path/method, guard chặn Administrator không opt-in, secret-scan CI+pre-commit, `e01d464` |
| P1-AUTH-01 | App sinh ra KHÔNG có auth boundary thật (không Guest-detect/login form/CSRF/logout); runtime E2E cũ chỉ chứng minh qua token-injection, không phải user thật | ✅ ĐÓNG — `AuthBoundary`+`LoginForm` (`@metaforge/shell`), live cookie-session 9/9 PASS, `4817b82`+`31f799d` |
| P1-MANIFEST-01 | `nav.kind`/`nav.icon`/`manifest.locale` bị runtime sinh ra lờ hết — mọi nav item gửi `/app/<key>` bất kể kind | ✅ ĐÓNG — `resolveNavPath`+`mergeLocale`, live 8/8 PASS mọi kind, `4dda7a5` |
| P1-PERM-01 | `caps` (effective capabilities) chỉ gate nút hành động, KHÔNG gate field editability/List Create-Delete/cột | ✅ ĐÓNG — `forceReadOnly`, `ListContainer` gate + `deriveColumns(meta,{roles})`, live 4/4 PASS, `9e580bc` |
| P1-WF-01 | `hasWorkflow` suy từ `transitions.length>0` — không phân biệt "không workflow" với "hết transition cho state/user hiện tại" | ✅ ĐÓNG — `metaforge.api.get_workflow_transitions` trả `{has_workflow,transitions}`, live xác nhận cả 3 case, `b96114c` |
| P1-LINK-01 | Link/Dynamic Link fallback về input tự do khi thiếu service/config — lỗi thật bị che giấu | ✅ ĐÓNG — 3 trạng thái fail-visible riêng biệt, free-text chỉ sau cờ dev, live 10/10 PASS, `9665936` |
| P2-CACHE-01 | scopeKey = `${user}\|${lang}\|16` (hằng số đoán, không site) | ✅ ĐÓNG — `createScopeKey(boot)` dùng `site_name`+`frappe_version` thật từ `get_boot()`, `b298a1f` |
| P2-BUILDER-01 | `diffMeta` bỏ qua `permissions` hoàn toàn — đổi quyền không bật Apply, round-trip coi khác nhau là giống | ✅ ĐÓNG — `diffPermissions` khoá (role,permlevel,if_owner), `serializeDocTypeForSave` canonical hoá permissions, live round-trip add/change/remove 17/17 assert PASS, `b298a1f` |
| P2-CLI-01 | CLI ghi đè không kiểm tra, không transactional, mặc định `workspace:*` ngoài monorepo | ✅ ĐÓNG — transactional temp-dir, `--force` bắt buộc cho đích không rỗng, `--source` tường minh ngoài monorepo, verify chức năng 7/7 case, `b298a1f` |

**9/9 finding review độc lập đã đóng.** Debt CÒN LẠI (không nằm trong phạm vi Phase 0–6, ghi trung thực,
không giả vờ đã sửa):
- `planCustomization` (Builder serializer #1, Standard DocType qua Custom Field/Property Setter) CHƯA
  xử lý `diff.permissions` — permission cho Standard DocType cần cơ chế riêng (Custom DocPerm insert/
  update/delete), ngoài phạm vi P2-BUILDER-01 (vốn nhắm DocType tự viết/custom qua `frappe.client.save`
  trực tiếp).
- CSP header vẫn deploy-level (nginx) — như Gate 5 cũ, chưa đổi.
- Dashboard serializer #4: pure+test, live round-trip vẫn hoãn — như Gate 6 cũ, chưa đổi.
- Flake hạ tầng test (`generated-wms-cookie-auth.spec.ts`, bước session-expiry) khi chạy ĐỒNG THỜI
  toàn bộ `e2e-factory` suite (4 webServer qua 1 tunnel) — luôn PASS khi chạy riêng project, xác nhận
  lặp lại ≥4 lần trong Phase 0–6. Không phải lỗi sản phẩm; cân nhắc giảm tải test song song nếu đưa
  vào CI.

## Vòng 2 — review độc lập trên checkpoint `453d322` (đang tiến hành)
Review thứ 2 (sau khi Phase 0–6 đóng + zip `453d322` gửi đi) tìm thêm 1 blocker auth mới + vài gap
chức năng/tài liệu. Thứ tự sửa đã khoá: Auth stale boot/CSRF → App-mode server-authoritative actions →
sửa report/docs → CI generator + App-mode tests → external package strategy → Experience plugin/runtime
→ manifest + pre-auth i18n. Bằng chứng đầy đủ dần cập nhật ở [`TEST_REPORT.md`](TEST_REPORT.md).

| ID | Nội dung | Trạng thái |
|---|---|---|
| AUTH-STALE-BOOT-01 | `AuthBoundary`'s `bootPromises` (WeakMap theo adapter) chỉ xoá khi `getBoot()` lỗi — boot THÀNH CÔNG cache vĩnh viễn; logout không xoá → login user khác CÙNG TAB nhận lại boot/roles/scopeKey/CSRF của user cũ tới khi F5 | ✅ ĐÓNG — `invalidateBoot()` xoá cache ở CẢ logout() và onSessionExpired(), live-verify (login A→logout→login B cùng tab, đếm response `get_boot` THẬT qua mạng, xác nhận bắt đúng bug bằng cách tạm revert fix), `99f84b6` |
| APPMODE-ACTIONS-01 | `ReceiveExperience.tsx` hiện nút GIAO/NHẬN CHỈ dựa `doc.status` — quyền thật còn phụ thuộc company scope/lô Hold/issued_by≠received_by (server đã enforce đúng, nhưng UI hiện nút sai) | ✅ ĐÓNG — `aphvh.api.wms.get_transfer_actions` (descriptor đọc-only, app aphvh ngoài repo — đã xin xác nhận trước khi sửa) + UI gate theo `{can_issue,can_receive}`, live-verify qua browser thật trên `/wms` công khai (cả 2 chiều), `d921b8a` |
| NEWFORM-DEFAULT-MAGIC-01 | (phát hiện phụ khi verify lại claim `workflow_state` cũ) `blankDoc()` gửi literal Frappe magic-default ("Today"/"Now") cho field Date/Datetime → MySQL `OperationalError 1292` khi tạo mới — ĐÂY mới là root cause thật của "tạo ToDo lỗi", KHÔNG phải `workflow_state` (đã sửa từ lâu, `2c7c583`) | ✅ ĐÓNG — `resolveDefault()` resolve Today/Now bằng đồng hồ máy trước khi gửi (giống Desk), live: apps/demo full live suite 17/18→**18/18**, `8d3367d` |
| Doc drift (HEAD hash sai, `workflow_state` mâu thuẫn 3 chỗ, hash `04cc26f` không tồn tại, README v0.1.0 vs package.json v0.6.0, 3 số selfcheck khác nhau README/BUILD_REPORT/TEST_REPORT) | ✅ ĐÓNG — KNOWN_GAPS/README sửa tại chỗ; `BUILD_REPORT.md` archive `docs/history/` (source số liệu build/test DUY NHẤT còn lại = TEST_REPORT.md, tránh drift lặp lại) | 3 commit docs, hash xem `git log` |
| CI chưa thật sự chạy CLI sinh app mới vào thư mục tạm · App-mode `/x/receive` chưa có test commit (mới changelog+screenshot) | ⏳ CHƯA LÀM — Phase kế tiếp (locked order) |
| `createExperienceRegistry()` không runtime nào dùng · `/x/receive` hard-code trong `LiveApp.tsx` · app factory chưa tự đăng ký Experience · manifest chưa có contract Experience | ✅ ĐÓNG — `AppNavItem.kind="experience"` + `resolveNavPath` + `ExperienceRoute` (@metaforge/shell/app-mode, router-agnostic) nối vào `apps/demo` VÀ template CLI (route `/x/:key` generic, registry rỗng mặc định + placeholder). Live: `app-mode-receive.spec.ts` 2/2 PASS qua route mới. Xem APP_MANIFEST.md §5 |
| `create-metaforge-app --source external` scaffold được nhưng `@metaforge/*` vẫn `private:true`, chưa publish → app ngoài monorepo không `pnpm install` được | ✅ ĐÓNG — `--source local --metaforge-root <path>` mới: `pnpm pack` từng package (rewrite `workspace:*`→version thật) + `file:<tarball>` cho dep trực tiếp + `pnpm.overrides` cùng map cho dep trung gian. Live: sinh app NGOÀI repo, `pnpm install` (222 gói) + typecheck + build đều exit 0, không cần registry. `external`/`workspace` giữ nguyên (registry thật/monorepo). Xem APP_MANIFEST.md §4 |
| Icon map chỉ 2 icon cố định (mất âm thầm icon khác) · route tương đối/trùng không bị `validateManifest` chặn | ✅ ĐÓNG — `resolveIcon()` (@metaforge/shell) tra ĐỘNG toàn bộ lucide-react thay map tay (áp cả `apps/demo` + template CLI); `validateManifest` thêm `nav_route_relative` + `nav_route_dup`. 3 manifest thật (demo/sample-wms/sample-sales) verify vẫn `ok:true` (không false-positive) |
| `route`/`system` vẫn chỉ hiện placeholder khi app chưa cấp component riêng | ➖ ĐÚNG THIẾT KẾ, không phải bug — thin scaffold KHÔNG THỂ biết trước màn nghiệp vụ nào app sẽ cấp; placeholder có route THẬT (không 404/loop), thay bằng component thật là việc của app. Xem APP_MANIFEST.md §2 |
| Workspace luôn `activeKey="__workspace"` — nhiều nav item `kind="workspace"` cùng vào 1 `/workspace`, không phân biệt được item nào trỏ workspace Frappe nào | ⏳ CHƯA LÀM (ghi trung thực, cân nhắc rồi hoãn) — `WorkspaceContainer` đã có `defaultWorkspace` prop nhưng nav `key` hiện là slug UI (`"__workspace"`), KHÔNG phải tên workspace Frappe thật (`"Kho"`/`"Kế toán"`) — cần thêm field mới vào `AppNavItem` (vd `workspaceName`) + đổi route `/workspace` → `/workspace/:key`, RỦI RO PHÁ VỠ 5 chỗ đang giả định path `/workspace` cố định (`live.spec.ts`, `selfcheck.ts`, `generated-wms-manifest.spec.ts`, `sample-wms`/`sample-sales` main.tsx). Hiện tại: đúng 1 workspace item/manifest trong mọi fixture (chưa gặp case thật cần phân biệt) — người dùng vẫn chọn được workspace cụ thể qua switcher TRONG `WorkspaceView`. |
| `LoginForm`/`LoginScreen` hard-code tiếng Việt dù `I18nProvider` (đọc `localStorage`, không cần network) đã bọc ngoài — app tiếng Anh vẫn mở đầu bằng login tiếng Việt | ✅ ĐÓNG — `useT()` + key `auth.*` mới (`@metaforge/shell/i18n`) thay hard-code, áp cả `LoginForm` (shared) và `apps/demo/system/Login.tsx`. Giới hạn còn lại: CLI sinh app chưa tự mount `I18nProvider` (fallback an toàn về VI, không lỗi) — xem APP_MANIFEST.md §3 |
| `LiveApp.tsx` gọi `navigate()` imperative trong lúc render guest — nên trả `<Navigate>` | ⏳ CHƯA LÀM |

## Design-parity (import handoff) — TẠM DỪNG
Theo chỉ đạo audit "ngừng vá visual, sửa engine trước". Đã làm P0/P1/P2/P4 (default Blue + primitives + list status-dot + context tab). CÒN P3 form field-states, P5 màn phụ — nối lại SAU khi engine gates xong.
