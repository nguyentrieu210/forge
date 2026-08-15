# Forge UI Surface Atlas

> Companion reference for `../SKILL.md`.
>
> This atlas is a routing aid, **not a promise that a path will never move**. Always resolve exact current `main`, search the target key, and identify generator/source ownership before editing.

## 1. Architecture map

| Layer | Current anchor | Owns | Must not own |
|---|---|---|---|
| App metadata / brief | `server/briefs/**` | DocType projection, labels, fields, form/list metadata, menu discoverability, app overlays | generic React mechanics |
| Brief generation | `server/scripts/build-*.mjs`, `server/scripts/lib/compile-brief.mjs`, app-specific apply scripts | derived brief construction, metadata overlays | hand-authored UI interaction |
| App manifest core | `client/packages/core/src/app/manifest.ts` | manifest validation, home/nav path semantics | vertical schema |
| Runtime composition | `client/apps/runtime/src/main-base.tsx` | app manifest fetch, runtime routes, pseudo-nav, compatibility glue, experience registration/composition | default home for app-specific hard-coded schema when manifest can express it |
| Shell | `client/packages/shell/**` | shared sidebar/header/nav mechanics, auth chrome, command/workspace shell | Alumdoor-only fields/business rules |
| Shared views | `client/packages/views/**` | generic FormView/ListView/SplitView/DoctypeWorkspace/action projection | one-tenant UI exceptions when metadata or experience can own them |
| Shared controls | `client/packages/controls/**` | fieldtype/control behavior, complex reusable controls | removal of a platform primitive just because one vertical stops consuming it |
| Shared visual primitives | `client/packages/ui/**` | design-system components/tokens | business rules |
| Vertical/runtime experiences | `client/apps/runtime/src/experiences/**` | rich operational screens specific to an experience/vertical | reusable platform authority |
| Runtime app styles | `client/apps/runtime/src/styles.css`, app-specific stylesheets | runtime-only visual overrides | permission/business authority |
| Server authority | `server/packages/**`, `server/apps-src/**`, controllers/services/migrations | money, stock, workflow, permission, document lifecycle, side effects | presentation-only concerns |
| Vendored reference | `upstream/frappe-v16.19.0/**` | source-exact benchmark/reference | normal Forge UI edits |

## 2. Request-to-file routing matrix

| User request pattern | First place to inspect | Secondary sweep | Edit shared runtime only when |
|---|---|---|---|
| “Cho mục X hiện/ẩn ở sidebar” | App brief/manifest; for Alumdoor start `server/briefs/alumdoor-v2.json` ownership chain and split nav/sidebar sources | `client/apps/runtime/src/main-base.tsx`, custom master/index TSX, exact route | the sidebar mechanism itself is wrong for multiple apps |
| “Đổi tên mục menu / đổi nhóm / icon” | manifest/brief nav metadata | compatibility shim + custom indexes | generic rendering ignores manifest metadata |
| “Sidebar rộng/hẹp, collapse, group mở/đóng, pin, mobile” | `client/packages/shell/src/AppShellV2.tsx` | shell CSS/UI primitives | this is already shared behavior by definition |
| “Ẩn field X khỏi form” | DocType metadata source/generator | `form.fields`, `surface`, custom experience | FormView ignores canonical hidden metadata globally |
| “Hiện field X khi điều kiện Y” | metadata `depends_on`/visibility contract | resolver support in core/views if unsupported generically | missing generic primitive is proven and reusable |
| “Field chỉ đọc / bắt buộc” | metadata + server authority/reachability | permissions/controller validation | generic renderer fails to honor metadata |
| “Đổi label/thứ tự/section/column/layout” | metadata source/generator | form extension keys, custom experience | generic layout engine has a cross-app defect |
| “Đổi cột list/filter/sort” | view metadata / DocType list metadata | `server/briefs/<app>.views.json`, generic ListView | same behavior is needed across apps |
| “Sửa child grid” | child DocType metadata + parent Table field | controls/views/grid owner, custom TSX | generic grid mechanics/control behavior is faulty |
| “Thêm nút/chuyển chứng từ” | action contract + server method | `client/packages/views/src/detail/formActions.ts`, experience TSX | generic action projection is incomplete |
| “Sửa trang Tổng quan/Báo cáo/Danh mục/Permissions” | `client/apps/runtime/src/main-base.tsx` route/pseudo-nav composition | actual experience/workspace component | runtime pseudo-route contract itself is the owner |
| “Sửa Danh mục Alumdoor” | `client/apps/runtime/src/experiences/AlumdoorMasterDataScreen.tsx` plus canonical brief/manifest | `main-base.tsx` and route search | shared master-data primitive is being introduced intentionally |
| “Sửa màn vận hành riêng” | matching file under `client/apps/runtime/src/experiences/**` | registration/routes in `main-base.tsx`, API methods | reusable primitive clearly spans multiple apps |
| “Bỏ DocType/master X khỏi Alumdoor” | canonical source + generator | integrations/actions/views/permissions/prints, main-base, experience indexes, route/API/test references | platform itself also removes the capability |
| “Sửa theme/component chung” | `client/packages/ui/**` or `client/packages/shell/**` | runtime CSS | the component/behavior is truly reusable |
| “Sửa permission bằng cách ẩn UI” | **Do not solve only in UI**; inspect server permission contract | UI visibility only as projection | never as security authority |

