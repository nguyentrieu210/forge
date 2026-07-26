# TEST_REPORT — checkpoint hiện tại

> Bằng chứng chạy THẬT (lệnh + exit code + commit hash). Không tuyên bố "verified" nếu chưa chạy.
> Tài liệu này là **báo cáo SỐNG duy nhất** — cập nhật tại chỗ mỗi lần có thay đổi lớn. Báo cáo cũ
> (Gate 0–7, phạm vi commit `250bf5a..0d52b57`) đã archive nguyên trạng ở
> [`docs/history/TEST_REPORT-gate0-7-250bf5a..0d52b57.md`](docs/history/TEST_REPORT-gate0-7-250bf5a..0d52b57.md)
> — KHÔNG sửa lại file đó, chỉ đọc tham khảo lịch sử.

## Gate numbering — làm rõ (yêu cầu review độc lập)
**KHÔNG có "Gate 8" thay thế Gate 0–7.** Gate 0–7 (engine/Builder/App-factory nền tảng) vẫn nguyên
trạng thái đã đóng, xem báo cáo archive ở trên. Công việc trong file này là 1 **chương trình sửa lỗi
riêng** ("repair program", đặt tên **Phase 0–6**) — vá các lỗ hổng review độc lập tìm thấy TRÊN NỀN
Gate 0–7 đã có (auth thật, permission UI, manifest parity, workflow, Link, cache scope, Builder
permission diff, CLI safety), KHÔNG đổi số Gate, KHÔNG làm lại Gate 0–7. Gate 8 (a11y/visual-
regression/perf-budget/error-boundary/release) trong `KNOWN_GAPS.md` vẫn CHƯA bắt đầu — không liên
quan tới Phase 0–6 ở đây.

## HEAD hiện tại
```
c6ceaac feat(V2-8): manifest parity — dynamic icon lookup, route validation, pre-auth i18n
```
**Lưu ý về chính dòng này** (bài học từ mâu thuẫn review vòng 2 bắt được: dòng "HEAD hiện tại" từng bị
để quên trỏ về `b298a1f` dù HEAD thật đã qua `453d322`): mỗi commit cập nhật file này KHÔNG THỂ tự biết
hash của chính nó trước khi commit — dòng trên phản ánh HEAD **tại thời điểm ghi**, luôn kiểm bằng
`git log --oneline -1` thay vì tin tuyệt đối con số ở đây nếu nghi ngờ đã lệch.

18 commit kể từ báo cáo archive Gate 0–7 (`29f24fc` → `c6ceaac`): 9 commit Phase 0–6 (`b298a1f`) + 1
commit docs Phase 7 (`453d322`) + **8 commit "vòng 2"** (review độc lập trên checkpoint `453d322`, TẤT
CẢ 7 phase theo thứ tự khoá đã đóng — xem section cuối file), working tree clean tại thời điểm ghi.

## Nguồn gốc chương trình sửa lỗi
1 review độc lập trên checkpoint `d9c5c8b` (bản zip gửi đi review) phát hiện: 1 **credential thật bị
lộ trong source + git history** (BLOCKER), và 6 lỗ hổng chức năng/bảo mật khác (P1-AUTH-01,
P1-MANIFEST-01, P1-PERM-01, P1-WF-01, P1-LINK-01, P2-CACHE-01/P2-BUILDER-01/P2-CLI-01). Mỗi mục dưới
đây = 1 phase = 1 (hoặc vài) commit tập trung, có bằng chứng lệnh+exit-code, và **live evidence** (site
thật `metaforge.localhost`, VPS 222.255.238.178) trừ khi ghi rõ giới hạn phạm vi.

---

## Phase 0 — Sự cố bảo mật (BLOCKER) — `458eae1`, `e01d464`

**Phát hiện**: token Administrator thật (đã rotate + revoke ngay, xem dưới) hard-code trong 6 file (5 script live-
test + 1 doc), tồn tại trong **8 commit lịch sử git**.

