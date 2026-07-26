# TEST_REPORT — Milestone checkpoint (13-commit review)

> Bằng chứng chạy THẬT (lệnh + exit code + commit hash). Không tuyên bố "verified" nếu chưa chạy.

## Phạm vi
- Range: **`250bf5a..0d52b57`** = **13 commit** (Gate 2 tail P0-06/P0-08 · Gate 3 đầy đủ · Gate 4 i18n/fetch_from/locale · Gate 5 url/ai-secret).
- HEAD: `0d52b57`. Working tree: **clean** (`git status --short` rỗng).

## A. Clean-state verification (chạy lại từ sạch)
| Bước | Lệnh | Exit | Kết quả |
|---|---|---|---|
| Frozen install | `corepack pnpm@9.15.0 install --frozen-lockfile` | 0 | Done 1.4s — **không drift lockfile** |
| Clean | xoá mọi `dist/` + `*.tsbuildinfo` (packages+apps) | 0 | 0 dist còn lại (build lại từ đầu) |
| Typecheck | `pnpm -r run typecheck` (`tsc -b`) | **0** | 8/8 project Done |
| Lint | `node scripts/check-native-ui.mjs` | **0** | TOTAL 0 vi phạm |
| Selfcheck | `pnpm --filter @metaforge/demo run selfcheck` | **0** | **55 nhóm assert xanh** |
| Build | `pnpm -r run build` (clean) | **0** | 7 package (core/ui/adapter-frappe/controls/shell/builder/views) + demo vite (built 7.97s) |
| Dist exports | kiểm `dist/index.{js,d.ts}` mỗi package | 0 | 7/7 OK |
| E2E (mock) | `pnpm --filter @metaforge/demo run e2e` (playwright, tự dựng vite :8099) | **0** | **13 passed (12.4s)** |
| Git status | `git status --short` | 0 | rỗng (clean; dist gitignore) |

## B. Package boundary (không import ngược)
- `grep` packages/*/src cho `apps/demo` / `/dist`: **0 hit**.
- `grep` deep-import `@metaforge/<pkg>/src`: **0 hit** (chỉ qua public entry).

## C. Live contract verification (site thật metaforge.localhost, VPS 222)
Chạy trong backend container `frappe_docker-backend-1` (Administrator token), 2026-07-24:

| Contract | Lệnh | Kết quả | Kết luận |
|---|---|---|---|
| **P1-10** `frappe.desk.reportview.get_count` + `or_filters` | POST doctype=DocType, or_filters=`[["name","like","%report%"]]` | `{"message":14}` | ✅ đếm THEO search |
| — baseline không search | POST doctype=DocType | `{"message":815}` | 14 ≠ 815 ⇒ or_filters thực sự lọc |
| **P0-09** `frappe.desk.search.search_link` + `filters` + `reference_doctype` | GET doctype=Warehouse, filters=`[["is_group","=",0]]`, reference_doctype=Stock Entry, page_length=5 | 5 kho lá (không group) | ✅ server nhận & áp filters + reference |

**⇒ 2/3 mục UNVERIFIED_LIVE trước đây nay VERIFIED.** Mục thứ 3 ("translation catalog từ server") KHÔNG phải unverified mà **CHƯA XÂY**: translator core thuần + test xong (`makeTranslator`), catalog để tiêm; chưa nối endpoint nạp catalog ⇒ liệt kê ở KNOWN_GAPS như "chưa triển khai", không phải "chưa verify".

## C2. Gate 6 — Builder canonical (LIVE round-trip trên DocType dùng-một-lần)
`node apps/demo/roundtrip-live.mjs` (SSH tunnel :8000 → backend, site metaforge.localhost), 2026-07-24.
DÙNG CHÍNH code builder/core (dist): `openDraft`/`serializeDocTypeForSave`/`diffMeta`/`normalizeMeta`.

| Bước | Kết quả |
|---|---|
| tạo DocType disposable (custom=1, module Custom) | status 200 |
| fetch → `openDraft`(normalize) baseline | fields ta định nghĩa có mặt |
| sửa draft (đảo thứ tự + thêm `qty_x`) → `serializeDocTypeForSave` | payload mang OCC `modified` |
| **apply** (frappe.client.save) | **status 200** |
| **reload** → normalize | `qty_x` tồn tại · số field=3 · thứ tự giữ `status_x,title_x,qty_x` |
| **semantic**: diff draft↔reload | **removed=∅ · reordered=false** (không mất/không méo) |
| **conflict**: save lại với `modified` stale | **HTTP 417 TimestampMismatch** (version detection) |
| cleanup | xoá fixture status 200 (không để rác) |

**⇒ Gate 6.4 LIVE round-trip: PASS.** Persistence THẬT (apply/reload/conflict) + semantic equality trên site thật, không đụng dữ liệu sản xuất. Kết hợp round-trip THUẦN (serializer, selfcheck 61) ⇒ Gate 6 core khép.

## C3. Gate 7 — App factory (CLI + app sinh ra tiêu thụ @metaforge qua dist)
`node packages/create-metaforge-app/dist/cli.js sample-wms --home ToDo --dir apps/sample-wms`, 2026-07-24.

| Bước | Lệnh | Kết quả |
|---|---|---|
| CLI build | `pnpm --filter create-metaforge-app build` | tsc0 |
| Sinh app mỏng | CLI (validate manifest bằng chính engine) | 9 file (manifest + main + styles + config) |
| **clean install** | `pnpm install` | linked workspace:* (`@metaforge/*` qua dist) |
| **typecheck** | `pnpm --filter sample-wms typecheck` | **tsc0** (tiêu thụ .d.ts từ dist) |
| **build** | `pnpm --filter sample-wms build` | **vite ✓ 2503 modules**, CSS 52.86kB (Tailwind quét @source dist → utility class từ component engine) + JS 748kB |
| root regression | `pnpm -r typecheck` · `pnpm -r build` | **0** (10 project typecheck · 12 build) |

**⇒ Gate 7.3/7.4: app sinh ra clean-install + typecheck + build PASS, KHÔNG copy engine source** (imports chỉ `@metaforge/*` + react + ./app-manifest; grep xác nhận 0 import `packages/*/src` / `/dist/`).

### C3b. Gate 7 — RUNTIME E2E app sinh ra (LIVE, KHÔNG dùng apps/demo)
`pnpm --filter e2e-factory exec playwright test` — serve PRODUCTION dist + proxy /api → backend
metaforge.localhost (token+site, SSH tunnel bind IPv4 :8000). **4 test — ALL LIVE, PASS**:

| Test | Chứng minh |
|---|---|
| [wms] boot + manifest nav + locale + live list + network | boot Administrator thật · nav "ToDo"/"CHÍNH" từ manifest · redirect home `/app/ToDo` · list dữ liệu THẬT (row "Dựng renderer…" Due 2026-10-01) · gọi get_boot + get_list · **KHÔNG** call aphvh/wms/warehouse/receive · 0 console error |
| [wms] mở document | click row thật → form record render live |
| [wms] sửa field → lưu → reload | sửa `#mf-description` → **PUT /api/resource/ToDo 200** (save live) → reload → **giá trị còn** → cleanup xoá |
| [sales] boot + home=User + live list | app THỨ HAI (manifest khác: home User) boot + list live ⇒ generator **tổng quát**, không hard-code |

