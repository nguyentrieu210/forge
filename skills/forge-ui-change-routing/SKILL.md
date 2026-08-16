---
name: forge-ui-change-routing
description: Route and execute Forge UI changes at the correct ownership layer. Use for sidebar/navigation/menu, field hide/show/required/read-only/labels/order, form/list/grid/workspace changes, AppManifest/routes, custom TSX experiences, shell/CSS, UI removal/deprecation and generated metadata projection.
---

# Forge UI Change Routing Skill

## 1. Mục tiêu

Skill này dùng khi yêu cầu UI có thể đi qua nhiều lớp của Forge:

- sidebar/menu/navigation;
- field hide/show/required/read-only/label/order;
- form/list/grid/workspace;
- custom TSX experience;
- action/button/route/home;
- shell/CSS/theme/mobile;
- bỏ một DocType/master/surface khỏi app.

Mục tiêu là **xác định đúng source-of-truth rồi sửa owner-correct file nhỏ nhất**, không mở file TSX lớn đầu tiên search thấy.

> `request -> surface class -> authority/source -> projection -> concrete file -> verification`

## 2. Nguồn sự thật bắt buộc

Trước khi sửa:

1. Exact GitHub `main` + branch/PR/diff liên quan.
2. `SENTRUX_MAP.md` — frontend ownership, runtime spine và dependency boundary.
3. `.sentrux/rules.toml` — committed architecture blockers.
4. `skills/forge-enterprise-completion/SKILL.md` — risk/merge/deploy + Sentrux governance cấp dự án.
5. `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md` nếu có thể chạm shared authority.
6. `docs/ARCHITECTURE.md` và client-specific architecture/manifest docs nếu task liên quan MetaForge runtime/nav.
7. `references/SURFACE_ATLAS.md` của skill này.
8. Canonical source/generator/test cụ thể của app đang sửa.

Nếu prose cũ mâu thuẫn exact source: **code + generator + metadata + tests + GitHub state thắng**.

## 3. Bước 0 — Chốt phạm vi

Tự xác định:

- **App/tenant scope**: Alumdoor-only, app khác hay toàn MetaForge.
- **Surface scope**: sidebar, form, list, grid, experience, workspace, shell, route, style.
- **Authority impact**: presentation-only hay thay đổi business/server contract.
- **Render mode**: metadata-driven hay custom TSX.
- **Artifact type**: canonical source hay generated output.
- **Sentrux owner**: package/path nào trong `SENTRUX_MAP.md` và dependency nào không được kéo ngược.

Nếu một app ngừng dùng capability, không xóa primitive dùng chung chỉ vì vertical không còn consumer.

## 4. Decision tree bắt buộc

### 4.1 Sidebar / menu / group / icon / order

Đi theo thứ tự:

1. Tìm exact nav key/DocType/label trong app brief/manifest.
2. Xác định nav được sinh từ metadata hay runtime compatibility glue.
3. Search key + label + route toàn repo để bắt hard-code trùng.
4. Chỉ sửa shared shell khi yêu cầu là generic shell mechanics.
5. Chỉ sửa vertical TSX nếu surface đó có navigation/index riêng.

Routing mặc định:

- Có/bỏ DocType trên sidebar -> metadata/brief/manifest trước.
- Label/group/icon app-specific -> metadata/manifest trước.
- Runtime pseudo-nav -> `client/apps/runtime/**` sau khi audit contract.
- Shared sidebar mechanics -> `client/packages/shell/**`.
- Alumdoor master index -> audit vertical experience + metadata cùng lúc.

Không tạo menu dẫn tới route/method không tồn tại.

#### 4.1.1 Alumdoor sidebar hiện có 3 lớp phải đồng bộ

Khi rename/gộp/tách group Alumdoor, kiểm tra cả:

1. **Canonical source** — app manifest/app.json/brief source.
2. **Installed tenant snapshot** — `installed_apps.manifest_json` hoặc release projection tương đương.
3. **Client allow-list/compatibility seam** — nếu runtime/shell hiện còn hard-code filter/group key.

Quy trình an toàn:

1. sửa canonical source;
2. bump/release snapshot theo script hiện hành;
3. cập nhật client allow-list/compatibility seam nếu vẫn tồn tại;
4. regenerate test/brief mirrors nếu có;
5. rebuild package liên quan;
6. restart/hard refresh và browser verify.

Không sửa client allow-list trước khi tenant snapshot đã dùng group mới; mismatch có thể làm cả nhóm biến mất im lặng.