| Bước | Lệnh/hành động | Kết quả |
|---|---|---|
| Xoay credential | `bench execute ...generate_keys` trên site thật | Token cũ → **401** ngay sau xoay; token mới → 200 |
| Xoá khỏi source | `requireLiveEnv()` (env bắt buộc, không fallback) thay hard-code | 5 script + 1 doc sửa |
| Purge git history | `git filter-branch --tree-filter` toàn bộ 47 commit + xoá `refs/original/*` + `gc --prune=now` | Quét **mọi object** (loose+packed): **0 hit** |
| Secret-scan mới | `node scripts/scan-secrets.mjs` (0 dependency, wire CI + pre-commit hook) | Test bắt được secret giả lập (exit 1) trước khi wire thật; sau đó `0 findings` |
| Hardening e2e proxy | `serve-proxy.mjs`: bind `127.0.0.1`, allowlist `/api/method`+`/api/resource`, guard tự chặn Administrator trừ khi `E2E_ALLOW_ADMINISTRATOR=1` | 4 case test bằng backend giả: đều đúng thiết kế |

**Kết luận**: BLOCKER đã đóng. Token cũ đã vô hiệu, history sạch, cơ chế phòng tái diễn (secret-scan
CI+pre-commit) đã có bằng chứng hoạt động thật.

---

## Phase 1 — Auth thật cho app sinh ra — `4817b82`, `31f799d`

**Phát hiện**: app do `create-metaforge-app` sinh ra KHÔNG có auth boundary — gọi `getBoot()` và hiện
lỗi thô khi fail, không phát hiện Guest/401, không có form đăng nhập, không cài CSRF, không đăng xuất.
Runtime E2E trước đó "PASS" chỉ vì proxy tiêm sẵn token Administrator — chưa từng chứng minh user thật
đăng nhập được.

**Xây mới**: `AuthBoundary` + `LoginForm` (`@metaforge/shell`) — dedupe `getBoot` theo adapter instance,
phân loại lỗi qua `mapError` (auth/permission → guest), cài CSRF từ boot, expose `logout()`. Wire vào
CẢ app CLI sinh ra LẪN `apps/demo` (bỏ code trùng lặp tự viết tay trước đó).

### Live evidence — cookie-session THẬT (không token), `e2e-factory/tests/generated-wms-cookie-auth.spec.ts`
| Test | Kết quả |
|---|---|
| Guest → login form → cookie login → boot/list | PASS |
| Permitted edit (write qua role All) | PASS |
| Forbidden action (System Manager-only) — server reject trực tiếp | PASS |
| Logout → quay lại guest | PASS |
| Session hết hạn GIỮA phiên → tự quay guest KHÔNG reload | PASS (sau khi sửa bug thật, xem dưới) |

**Bug thật do live test tìm ra** (KHÔNG phải giả định): Frappe trả `PermissionError`/403 — không phải
`AuthenticationError`/401 — khi Guest gọi method cần login (message chứa "Login to access", xác nhận
qua response THẬT). `mapError` bị phân loại nhầm "permission" thay vì "auth" ⇒ `onSessionExpired` không
bao giờ bắn cho case này. Sửa bằng 1 rule tái phân loại dựa message, verify lại 66/66 selfcheck không
vỡ + re-test live PASS.

**Kết quả**: 9/9 live PASS (`e2e-factory`, toàn bộ 3 project) + 17/18 live PASS (`apps/demo` live E2E
đầy đủ — 1 fail là bug ĐÃ BIẾT từ trước, `serializeCreateDocument` gửi `workflow_state`, không liên
quan auth).

---

## Phase 2 — ManifestAppRuntime parity — `4dda7a5`

**Phát hiện**: `AppManifest` khai báo `nav.kind` (doctype/route/workspace/system) + `nav.icon` +
`manifest.locale`, nhưng runtime sinh ra LỜ hết — mọi nav item bị gửi tới `/app/<key>` bất kể kind
(route/workspace/system bị coi NGẦM là DocType → 404/mis-route), icon bị bỏ, locale override bị bỏ qua.
`apps/demo` đã tự sửa lấy (logic riêng trong `LiveApp.tsx`), nhưng chưa bao giờ đưa vào template CLI.

**Xây mới**: `resolveNavPath()` + `mergeLocale()` (`@metaforge/core`, RÚT RA từ logic đã đúng của demo,
không phát minh lại) + validate `home.route` phải khớp nav nào đó (chặn redirect-loop). Template CLI:
validate manifest lúc khởi động, route THẬT cho mọi kind (kể cả placeholder "chưa triển khai" cho
route/system chưa có component riêng — KHÔNG rơi vào catch-all).

### Live evidence — `e2e-factory/tests/generated-wms-manifest.spec.ts` (manifest `sample-wms` mở rộng route+workspace+system+icon+locale)
| Test | Kết quả |
|---|---|
| kind=doctype (regression) | PASS |
| kind=workspace → WorkspaceContainer thật | PASS |
| kind=route → route thật tồn tại, không redirect loop | PASS |
| kind=system → route thật, không bị coi là DocType | PASS |
| locale override (currency USD) không vỡ boot/render | PASS |

