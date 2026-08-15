---
name: forge-ui-change-routing
description: Route and execute Forge UI changes at the correct ownership layer. Use for sidebar/navigation/menu, field hide/show/required/read-only/labels/order, form/list/grid/workspace changes, AppManifest/routes, custom TSX experiences, shell/CSS, and UI removal/deprecation. Decides metadata vs generated brief vs vertical TSX vs shared runtime before editing.
---

# Forge UI Change Routing Skill

## 1. Mục tiêu

Skill này dùng khi yêu cầu nghe đơn giản ở phía người dùng nhưng có thể đi qua nhiều lớp UI của Forge, ví dụ:

- sửa sidebar/menu;
- ẩn/hiện/đổi tên/đổi thứ tự field;
- đổi form/list/grid/workspace;
- sửa màn TSX viết riêng;
- thêm/bỏ nút hoặc action;
- đổi route/home/navigation;
- sửa shell, spacing, CSS, icon;
- bỏ một DocType/master khỏi UI;
- sửa UI Alumdoor mà không làm hỏng runtime dùng chung.

Mục tiêu không phải nhớ một file cố định. Mục tiêu là **xác định đúng source-of-truth của surface rồi sửa owner-correct file nhỏ nhất**.

> Quy tắc gốc: `request -> surface class -> authority/source -> projection -> concrete file -> verification`.

Không bắt đầu bằng việc mở `main-base.tsx`, `AppShellV2.tsx`, `FormView` hay một file TSX lớn chỉ vì màn hình đang hiển thị ở đó.

## 2. Nguồn sự thật bắt buộc

Trước khi sửa:

1. Exact GitHub `main` + branch/PR/diff liên quan.
2. `skills/forge-enterprise-completion/SKILL.md` — risk/merge/deploy boundary cấp dự án.
3. `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md` khi task có thể chạm shared authority.
4. `client/ARCHITECTURE.md` và `client/APP_MANIFEST.md` nếu task liên quan MetaForge runtime/nav.
5. `references/SURFACE_ATLAS.md` của skill này.
6. Source/generator/test cụ thể của app đang sửa.

Nếu prose cũ mâu thuẫn exact source: **code + generator + metadata + tests + exact GitHub state thắng**.

## 3. Bước 0 — Chốt phạm vi trước khi đụng code

Tự xác định, không hỏi user nếu repo evidence đủ:

- **App/tenant scope**: Alumdoor-only, một app khác, hay toàn MetaForge.
- **Surface scope**: sidebar, form, list, grid, experience, workspace, shell, route, style.
- **Authority impact**: presentation-only hay thay đổi business/server contract.
- **Render mode**: generic metadata-driven hay custom TSX experience.
- **Artifact type**: canonical source hay generated output.

Nếu task chỉ yêu cầu một app ngừng dùng một capability, **không xóa primitive dùng chung** chỉ vì thấy tên capability còn xuất hiện trong `@metaforge/*` hoặc shared server package.

## 4. Decision tree bắt buộc

### 4.1 Yêu cầu: “sửa sidebar / menu / nhóm menu / icon / thứ tự”

Đi theo thứ tự:

1. Tìm exact nav key/DocType/label trong app brief/manifest.
2. Xác định menu được sinh từ metadata/manifest hay được chèn bởi runtime compatibility glue.
3. Search toàn repo cho key + label + route để bắt hard-code trùng.
4. Chỉ sửa `AppShellV2.tsx` nếu yêu cầu là **hành vi shell dùng chung**: collapse, group open/close, pin, mobile drawer, search, sidebar width, interaction/accessibility.
5. Chỉ sửa vertical TSX nếu chính màn experience đó có navigation/index riêng.

Routing mặc định:

- **Có/bỏ một DocType trên sidebar** -> metadata/brief/manifest của app trước.
- **Đổi label/group/icon của một mục app** -> metadata/manifest trước.
- **Pseudo-nav runtime** như Tổng quan, Báo cáo, Danh mục, Catalog, Permissions -> `client/apps/runtime/src/main-base.tsx` sau khi audit contract.
- **Cơ chế sidebar chung** -> `client/packages/shell/src/AppShellV2.tsx`.
- **Danh mục master riêng của Alumdoor** -> audit `client/apps/runtime/src/experiences/AlumdoorMasterDataScreen.tsx` cùng metadata, không sửa một phía rồi dừng.