Cơ chế 3 lớp này là debt kỹ thuật. Không nhân rộng nó; khi có cơ hội refactor đủ scope, ưu tiên đưa authority về manifest/metadata rõ ràng.

### 4.2 Hide / show / required / read-only field

Generic MetaForge form:

1. sửa DocType/metadata source trước;
2. dùng metadata condition/expression nếu engine hỗ trợ;
3. không vá `FormView` cho một field vertical-specific;
4. không dùng CSS hide thay metadata;
5. không coi client hide là permission.

Custom TSX experience: sửa component local nếu field chỉ tồn tại ở experience đó.

Field audit/snapshot/idempotency/ledger key mặc định internal/hidden trừ khi có user outcome rõ.

### 4.3 Label / order / section / form layout

Generic form:

- label/order/section/column/tab -> metadata;
- region/width/summary -> metadata extension nếu có;
- field list -> form/metadata projection;
- shared renderer chỉ sửa khi behavior generic đang sai cho nhiều DocType/app.

Custom operational screen: TSX local, nhưng business formula/money/stock rule vẫn ở server/domain.

### 4.4 List / column / filter / sort / view

Ưu tiên:

1. app view metadata/split view contract;
2. DocType metadata;
3. `client/packages/views/**` chỉ cho generic behavior;
4. TSX khi là custom experience/list riêng.

Không hard-code một vertical DocType vào shared ListView.

### 4.5 Child table / grid

- field/label/required/hidden/link -> metadata;
- applicable/conditional columns -> presentation contract trước;
- field control chung -> `client/packages/controls/**`;
- generic grid mechanics -> `client/packages/views/**`;
- vertical row UX phức tạp -> vertical experience/extension.

Server-required field phải reachable trước transition cần nó.

### 4.6 Button / action / state transition

1. tìm app action contract;
2. tìm server method/controller authoritative;
3. nếu contract có mà generic form render sai -> shared action projection;
4. nếu nút chỉ thuộc custom experience -> TSX local.

Không tạo nút gọi method chưa tồn tại. Không đặt authoritative state transition chỉ trong `onClick`.

### 4.7 Route / home / workspace / experience

Ưu tiên AppManifest/manifest source cho `home`, `nav`, `kind`, route/group/icon/label.

Shared route resolution thuộc shared core contract. `client/apps/runtime/**` là composition/compatibility seam, không phải default place để hard-code app nav.

Mọi nav item phải resolve tới surface thật.

### 4.8 Hard-coded operational experience

TSX là đúng owner khi:

- surface là operational experience riêng;
- interaction vượt khả năng metadata hiện tại;
- client chỉ orchestration/presentation;
- authoritative rule vẫn ở server/domain.

TSX không phải shortcut để né metadata.

### 4.9 Shared UI / shell / theme

- shell/layout/nav mechanics -> `client/packages/shell/**`;
- reusable visual primitive/token -> `client/packages/ui/**`;
- field control -> `client/packages/controls/**`;
- generic form/list/grid -> `client/packages/views/**`;
- app/runtime CSS -> app/runtime stylesheet.

Không đẩy app-specific schema/business rule vào shared package.

### 4.10 Removal / deprecation

Bắt buộc chạy surface sweep:

1. canonical source;
2. generator;
3. split overlays;
4. app manifest/nav;
5. runtime compatibility shim;
6. custom experience/master index;
7. route/action/method;
8. tests/fixtures/docs còn dùng làm contract;
9. shared primitive consumer check.

> Removal = **authority change + projection sweep**, không phải xóa nơi đầu tiên tìm thấy.

## 5. Generated artifact rule

Trước khi sửa JSON/meta/brief lớn:

1. search path trong `build-*`, `apply-*`, `compile-*`, tests;
2. tìm `SRC`, `OUT`, generated/derived markers;
3. nếu là output, sửa canonical input/generator rồi regenerate;
4. xác định overlay merge order;
5. chỉ patch output trực tiếp khi repo contract xác nhận output đó là authored authority.

Generated artifact không được trở thành source-of-truth thứ hai.

## 6. Surface sweep protocol

Trước và sau sửa, search ít nhất:

```bash
rg -n --hidden -g '!upstream/**' '<Exact DocType>' client server docs skills
rg -n --hidden -g '!upstream/**' '<nav-key-or-route>' client server docs skills
rg -n --hidden -g '!upstream/**' '<visible label>' client server docs skills
```

Với removal/deprecation, thêm fieldname, API/method, alias, route encoded/unencoded và config key.

`upstream/**` là benchmark/vendor reference; không sửa upstream chỉ vì search thấy từ khóa.