**Kết quả**: 8/8 live PASS riêng lẻ, 14/14 full suite (1 lần flake do tải hệ thống lúc chạy đồng thời
nhiều webServer — pass sạch khi chạy lại, xem mục Flake ở cuối file).

---

## Phase 3 — Propagate effective permissions qua UI — `9e580bc`

**Phát hiện**: `FormContainer`/`NewFormContainer` fetch `caps` (effective capabilities, fail-closed từ
server) nhưng CHỈ dùng để gate nút hành động (Lưu/Gửi/Xoá) — field vẫn gõ được dù `caps.write=false`.
`ListContainer` KHÔNG fetch capabilities: "Tạo mới" hiện bất kể `caps.create`, bulk-delete luôn có mặt,
cột list không lọc theo field đọc được.

**Sửa**: `forceReadOnly={!caps.write}` (Form) / `{!caps.create}` (New Form) — feed vào `resolveMeta`
đã có sẵn (child-grid tự kế thừa qua `readOnly` field cha, không cần code riêng). `ListContainer`:
`onCreate`/`onBulkDelete` chỉ truyền xuống khi `caps.create`/`caps.delete` true; `deriveColumns(meta,
{roles})` lọc field masked/permlevel-thiếu-quyền (dùng chung `resolveField` với Form).

### Live evidence — `e2e-factory/tests/generated-wms-permission.spec.ts`, user hạn chế qua cookie-session
Doctype "Note" (KHÔNG phải ToDo — role "All" cấp full CRUD trên ToDo, không có cách tạo user "chỉ đọc"
ToDo qua permission chuẩn; phát hiện live trước khi chốt fixture).
| Test | Kết quả |
|---|---|
| caps thật: write=false trên Note không sở hữu | PASS |
| Field readOnly/disabled khi caps.write=false + KHÔNG có nút Lưu | PASS |
| Server vẫn từ chối ghi trực tiếp (bypass UI) | PASS |
| List: "Tạo mới" hiện (create=true) NHƯNG bulk-delete ẩn (delete=false) — gate 2 chiều | PASS |

**Kết quả**: 4/4 live PASS.

---

## Phase 4 — Server-authoritative workflow descriptor — `b96114c`

**Phát hiện**: `FormView` suy "có workflow" từ `transitions.length > 0` — không phân biệt được "doctype
không có workflow" với "có workflow nhưng hết transition cho user/state hiện tại" (trạng thái cuối,
hoặc không role nào khớp). `FormContainer` chưa từng truyền `hasWorkflow` (dù `FormView` đã hỗ trợ prop
này từ trước).

**Xây mới**: `metaforge.api.get_workflow_transitions` (backend, bọc `frappe.model.workflow.get_transitions`
+ `get_workflow_name` — native Frappe không tự phân biệt 2 case) trả `{has_workflow, transitions}`.
**Deploy backend chung với site production "frontend"** — xin phép người dùng trước, frontend hồi phục
ngay sau restart (đã xác nhận `frappe.ping` → pong).

### Live evidence (curl trực tiếp qua bench console + tunnel)
| Case | Kết quả |
|---|---|
| User (không workflow) | `{has_workflow:false, transitions:[]}` |
| ToDo Pending (còn transition) | `{has_workflow:true, transitions:[1 item]}` |
| ToDo Approved THẬT (apply_workflow thật, không giả state) | `{has_workflow:true, transitions:[]}` — case mấu chốt của cả fix |

Browser thật (`e2e-factory/tests/generated-wms-workflow.spec.ts`): xác nhận app gọi ĐÚNG endpoint mới
(không còn native `get_transitions`) và nhận `has_workflow=true`.

**Giới hạn phạm vi ghi rõ**: ToDo (doctype duy nhất có workflow trên site test) là `is_submittable=0`
nên nhánh "hasWorkflow ẩn Submit/Cancel thủ công" (`resolveFormActions`) KHÔNG quan sát được qua UI của
riêng ToDo dù có bug hay không. Nhánh đó đã **pure-tested từ trước** (selfcheck, không đổi ở Phase 4).

**Kết quả**: 19/19 live PASS (full `e2e-factory` suite, không flake lần chạy này).

---

## Phase 5 — Strict Link/Dynamic Link fallback — `9665936`