## 3. Alumdoor metadata topology — current anchors

Current `server/briefs/` includes these Alumdoor-related files:

- `alumdoor.json` — base brief used by the current V2 builder.
- `alumdoor-v2.json` — current V2 output; audit generator ownership before touching.
- `alumdoor-v2.actions.json` — action overlay/contract.
- `alumdoor-v2.integrations.json` — integration/external DocType declarations.
- `alumdoor-v2.permissions.json` — permission overlay.
- `alumdoor-v2.prints.json` — print projection.
- `alumdoor-v2.views.json` — view projection.
- `alumdoor-ui-rec-02-navigation.plan.json` — historical/reconciliation navigation plan; do not assume current authority merely because it exists.
- `alumdoor-ui-rec-02-sidebar.json` — historical/reconciliation sidebar artifact; verify whether active before editing.

Current builder:

```text
server/scripts/build-alumdoor-v2-brief.mjs
  SRC -> server/briefs/alumdoor.json
  OUT -> server/briefs/alumdoor-v2.json
```

Therefore, a change to V2 must first answer:

1. Is the desired field/nav state inherited from `alumdoor.json`?
2. Is it mutated by `build-alumdoor-v2-brief.mjs`?
3. Is it subsequently modified by another overlay/build/apply script?
4. Is a split `.actions/.views/.integrations/.permissions/.prints` file authoritative for this concern?

Do not answer these from filename intuition; search actual read/write references.

## 4. Runtime navigation topology — current anchors

### `client/apps/runtime/src/main-base.tsx`

Current responsibilities include:

- manifest loading/validation;
- building runtime navigation from `manifest.nav`;
- pseudo-nav such as `Tổng quan`, `Báo cáo`, `Danh mục`, app catalog and system tools;
- cross-app workspaces;
- route registration/composition;
- selected compatibility shims for older manifests;
- experience composition.

This makes it a **high-risk drift hotspot**: app-specific compatibility entries can survive after the app's metadata changes.

Rule: every app-specific key introduced or removed here must be swept against the canonical app manifest/brief and any custom index screen.

### `client/packages/shell/src/AppShellV2.tsx`

Current responsibilities include shared mechanics such as:

- grouping `props.nav`;
- active group behavior;
- collapse state;
- mobile drawer;
- pinning;
- sidebar search;
- navigation interaction/accessibility;
- shell layout/width.

It consumes nav; it is normally **not** the source of which Alumdoor DocTypes exist.