Không tạo menu dẫn tới route/method không tồn tại.

#### 4.1.1 Sidebar/nav của Alumdoor có 3 lớp thẩm quyền — phải khớp cả 3, không phải 1

Bài học 2026-08-15 (xem thêm mục 8): sửa đúng canonical source vẫn có thể **không thấy gì đổi**, hoặc tệ hơn — **mất hẳn cả nhóm menu** — nếu bỏ sót 1 trong 3 lớp sau:

1. **Canonical source** — ví dụ `server/apps-src/alumdoor-attendance/app.json` (field `nav[].group`, `nav[].label`). Đây là nơi SỬA, nhưng KHÔNG phải nơi server đang phục vụ.
2. **D1 install snapshot** (`installed_apps.manifest_json` per tenant) — server đọc nav từ ĐÂY, một bản chụp lưu lúc app được "cài" cho tenant, KHÔNG tự đọc lại file nguồn mỗi request. Sửa (1) mà không release lại (2) thì client vẫn nhận y hệt dữ liệu cũ. Release bằng `node scripts/build-sidebar-release.mjs <app.json> <out.sql> <tenant> <from-version>` (bump `version` trong app.json trước, giá trị mới phải khác `from-version`) rồi áp bằng `wrangler d1 execute <db> --local --config <wrangler.jsonc> --file <out.sql>`, sau đó restart backend dev.
3. **Client allow-list cứng** — `client/packages/shell/src/WorkspaceAppShellV2.tsx`: `ALUMDOOR_SIDEBAR_GROUPS`, `ALUMDOOR_HR_GROUPS`, `ALUMDOOR_HR_KEYS` lọc nav theo **tên group đã chuẩn hoá** (bỏ dấu, lowercase). Đây là logic ĐẶC THÙ Alumdoor nhưng sống trong package `shell` DÙNG CHUNG — không phải nơi lý tưởng, nhưng đang là nơi THẬT đang lọc. Đổi tên group ở (1)/(2) mà quên đổi ở đây -> item bị lọc rớt hoàn toàn khỏi sidebar, im lặng, không lỗi.

**Quy trình bắt buộc khi đổi tên/gộp/tách group của Alumdoor:**

1. Sửa `group` trong app.json nguồn (1).
2. Bump `version` của app.json, release snapshot D1 (2) bằng `build-sidebar-release.mjs` + `wrangler d1 execute`.
3. Grep tên group cũ trong `WorkspaceAppShellV2.tsx` (3) — cập nhật `ALUMDOOR_SIDEBAR_GROUPS`/`ALUMDOOR_HR_GROUPS`/`ALUMDOOR_HR_KEYS` cho khớp tên mới, rebuild package `shell` (`tsc -b`, vì Vite dev resolve `dist/` chứ không phải `src/`).
4. Nếu có brief-generated mirror (`server/briefs/alumdoor-ui-rec-02-*.json` — chỉ dùng cho test/verify, KHÔNG phải nguồn server đọc) thì cũng cập nhật `alumdoor-ui-rec-02-navigation.plan.json` rồi chạy lại `node scripts/build-alumdoor-ui-rec-02-sidebar.mjs` để test không báo sai.
5. Restart backend dev, hard refresh client, xác nhận bằng mắt — 3 lớp không có cơ chế tự báo lệch nhau.

Không sửa (1) rồi dừng. Không sửa (3) trước khi chắc (2) đã release — cửa sổ giữa lúc chỉ sửa xong 1-2 lớp là lúc sidebar dễ mất trắng nhất.

### 4.2 Yêu cầu: “ẩn / hiện field”

Nếu form đang dùng generic MetaForge:

1. Sửa **DocType metadata source** trước: `hidden`, `surface`, `form.fields`, `form_region`, `depends_on` hoặc contract tương đương.
2. Nếu điều kiện ẩn/hiện phụ thuộc dữ liệu, dùng metadata expression/condition nếu engine đã hỗ trợ.
3. Không vá `FormView` để ẩn một field của riêng Alumdoor.
4. Không dùng CSS `display:none` để thay cho metadata.
5. Không coi việc ẩn UI là permission/security. Server permission vẫn phải authoritative.