## 7. Owner-correct file rule

Khi nhiều file cùng chứa key:

1. canonical source/generator thắng generated output;
2. app metadata/manifest thắng runtime hard-code nếu metadata diễn đạt được;
3. vertical TSX thắng shared package cho interaction đặc thù một app;
4. shared package thắng copy-paste khi behavior generic;
5. server authority thắng client computation cho money/stock/permission/workflow/business state;
6. leaf/subpath import thắng broad root barrel khi contract cho phép và giúp giảm dependency depth.

Sửa ít file nhất nhưng phải khép kín toàn bộ surface.

## 8. Sentrux rules cho UI work

### 8.1 Khi chỉ presentation FAST

Không cần tối ưu score. Chỉ cần:

- committed `.sentrux/rules.toml` không bị phá;
- không kéo app-specific dependency vào shared package;
- không tạo cross client/server implementation import mới;
- targeted typecheck/build/test/visual evidence xanh.

### 8.2 Khi refactor shared runtime/shell/views/controls

Trước sửa:

```bash
sentrux gate --save .
```

Sau sửa:

```bash
sentrux check .
sentrux gate .
```

Nếu score tăng nhưng behavior/nav/form/grid regress thì thay đổi vẫn FAIL.

### 8.3 Khi topology đổi

Nếu move/split package, đổi public barrel, đổi runtime spine hoặc ownership boundary:

- cập nhật `SENTRUX_MAP.md` cùng PR;
- chỉ siết `.sentrux/rules.toml` khi exact branch pass;
- strict diagnostics có thể ghi known debt nhưng không overwrite committed rules.

## 9. Regression mẫu bắt buộc nhớ

### Removal nhưng UI vẫn còn

Một capability có thể đã bị dọn khỏi brief/platform nhưng runtime compatibility menu hoặc vertical master index vẫn còn. Kết quả là dead route/surface.

Bài học: luôn chạy surface sweep trước + sau removal.

### Sidebar source sửa đúng nhưng UI không đổi

Canonical source có thể khác installed tenant snapshot. Nếu client allow-list cũng tồn tại thì đổi sai thứ tự có thể làm group biến mất.

Bài học: source -> release projection -> client seam -> rebuild -> browser verify.

## 10. Verification matrix

### UI FAST

Tối thiểu:

```bash
cd client
pnpm typecheck
pnpm lint
```

Thêm targeted package/app build/test và visual/browser check khi material.

### Metadata / brief projection

Chạy generator/brief validators hiện hành, backend-ui contract validators, sau đó client typecheck/build nếu render contract đổi.

### Shared runtime / shell / views / controls

Tối thiểu:

```bash
cd client
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Thêm targeted E2E/browser/screenshot và Sentrux baseline/gate cho structural refactor.

### Removal/deprecation

Ngoài gate theo layer:

- surface sweep lần hai;
- không còn dead nav/route/action;
- shared primitive không bị xóa nhầm;
- canonical/generated projection nhất quán.

## 11. Risk + merge boundary

Tuân `forge-enterprise-completion`:

- **UI-only FAST**: fast-path sau khi chứng minh blast radius và gate xanh.
- **Backend/schema/migration/business rule/shared authoritative contract**: branch + PR + verify, dừng trước merge/deploy nếu chưa có explicit authorization.
- Metadata đổi requiredness, workflow reachability, money/stock/legal behavior hoặc server contract không tự động là UI-only chỉ vì nằm trong JSON.
- Permission visibility client chỉ là UX.

## 12. Dependency Request / NO-STOP

Nếu UI cần shared contract thuộc owner khác:

```text
Dependency Request
- Needed contract: <...>
- Current owner: <package/workstream>
- Why UI cannot safely solve locally: <...>
- Evidence: <file/test/route>
- Independent work continued: <...>
```

Không duplicate primitive để né blocker.

## 13. Definition of Done

UI task chỉ DONE khi:

- surface được classify đúng;
- canonical source/generator xác định;
- owner khớp `SENTRUX_MAP.md`/exact graph;
- không app-specific hard-code mới trong shared runtime;
- removal/nav-sensitive change có pre/post sweep;
- route/action có destination thật;
- required/hidden field vẫn reachable;
- permission không dựa client hide;
- relevant typecheck/lint/build/test/brief validators xanh;
- visual/browser evidence có khi material;
- committed Sentrux rules pass;
- structural refactor không regress baseline;
- diff không chứa unrelated cleanup;
- merge/deploy boundary đúng risk class.