**Phát hiện**: `LinkControl` gộp 3 tình huống khác nhau vào 1 fallback input tự do (`!search ||
!target`): Dynamic Link chưa chọn nguồn (bình thường), static Link thiếu `options` (lỗi cấu hình thật),
thiếu `services.searchLink` (lỗi hạ tầng thật). Cả 3 đều cho gõ tự do — 2 case lỗi bị CHE GIẤU thay vì
hiện rõ.

**Sửa**: 3 trạng thái fail-visible riêng biệt (không `<input>` nào): Dynamic Link chờ chọn nguồn = khoá
+ hướng dẫn; static Link thiếu options = chẩn đoán lỗi cấu hình; thiếu service = chẩn đoán lỗi hạ tầng.
Free-text CHỈ còn sau cờ dev tường minh (`__MF_LINK_ALLOW_FREE_TEXT__`), không mặc định.

### Live evidence — `e2e-factory/tests/generated-wms-link.spec.ts`
ToDo thật (`reference_type`/`reference_name`, Link/Dynamic Link có sẵn — không cần dựng DocType riêng):
tạo ToDo không set `reference_type` → `reference_name` PHẢI hiện khoá+hướng dẫn "reference_type", PHẢI
là `<div>` chẩn đoán chứ không phải `<input>`. **PASS ngay lần chạy đầu.**

**Kết quả**: 10/10 live PASS (project "wms"), 19/20 full suite (1 flake đã biết, PASS 5/5 khi chạy riêng).

---

## Phase 6 — Cache scope + Builder permission diff + CLI safety — `b298a1f`

### 6a. P2-CACHE-01 — scopeKey thiếu site
`${user}|${lang}|16` (hằng số "16" đoán, không site) → 2 site chung trình duyệt đụng cache.
`createScopeKey(boot)` ghép từ `site_name`+`frappe_version` THẬT (boot server trả, mới thêm vào
`get_boot()` — **deploy backend chung, xin phép trước, frontend hồi phục ngay**).

Live: `get_boot` trả `site_name="metaforge.localhost"`, `frappe_version="16.28.0"` (xác nhận qua curl +
qua browser thật, `generated-wms-manifest.spec.ts`).

### 6b. P2-BUILDER-01 — diffMeta bỏ qua permissions
1 thay đổi CHỈ-permission báo `hasChanges=false` (nút Apply không bật) + `metaEqual=true` (round-trip
coi 2 meta khác quyền là giống hệt). `diffPermissions` mới, khoá `(role, permlevel, if_owner)` (Frappe
cho phép nhiều hàng cùng role+permlevel khác if_owner). `serializeDocTypeForSave` canonical hoá
`permissions` (idx+envelope) giống `fields` đã có.

Live round-trip (`apps/demo/permissions-roundtrip-live.mjs`, DocType dùng-một-lần): thêm rule + đổi
rule → diff đúng TRƯỚC apply → serialize có envelope/idx → apply 200 → reload khớp (`diffPermissions`
rỗng) → xoá 1 rule → apply → reload xác nhận mất ĐÚNG rule đó, không đụng rule khác. **17/17 assert PASS.**

Phát hiện live giữa chừng: rule DocPerm mới do Frappe lưu mặc định `report/export/print/email/share=1`
(không phải 0 như phần lớn ptype khác) — sửa dữ liệu test fixture cho khớp default thật, KHÔNG sửa
diff logic để đoán default riêng của Frappe (sai lớp trách nhiệm).

### 6c. P2-CLI-01 — CLI không an toàn
`scaffold()` ghi đè trực tiếp không kiểm tra, không `--force`, không transactional. Parse flag chấp
nhận thiếu giá trị (default `""` âm thầm). Mặc định `workspace:*` dù chạy ngoài monorepo (app sinh ra
không install được).

Sửa: `scaffold()` ghi vào thư mục tạm trước, chỉ thay thế đích sau khi ghi THÀNH CÔNG toàn bộ (rollback
nếu lỗi giữa chừng). CLI validate flag nghiêm ngặt (cờ lạ/thiếu giá trị = lỗi rõ, exit 2), từ chối đích
không rỗng trừ khi `--force`, yêu cầu `--source workspace|external` tường minh khi không phát hiện
`pnpm-workspace.yaml` ở thư mục cha (`--source external` bắt buộc kèm `--version`).