Nếu field chỉ tồn tại trong một custom experience TSX thì sửa component local của experience đó.

Field kỹ thuật/audit/snapshot/idempotency/ledger key mặc định phải là internal/hidden trừ khi có user outcome rõ ràng.

### 4.3 Yêu cầu: “đổi tên / đổi thứ tự / chia section / chỉnh layout form”

Generic form:

- label/order/Section Break/Column Break/Tab Break -> metadata source;
- region/width/summary presentation -> metadata extensions nếu đã có;
- danh sách field xuất hiện trong form -> `form.fields`/metadata projection;
- renderer chỉ sửa khi **mọi DocType cùng loại đang render sai**.

Custom operational screen:

- sửa TSX experience tương ứng;
- không chuyển business formula/money/stock rule vào component;
- nếu pattern lặp từ >=2 app, xem xét nâng thành shared primitive thay vì copy TSX.

### 4.4 Yêu cầu: “sửa list / cột / filter / sort / view”

Ưu tiên:

1. app view metadata, ví dụ `server/briefs/<app>.views.json` khi app đó dùng split view contract;
2. DocType metadata như list visibility/order/filter defaults;
3. shared `@metaforge/views` chỉ khi generic ListView behavior sai cho nhiều app;
4. TSX chỉ khi đó là custom experience/list riêng.

Không hard-code một DocType ngành dọc vào shared ListView.

### 4.5 Yêu cầu: “sửa child table / grid”

Phân biệt:

- field/column tồn tại, label, required, hidden, link target -> metadata;
- conditional/applicable columns -> metadata/presentation contract trước;
- fieldtype control chung -> `client/packages/controls/**`;
- generic grid mechanics -> `client/packages/views/**`/grid owner thực tế;
- Alumdoor-specific complex row UX -> custom experience hoặc vertical extension đã có.

Server-required field phải **reachable** trước transition cần nó; không được ẩn đến mức user không có đường nhập hợp lệ.

### 4.6 Yêu cầu: “thêm/bỏ/sửa nút, action, chuyển chứng từ”

1. Tìm action contract của app, với Alumdoor audit `server/briefs/alumdoor-v2.actions.json` và main brief/generator.
2. Tìm server method/controller authoritative tương ứng.
3. Nếu action đã có contract nhưng generic form không render đúng -> audit `client/packages/views/src/detail/formActions.ts` và shared action projection.
4. Nếu nút chỉ thuộc custom experience -> TSX local.

Không tạo nút gọi method chưa tồn tại. Không đặt authoritative state transition chỉ trong `onClick` client.

### 4.7 Yêu cầu: “sửa route / home / workspace / experience”

Ưu tiên `AppManifest`/manifest source:

- `home`;
- `nav`;
- `kind` = `doctype|route|workspace|system|experience`;
- route/group/icon/label.

Shared route resolution thuộc `client/packages/core/src/app/manifest.ts` và contract liên quan. `client/apps/runtime/src/main-base.tsx` chỉ là runtime composition/glue hoặc compatibility seam đã có, không phải nơi mặc định để hard-code app nav.

Mọi nav item phải resolve tới surface thật. Không fallback ngầm mọi kind thành `/app/<key>`.

### 4.8 Yêu cầu: “sửa màn hardcode / màn nghiệp vụ đặc thù”

Tìm trong `client/apps/runtime/src/experiences/**` và các app-specific `src/**`.

TSX là đúng owner khi:

- màn là operational experience riêng;
- interaction vượt khả năng metadata hiện có;
- logic client chỉ orchestration/presentation;
- authoritative business rule vẫn ở server/domain.

TSX **không** là shortcut để né metadata chỉ vì sửa nhanh hơn.

### 4.9 Yêu cầu: “sửa giao diện chung / sidebar width / mobile / theme / component”

- shell/layout/navigation mechanics -> `client/packages/shell/**`;
- reusable visual component/token -> `client/packages/ui/**`;
- field control -> `client/packages/controls/**`;
- generic form/list renderer -> `client/packages/views/**`;
- app/runtime-only CSS -> app/runtime stylesheet tương ứng.

Không đẩy app-specific business schema vào shared packages.

### 4.10 Yêu cầu: “bỏ một menu / master / DocType khỏi Alumdoor”