## 5. Custom experience topology — current anchors

`client/apps/runtime/src/experiences/` currently contains app/operational screens including:

- `AlumdoorMasterDataScreen.tsx`;
- `AlumdoorOperationsCenter.tsx`;
- `AlumdoorAttendanceKiosk.tsx`;
- `AlumdoorAttendanceOperations.tsx`;
- `AlumdoorAttendanceScanner.tsx`;
- `AlumdoorHrPayrollLite.tsx`;
- `ApprovalInbox.tsx`;
- `DailyDetailedLedger.tsx`;
- `SocialCommerce.tsx`.

When user names a screen concept rather than a DocType, search here early. When user names a normal DocType form/list, metadata remains the default owner.

## 6. Metadata-driven form behavior

From the current MetaForge architecture:

```text
DocType metadata
  -> adapter normalizeMeta
  -> resolveMeta(meta, { doc, roles, maskedFields, forceReadOnly })
  -> field state: hidden / masked / locked / editable
  -> FormView/ListView/controls
```

Implications:

- A one-DocType hide/show change normally belongs in metadata.
- `FormView` should not acquire `if (doctype === "Sales Order") ...` style vertical branches.
- Permission enforcement is server-side; field state is UI projection.
- Builder preview and runtime form share renderer behavior, so a generic renderer fix can have broad blast radius.

## 7. Navigation/manifest behavior

Current manifest concepts:

```text
AppManifest
- id
- name
- brand
- locale
- home
- nav[]

AppNavItem.kind
- doctype
- route
- workspace
- system
- experience
```

Use manifest data for app navigation whenever possible. Generic resolution belongs to core manifest helpers. A `kind` must not silently become a DocType route.

## 8. Backend/UI surface reconciliation rules to reuse

For every material surface, compare:

- schema existence/source;
- operator-visible fields;
- child/link targets;
- required/read-only/hidden/internal semantics;
- `depends_on`, `mandatory_depends_on`, `read_only_depends_on`;
- `fetch_from`/preview outputs;
- permission;
- navigation;
- list/form/grid/workspace projection;
- actions;
- correction/cancel path when relevant.

Important distinctions:

- `metadata_present != visible_to_operator`;
- backend field can be intentionally internal;
- a required field must be reachable, not necessarily permanently visible;
- a configuration master may intentionally have no nav only with a recorded reason.

## 9. Case study: `dd06bbc` — why surface sweep exists

Commit `dd06bbc4277acc09f0e04f0d5eeb18023920c9ab` fixed an incomplete removal of Alumdoor `Sales Option` / `Sales Package`.

What had happened:

1. Earlier change removed the concepts from Alumdoor brief/platform path.
2. Two independent client hard-codes remained:
   - `client/apps/runtime/src/main-base.tsx` compatibility injection;
   - `client/apps/runtime/src/experiences/AlumdoorMasterDataScreen.tsx` master group entries.
3. UI still offered routes to a surface no longer declared by Alumdoor.
4. Shared controls references were intentionally left because they were platform primitives, not Alumdoor-only ownership.

This is the canonical regression for any request containing words like:

- bỏ;
- xóa;
- ẩn hoàn toàn;
- không dùng nữa;
- gỡ khỏi danh mục;
- gỡ khỏi sidebar.

## 10. Search recipes

### Find all projections of one DocType

```bash
rg -n --hidden -g '!upstream/**' 'Sales Order' client server docs skills
```

### Find metadata field ownership

```bash
rg -n --hidden -g '!upstream/**' 'fieldname.*responsible_person|responsible_person:' server/briefs server/scripts server/apps-src
```

### Find nav aliases/labels

```bash
rg -n --hidden -g '!upstream/**' 'Danh mục|__master-data|/master-data' client server
```

### Detect generated output ownership

```bash
rg -n --hidden 'alumdoor-v2\.json|OUT.*alumdoor-v2|writeFileSync.*alumdoor-v2' server/scripts
```