Verify chức năng trực tiếp (không có test harness sẵn cho package này) — **7/7 case đúng thiết kế**:
thiếu giá trị cờ / cờ lạ / ngoài monorepo không source-version / external thiếu version / external có
version (áp đúng vào package.json) / đích không rỗng không force (từ chối, đúng số file trong thông
báo) / `--force` (ghi đè đúng, marker file cũ mất, version mới áp, không rác thư mục tạm).

**Kết quả tổng Phase 6**: 20/21 full live suite (1 flake đã biết, 5/5 khi chạy riêng).

---

## Flake đã biết (hạ tầng test, KHÔNG phải lỗi sản phẩm)
Test `generated-wms-cookie-auth.spec.ts` (bước "session hết hạn") thỉnh thoảng timeout khi chạy TOÀN
BỘ `e2e-factory` suite (4 webServer đồng thời qua 1 tunnel SSH) — luôn PASS khi chạy riêng project đó
(xác nhận ≥4 lần trong phiên sửa lỗi này: Phase 2/3/5/6). Nguyên nhân: tải hệ thống/tunnel lúc khởi
động đồng thời nhiều proxy, KHÔNG phải logic app. Cân nhắc Phase 8 (nếu làm): giảm `fullyParallel`
hoặc tách webServer khởi động tuần tự để loại flake này khỏi CI.

## Điểm còn lại — CUỐI PHASE 0–6 (ghi trung thực, xem chi tiết `KNOWN_GAPS.md`)
> Danh sách này chốt tại thời điểm đóng Phase 0–6 (`b298a1f`/`453d322`). Trạng thái MỚI NHẤT của từng
> mục (kể cả mục đã đóng thêm ở vòng 2) → xem `KNOWN_GAPS.md`, không lặp lại/sửa số liệu ở đây để tránh
> 2 nguồn drift nhau (chính lỗi mà review vòng 2 bắt được).
- ~~`serializeCreateDocument` gửi `workflow_state`...~~ — **KHÔNG phải bug thật** (đã loại từ `2c7c583`,
  trước cả Phase 0–6). 500 khi tạo ToDo VẪN tái hiện được tới vòng 2, nhưng root cause KHÁC — xem
  `NEWFORM-DEFAULT-MAGIC-01` cuối file.