**⇒ Nhà máy sinh ra APP CHẠY ĐƯỢC (không chỉ build được)**: boot/login(token)/manifest/locale/route/list/mở-doc/sửa-lưu-reload LIVE. Test dùng production dist (đã build) qua proxy same-origin (đóng vai nginx deploy). `<DoctypeWorkspace>` runtime chung demo + app sinh ra.

Phát hiện (ghi debt, không chặn): `serializeCreateDocument` (create gửi FULL doc) → **500** trên ToDo của site này vì gửi `workflow_state` + custom permlevel field; **edit (patch chỉ field đổi) OK**. Trên doctype có workflow nên bỏ `workflow_state` khỏi payload create. CSS `@import url(fonts)` cảnh báo thứ tự (ui styles.css) — cosmetic.

## C4. Builder serializer #1 — customize STANDARD DocType (LIVE)
`node apps/demo/customize-live.mjs` (tunnel :8000 IPv4), 2026-07-24. Dùng `planCustomization`+`diffMeta`+`normalizeMeta` (dist), trên STANDARD **ToDo**:

| Bước | Kết quả |
|---|---|
| baseline effective meta (getdoctype) | 20 field, description label "Description" |
| draft: +custom field `mf_e2e_custom` + đổi label description | plan: 1 Custom Field + 1 Property Setter |
| apply | **insert Custom Field 200** · **insert Property Setter 200** |
| reload (getdoctype) | **custom field xuất hiện** · **label = "MF E2E Label"** (PS áp dụng) |
| cleanup | xoá PS + CF (200/200) → **revert OK** (label về "Description", field mất) |

**⇒ Serializer #1: chỉnh STANDARD DocType (thêm field + override property) KHÔNG sửa schema gốc, round-trip + revert PASS live.**

## C5. Builder serializer #2 (Workflow) + #3 (Print Format) — LIVE
`node apps/demo/serializers-live.mjs` (tunnel :8000 IPv4), 2026-07-24. Dùng `serializeWorkflow`+`workflowMasters`+`serializePrintFormat` (dist).

| Serializer | Bước | Kết quả |
|---|---|---|
| **#2 Workflow** | DocType dùng-một-lần → masters (Workflow State/Action) insert-if-missing → insert Workflow | **200** |
| | reload Workflow | **2 state + 1 transition** · Done doc_status="1" · action "Submit"+role persisted |
| | cleanup | xoá Workflow + masters + auto Custom Field workflow_state + DocType (200) |
| **#3 Print** | serializePrintFormat(ToDo) → insert Print Format | **200** |
| | reload | **html Jinja `{{ doc.description }}` persisted** · print_format_type=Jinja/doc_type=ToDo |
| | cleanup | xoá Print Format (200) |

**⇒ Serializer #2 + #3: round-trip LIVE PASS.** Phát hiện (đã sửa): Workflow cần state/action **master** tồn tại trước (Frappe Link) ⇒ `workflowMasters()` + apply insert-if-missing.
Serializer **#4 Dashboard**: pure + test (Number Card/Chart/Dashboard plan) — live hoãn (Dashboard Chart cần cấu hình nguồn/time-series đầy đủ, KNOWN_GAPS).

## D. Điểm còn lại
- CSP header: deployment-level (Gate 5 đuôi).
- Gate 4 đuôi: thread sys_defaults(number_format/currency/date) boot→provider; support-matrix Code/JSON/HTML/Markdown/Text Editor/Duration (đang fallback — PHẢI đánh dấu rõ, không giả vờ supported).