Bắt buộc chạy **surface sweep**, không được sửa một file rồi kết luận xong:

1. canonical brief/source;
2. generator tạo brief;
3. split overlays: actions/integrations/views/permissions/prints nếu liên quan;
4. app manifest/navigation;
5. runtime compatibility shim;
6. custom experience/master index TSX;
7. shared controls/views chỉ để xác định đó là shared primitive hay app-only reference;
8. route/action/method references;
9. tests/fixtures/docs còn dùng làm contract.

Chỉ xóa shared primitive khi evidence chứng minh không còn consumer trong platform, không phải chỉ vì Alumdoor bỏ dùng.

## 5. Generated artifact rule — bắt buộc trước khi sửa JSON lớn

Trước khi sửa một brief/meta JSON:

1. Search tên/path file trong `server/scripts/build-*.mjs`, `apply-*.mjs`, `compile-*.mjs` và test.
2. Tìm `SRC`, `OUT`, read/write path hoặc comment “generated/derived”.
3. Nếu file là output, sửa **canonical input/generator** rồi regenerate output.
4. Nếu có overlay split riêng, xác định merge order trước khi sửa.
5. Chỉ patch output trực tiếp khi repo contract xác nhận nó là canonical authored source.

Known current example: `server/briefs/alumdoor-v2.json` được dẫn xuất từ `server/briefs/alumdoor.json` bởi `server/scripts/build-alumdoor-v2-brief.mjs`. Không mặc định vá V2 output mà bỏ qua generator.

## 6. Surface sweep protocol

Trước sửa và sau sửa, search ít nhất:

```bash
rg -n --hidden -g '!upstream/**' '<Exact DocType>' client server docs skills
rg -n --hidden -g '!upstream/**' '<nav-key-or-route>' client server docs skills
rg -n --hidden -g '!upstream/**' '<visible label>' client server docs skills
```

Với removal/deprecation, thêm:

- fieldname;
- API/method name;
- legacy alias;
- route encoded/unencoded;
- related config key.

`upstream/frappe-v16.19.0/**` là benchmark/vendor reference cho task Forge thông thường. Không sửa upstream chỉ vì search thấy cùng từ khóa ở đó.

## 7. Owner-correct file rule

Khi có nhiều file cùng chứa một key:

1. **canonical source/generator** thắng generated output;
2. **app metadata/manifest** thắng runtime hard-code nếu metadata diễn đạt được;
3. **vertical TSX** thắng shared package cho interaction đặc thù một app;
4. **shared package** thắng copy-paste khi behavior thực sự generic;
5. **server authority** thắng client computation cho money/stock/permission/workflow/business state.

Sửa số file ít nhất nhưng phải khép kín toàn bộ surface bị ảnh hưởng.

## 8. Regression mẫu bắt buộc nhớ

### 2026-08-14 — Sales Option / Sales Package bị bỏ khỏi Alumdoor nhưng UI vẫn còn

Một thay đổi đã dọn brief/platform, nhưng hai hard-code client còn sót:

- `client/apps/runtime/src/main-base.tsx` vẫn chèn menu compatibility;
- `client/apps/runtime/src/experiences/AlumdoorMasterDataScreen.tsx` vẫn liệt kê master.

Kết quả: sidebar/danh mục tạo route `/app/Sales Option` dù brief không còn surface tương ứng.

Bài học:

> Removal = **authority change + projection sweep**, không phải “xóa nơi đầu tiên tìm thấy”.

Đồng thời các reference trong shared controls không bị xóa chỉ vì Alumdoor thôi dùng nữa; scope app và scope platform phải tách rõ.

### 2026-08-15 — Gộp 2 group sidebar Alumdoor ("Chấm công & ca" + "Nhân viên & Lương" -> "Nhân sự & Tiền lương"), sửa đúng nguồn vẫn không thấy đổi, rồi mất trắng cả nhóm

Sửa `group` trong `server/apps-src/alumdoor-attendance/app.json` (đúng canonical source theo mục 4.7/4.1) — refresh UI: **không đổi gì**. Nguyên nhân: server phục vụ nav từ `installed_apps.manifest_json` trong D1 (bản snapshot chụp lúc cài app cho tenant `demo`), không đọc lại file nguồn mỗi request. Sau đó sửa tiếp allow-list client (`WorkspaceAppShellV2.tsx`) sang tên group mới mà CHƯA release D1 — kết quả **cả nhóm biến mất khỏi sidebar**: D1 vẫn trả tên group cũ, client giờ chỉ nhận tên mới, không lớp nào khớp lớp nào -> bị lọc rớt toàn bộ, im lặng, không log lỗi.