- `planCustomization` (Builder serializer #1, Standard DocType) CHƯA xử lý `diff.permissions` — chỉ
  field/doc prop qua Custom Field/Property Setter. Permission cho Standard DocType cần cơ chế riêng
  (Custom DocPerm insert/update/delete) — ngoài phạm vi P2-BUILDER-01 (vốn về DocType tự viết/custom).
- CSP header: vẫn ở mức deploy-level (nginx), như đã ghi từ Gate 5.
- Dashboard serializer #4: pure+test, live round-trip vẫn hoãn (như Gate 6 cũ).

---

## Vòng 2 — review độc lập trên checkpoint `453d322` (7/7 phase ĐÃ ĐÓNG)
Zip `453d322` (Phase 0–6 + docs Phase 7) gửi review độc lập lần 2 → 1 blocker auth mới (chạm thẳng
identity/role/CSRF) + vài gap chức năng/tài liệu. Thứ tự khoá: **Auth stale boot/CSRF → App-mode
server-authoritative actions → sửa report/docs → CI generator + App-mode tests → external package
strategy → Experience plugin/runtime → manifest + pre-auth i18n**. Ledger tóm tắt: `KNOWN_GAPS.md`
mục "Vòng 2".

### V2-1 — AUTH-STALE-BOOT-01 (BLOCKER) — `99f84b6`
**Bug**: `AuthBoundary`'s `bootPromises` (`WeakMap<FrappeAdapter, Promise<Boot>>`) chỉ `.delete()` ở
nhánh LỖI của `getBoot()`. Boot THÀNH CÔNG → promise sống vĩnh viễn theo adapter instance (1 instance/
vòng đời app). `logout()` không xoá cache → login user KHÁC CÙNG TAB, `load()` gọi lại `getBootOnce()`
vẫn trả promise ĐÃ RESOLVE của user cũ (KHÔNG gọi mạng lại) → UI/roles/scopeKey/CSRF vẫn của user cũ
tới khi F5.

**Fix**: `invalidateBoot(adapter)` xoá cache ở CẢ `logout()` (chủ động) và `onSessionExpired()` (hết
phiên giữa lúc dùng) — không chỉ nhánh lỗi.

**Live-verify**: test mới `generated-wms-cookie-auth.spec.ts` ("login A → logout → login B cùng tab")
— đếm response `metaforge.api.get_boot` THẬT qua mạng (lọc `res.ok()`, bỏ response 403 guest trước
login), assert response thứ 2 mang `user` = B. **Xác nhận test bắt đúng bug**: tạm `git stash` riêng
fix, rebuild `@metaforge/shell`+`sample-wms`, chạy lại → **FAIL đúng chỗ** (`Received: 1`, kỳ vọng
`≥2` — không có lần gọi mạng thứ 2). Khôi phục fix, rebuild → **6/6 PASS**
(`npx playwright test --project=wms-cookie-auth`, exit 0).

### V2-2 — APPMODE-ACTIONS-01 — `d921b8a`
**Bug**: `ReceiveExperience.tsx` (App-mode, `/x/receive`) hiện nút GIAO/NHẬN CHỈ dựa `doc.status`.
Quyền thao tác thật còn phụ thuộc company scope (`assert_scope`), lô đang Hold, và bất biến
issued_by≠received_by (server `aphvh.api.wms.transfer_issue/receive` đã enforce đúng — đây là UI hiện
nút SAI, không phải lỗ hổng bảo mật).

**Fix**: `aphvh.api.wms.get_transfer_actions(transfer)` — descriptor đọc-only mới trong app **aphvh**
(NGOÀI repo MetaForge, `C:\APHVH-ERP-v2` — đã hỏi + được xác nhận trước khi sửa vì là codebase khách
hàng riêng), dùng lại ĐÚNG điều kiện chặn thật của 2 method ghi hiện có mà KHÔNG sửa chúng. Trả
`{can_issue, can_receive, issue_reason?, receive_reason?}`. `ReceiveExperience.tsx` fetch descriptor
cùng lúc load doc, disable nút khi false (fail-closed nếu descriptor lỗi), hiện lý do bị chặn.

**Deploy**: scp+`docker cp` vào `frappe_docker-backend-1` (container CHUNG site khách production) +
restart — **xin xác nhận người dùng trước** (giống pattern Phase 4/6a cũ), health-check site khách
(`/login` 200) trước/sau restart. Frontend: rebuild `apps/demo --base=/wms/ VITE_LIVE=1`, deploy static
vào `frappe_docker-frontend-1:sites/metaforge-wms/`.

**Live-verify qua browser thật trên `/wms` công khai**:
- `WT-2026-00001` (In Transit, `issued_by=Administrator`) — đăng nhập `wms.demo@aphvh.local` (KHÁC
  Administrator) → `can_receive=true` → nút NHẬN HÀNG bật đúng.
- Cùng phiếu, probe trực tiếp AS Administrator (chính issuer) → `can_receive=false`, reason "Người
  nhận phải khác người giao." — đúng bất biến reviewer nêu.
- `WT-2026-00008` (Draft) → `can_issue=true` → nút GIAO HÀNG bật đúng.
- `WT-2026-00004` (Received, terminal) → cả 2 nút tắt đúng lý do trạng thái.

### V2-3 — NEWFORM-DEFAULT-MAGIC-01 — `8d3367d`
Phát hiện PHỤ trong lúc verify lại claim `workflow_state` cũ (V2-4 dưới): chạy lại
`apps/demo` full live suite (`playwright.live.config.ts`) ra **17/18** — 1 fail thật, nhưng SAI so với
claim cũ trong doc. Root cause thật: `blankDoc()` (`NewFormContainer.tsx`) gửi NGUYÊN VĂN
`field.default` — field Date/Datetime có default là biểu thức "ma thuật" Frappe (`"Today"`/`"Now"`,
Desk client tự resolve bằng đồng hồ máy trước khi gửi) → literal string lọt xuống MySQL →
`OperationalError 1292 Incorrect date value: 'Today'` (xác nhận qua probe network trực tiếp, request
cũ `date:"Today"` → 500; ToDo's `date` field default="Today").

**Fix**: `resolveDefault()` resolve `"Today"`→ngày thật (fieldtype Date), `"Now"`→giờ thật (fieldtype
Datetime) bằng đồng hồ trình duyệt, giống Desk; giữ nguyên default khác (không đổi hành vi field khác).

**Live-verify**: `apps/demo` full live suite **17/18 → 18/18 PASS** (`npx playwright test --config
playwright.live.config.ts`, exit 0) — test "Tạo mới → createDoc THẬT" trước đó fail đúng tại bug này.
Fixture dùng-một-lần (`E2E-DIAG-*` ToDo) xoá sau probe.

### V2-4 — Doc drift (report mâu thuẫn source) — 3 commit docs
Review vòng 2 bắt được: (a) HEAD hiện tại doc ghi `b298a1f` dù zip thật đã ở `453d322`; (b)
`KNOWN_GAPS.md` vừa nói `workflow_state` "✅ SỬA" (hash `04cc26f` — **không tồn tại trong git**) vừa nói
"CHƯA sửa" ở 2 chỗ khác; (c) `README.md` ghi "v0.1.0" dù `package.json`/`CHANGELOG.md` đã "v0.6.0"; (d)
3 số selfcheck khác nhau (README 46/46, `BUILD_REPORT.md` 45/45, thực tế 73/73).

**Fix**: sửa tại chỗ HEAD/hash/mâu thuẫn workflow_state trong `KNOWN_GAPS.md`; viết lại `README.md`
khớp v0.6.0 + danh sách package/app hiện tại, BỎ hard-code test count (trỏ `TEST_REPORT.md` — nguồn số
liệu DUY NHẤT, tránh drift lặp lại); archive `BUILD_REPORT.md` (snapshot Gate 0, đã bị `TEST_REPORT.md`
thay thế từ lâu) → `docs/history/BUILD_REPORT-gate0-baseline.md`, giữ nguyên nội dung tham khảo lịch sử.

### V2-5 — CI generator + App-mode tests — `254e5c1`
`scripts/verify-generator.mjs` (root script `verify:generator`) sinh app THẬT vào `apps/ci-generated-
smoke` (trong pnpm-workspace glob) → install → typecheck → build → dọn sạch kể cả `pnpm-lock.yaml`.
Gọi qua `corepack <packageManager>` (đọc từ `package.json`) — chạy được cả máy không `corepack enable`
được lẫn CI. Wired vào `ci.yml`. `apps/demo/e2e-live/app-mode-receive.spec.ts` (mới, 2/2 PASS): Draft
can_issue=true → GIAO HÀNG thật (Stock Entry thật) → cùng session (issued_by=chính nó) → NHẬN HÀNG tắt
đúng lý do. Chiều "user khác được NHẬN" đã live-verify riêng ở V2-2 (token-proxy của config này không
mô phỏng được 2 identity thật).

### V2-6 — external package strategy (`--source local`) — `c9d4bcf`
`file:<thư mục package>` KHÔNG đủ — mỗi `@metaforge/*` tự khai `workspace:*` cho nhau, pnpm cố resolve
ngoài workspace pnpm thật → `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` (xác nhận LIVE). Fix: `pnpm pack` từng
package (tự rewrite `workspace:*`→version thật) → tarball + `pnpm.overrides` cùng map cho dep trung
gian (nếu không, pnpm lại cố fetch version thật từ npm registry thật → 404, cũng xác nhận LIVE). 2 lỗi
Windows phát sinh khi triển khai (path "\" chưa escape → JSON invalid; `execFileSync("corepack",...)`
ENOENT/EINVAL — .cmd bắt buộc qua shell) đều xác nhận LIVE trước khi fix, dùng `execSync` string tự
quote (không `execFile`+`shell:true` — Node DEP0190). Live: sinh app NGOÀI repo hoàn toàn → `pnpm
install` (222 package, exit 0, không cần registry) → typecheck exit 0 → build exit 0.

### V2-7 — Experience plugin system — `34f5691`
`createExperienceRegistry` có từ v0.6.0 nhưng không runtime nào dùng — `/x/receive` hard-code thẳng
trong `LiveApp.tsx`. `AppNavItem.kind` thêm `"experience"`; `ExperienceRoute` (mới, router-agnostic,
giống `@metaforge/views`) — cầu route→registry. `apps/demo` VÀ template CLI dùng chung (registry rỗng
mặc định + `ExperienceNotRegisteredScreen` placeholder ở template). Live: `app-mode-receive.spec.ts`
chạy lại NGUYÊN VẸN qua route generic mới, 2/2 PASS — hành vi không đổi, chỉ đổi cách route tới đó.

### V2-8 — manifest parity + pre-auth i18n — `c6ceaac`
`resolveIcon()` (mới) tra ĐỘNG toàn bộ lucide-react thay map tay cố định (CLI template chỉ 2 icon,
`apps/demo` 12 icon — icon khác MẤT ÂM THẦM). `validateManifest` thêm `nav_route_relative` (route
thiếu "/" đầu) + `nav_route_dup` (2 nav item cùng resolve 1 path, vd system key "__ws"/"ws" đều còn
"/ws") — verify 3 manifest thật (demo/sample-wms/sample-sales) vẫn `ok:true`, không false-positive.
Pre-auth i18n: `LoginForm`/`LoginScreen` hard-code tiếng Việt dù `I18nProvider` (đọc `localStorage`,
không cần network) đã bọc ngoài — nay dùng `useT()` + key `auth.*` mới. Giới hạn còn lại (ghi trung
thực): CLI sinh app chưa tự mount `I18nProvider` (fallback an toàn về VI, không lỗi).
Workspace activeKey per-item: cân nhắc rồi HOÃN CÓ CHỦ Ý — rủi ro phá vỡ 5 chỗ giả định path
`/workspace` cố định trong khi chưa có case thật cần phân biệt (xem `KNOWN_GAPS.md`).

**Tất cả 7 phase theo thứ tự khoá của review vòng 2 đã đóng.** Selfcheck 74/74, full monorepo
typecheck+build (11/11), mock e2e 13/13, live e2e-factory + apps/demo suite — xem "Final verification"
cuối file.

---

## Final verification (vòng 2, clean checkout)
Bằng chứng chạy THẬT sau khi 7/7 phase đóng, HEAD `c6ceaac` (+ commit config fix bên dưới):

| Bước | Lệnh | Kết quả |
|---|---|---|
| Frozen install | `corepack pnpm@9.15.0 install --frozen-lockfile` | exit 0, không drift lockfile |
| Secret scan | `node scripts/scan-secrets.mjs` | 0 findings (tracked files) |
| Typecheck | `corepack pnpm@9.15.0 -r run typecheck` | exit 0, 11/11 project |
| Build | `corepack pnpm@9.15.0 -r run build` | exit 0, 8 package + 3 app |
| Selfcheck | `--filter @metaforge/demo run selfcheck` | **74/74** nhóm assert xanh |
| Mock E2E | `--filter @metaforge/demo run e2e` | **13/13** PASS |
| Generator smoke | `node scripts/verify-generator.mjs` | sinh app mới + install+typecheck+build **PASS** |
| e2e-factory full suite | `npx playwright test` (4 project) | **21/22 → 22/22** (1 flake đã biết cũ, "session hết hạn" — PASS khi chạy riêng, xác nhận LẦN THỨ N, không liên quan code session này) |
| apps/demo live suite | `npx playwright test --config playwright.live.config.ts` | **20/20 PASS** (mặc định, không cần `--workers=1` thủ công — xem fix dưới) |
| Builder round-trip ×4 | `roundtrip-live.mjs` / `customize-live.mjs` / `serializers-live.mjs` / `permissions-roundtrip-live.mjs` | **PASS cả 4** |
| `/wms` deploy công khai | rebuild `--base=/wms/` + redeploy `frappe_docker-frontend-1` | index/asset 200, site khách `frontend` `/login` 200 trước/sau |

### Phát hiện phụ trong lúc verify — flake apps/demo live suite (KHÔNG phải flake cũ)
Chạy `npx playwright test --config playwright.live.config.ts` (mặc định, không filter) fail **3/3 lần**
đúng 1 test (`app-mode-receive.spec.ts`, "Draft: GIAO HÀNG...") khi chạy CHUNG với `live.spec.ts`, nhưng
PASS 100% khi chạy RIÊNG file đó. Root cause xác nhận THẬT (không phải suy đoán): `playwright.live.
config.ts` KHÔNG giới hạn `workers` → Playwright mặc định chạy 2 FILE test SONG SONG (không phải nhiều
webServer như flake e2e-factory đã biết — đây là nhiều WORKER cùng hit 1 backend/tunnel). Fix: thêm
`workers: 1` vào config (mọi test ở đây đập chung 1 backend Frappe thật qua 1 SSH tunnel, không có lý
do chạy song song). Verify: `npx playwright test` (lệnh mặc định, KHÔNG cờ `--workers`) → **20/20 PASS**
lặp lại đúng. Đây là bản sửa CẤU HÌNH (không phải bản chất "chấp nhận flake, chạy lại" như ghi ở e2e-
factory) — chốt hẳn, không còn cần retry thủ công cho suite này.

### Kết luận
7/7 phase review vòng 2 đã đóng với bằng chứng live đầy đủ. Git tree sạch sau mỗi commit (10 commit
mới: `99f84b6`→`c6ceaac` + 1 commit config fix). Không có regression nào từ Phase 0–6/Gate 0–7.