### Removal sweep

```bash
rg -n --hidden -g '!upstream/**' 'Sales Option|Sales Package|sales_option|sales_package' client server docs skills
```

Then classify every remaining hit as:

- correct shared primitive;
- correct historical/evidence reference;
- active app projection that must change;
- dead compatibility/hard-code;
- test fixture requiring update;
- unrelated domain usage.

Do not use raw hit count as proof of completion.

## 11. Existing validators/gates worth invoking

Server-side current anchors:

- `server/scripts/verify-alumdoor-meta-completeness.mjs`;
- `server/scripts/verify-backend-ui-contracts.mjs`;
- `server/scripts/verify-first-party-meta.mjs`;
- `server/scripts/audit-backend-ui-surfaces.mjs` — useful architecture/evidence pattern, but its historical row assumptions may be stale; do not treat its old Sales Option expectations as current product truth without re-audit;
- `server/scripts/forge-app.mjs` via `npm run brief:check`.

Client current gates:

- `pnpm typecheck`;
- `pnpm lint`;
- `pnpm test`;
- `pnpm build`;
- targeted app/browser E2E where material.

## 12. Common wrong turns

### Wrong: “Sidebar bug -> edit AppShellV2”

Why wrong: Shell renders `props.nav`; missing/extra app entries are usually upstream metadata/manifest/runtime-composition issues.

### Wrong: “Hide one field -> add condition in FormView”

Why wrong: This forks vertical schema into shared renderer and bypasses metadata-driven design.

### Wrong: “User cannot click it -> hide button”

Why wrong: Client hide is not server permission or workflow enforcement.

### Wrong: “Output JSON has desired line -> patch it”

Why wrong: Generator may overwrite the patch on next build.

### Wrong: “Alumdoor no longer uses X -> delete every X reference”

Why wrong: shared platform controls/domain capability may still be valid for other apps.

### Wrong: “Search found upstream Frappe file -> edit it”

Why wrong: vendored upstream is source-exact reference unless an explicit upstream-refresh task says otherwise.

### Wrong: “One TSX file works faster -> put business calculation there”

Why wrong: server remains authority for money, stock, workflow, permission and document lifecycle.

## 13. Fast classification examples

### Example A — “Ẩn Nhóm khách hàng trên form Đơn bán hàng”

Likely route:

```text
Sales Order generic form
-> find field metadata owner
-> inspect build-alumdoor-v2-brief.mjs + base brief
-> set projection hidden/remove from form list at canonical source
-> regenerate
-> brief validators
-> client typecheck/render check
```

Do not start in `FormView`.

### Example B — “Bỏ Báo giá khỏi sidebar nhưng vẫn giữ DocType để link trực tiếp”

Likely route:

```text
navigation-only request
-> keep schema/controller
-> set app navigation/menu projection off at canonical metadata/manifest
-> sweep main-base compatibility + custom indexes
-> verify direct route remains valid if explicitly required
```

### Example C — “Thu sidebar từ 17rem xuống 15rem”

Likely route:

```text
shared shell presentation
-> AppShellV2.tsx / shell styling
-> test Vietnamese long labels + collapse/mobile
-> typecheck/lint + visual evidence
```

### Example D — “Đơn bán hàng cần màn riêng giống Excel”

Likely route:

```text
interaction complexity exceeds generic metadata
-> custom operational experience TSX may be correct
-> keep document/pricing authority server-side
-> route/manifest registration
-> shared primitives only for reusable controls
```

### Example E — “Xóa hẳn Cách bán/Gói bán khỏi Alumdoor”

Likely route:

```text
business + UI removal, not UI-only
-> scope tenant vs platform
-> brief/generator/integrations
-> server consumers
-> runtime nav shim
-> master index TSX
-> shared controls classification
-> tests + full surface sweep
-> non-UI merge boundary applies
```