Khắc phục đúng thứ tự: bump version app.json -> `node scripts/build-sidebar-release.mjs apps-src/alumdoor-attendance/app.json out.sql demo <old-version>` -> `wrangler d1 execute cloudforge-demo --local --config apps/tenant-worker/wrangler.alumdoor-local.jsonc --file out.sql` -> restart backend dev -> lúc này cả 3 lớp mới khớp nhau.

Bài học:

> Sidebar Alumdoor có 3 lớp thẩm quyền (nguồn, D1 snapshot, client allow-list — xem mục 4.1.1), không phải 1. "Sửa đúng file nguồn" là điều kiện CẦN, không phải ĐỦ — phải release D1 rồi mới đến việc đồng bộ allow-list client, không được đảo thứ tự.

Cơ chế 3 lớp này tự nó là nợ kỹ thuật (không có gì tự báo lệch), nhưng đang hoạt động đúng và việc thay bằng flag tường minh trên manifest là việc lớn, đụng nhiều app khác — không refactor tùy tiện khi chưa có yêu cầu rõ ràng đủ lớn để đánh đổi rủi ro.

## 9. Verification matrix

### UI FAST — presentation-only

Ví dụ: spacing, icon, label, grouping, CSS, TSX presentation không đổi authoritative behavior.

Tối thiểu:

```bash
cd client
pnpm typecheck
pnpm lint
```

Sau đó targeted build/test của package/app bị ảnh hưởng và visual/browser check nếu chạy được.

### Metadata / brief projection

Với Alumdoor metadata:

```bash
cd server
npm run brief:check
npm run verify:alumdoor-meta
node scripts/verify-backend-ui-contracts.mjs
```

Nếu generator là owner, regenerate theo generator hiện hành trước các gate trên.

Sau đó chạy client typecheck/build nếu thay đổi ảnh hưởng render contract.

### Shared runtime/shell/views/controls

Tối thiểu:

```bash
cd client
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Thêm targeted E2E/browser/screenshot cho surface sửa nếu có fixture phù hợp.

### Removal/deprecation

Ngoài gate theo layer:

- chạy lại surface sweep;
- xác nhận không còn dead nav/route/action;
- xác nhận shared primitive không bị xóa nhầm;
- xác nhận generated source/output nhất quán.

## 10. Risk + merge boundary

Tuân `forge-enterprise-completion`:

- **UI-only FAST**: sau khi chứng minh blast radius và gate xanh, được đi fast-path merge/deploy theo policy dự án.
- **Backend/schema/migration/business rule/shared authoritative contract**: branch + PR + verify, dừng trước merge/deploy nếu chưa có explicit authorization.
- Metadata đổi requiredness, workflow reachability, money/stock/legal behavior hoặc server contract không được tự gọi là UI-only chỉ vì file là JSON.
- Permission visibility client chỉ là UX; server permission vẫn authoritative.

## 11. Dependency Request / NO-STOP

Nếu phát hiện cần thay shared contract thuộc owner khác:

```text
Dependency Request
- Needed contract: <...>
- Current owner: <package/workstream>
- Why UI cannot safely solve locally: <...>
- Evidence: <file/test/route>
- Independent work continued: <...>
```

Không dừng toàn task vì blocker cục bộ. Tiếp tục mọi phần có thể tách an toàn.

## 12. Definition of Done

Một UI task chỉ DONE khi:

- request đã được classify đúng surface;
- canonical source/generator đã được xác định;
- không có app-specific hard-code bị đưa nhầm vào shared runtime;
- pre/post surface sweep đã chạy cho removal/nav-sensitive change;
- route/action có destination thật;
- field required/hidden vẫn reachable đúng nghiệp vụ;
- permission không dựa vào client hide;
- relevant typecheck/lint/build/test/brief validators xanh;
- visual/browser evidence có khi surface material;
- diff không chứa unrelated cleanup;
- merge/deploy boundary đúng risk class.
