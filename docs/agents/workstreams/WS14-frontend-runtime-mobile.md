# WS14 — MetaForge Frontend Runtime / Mobile / Offline / A11y

Status: **BLOCKED — independent Phase B slices merged; shared-contract/release evidence pending**  
Owner: **gpt-ws14**  
Branch: `agent/ent-14-frontend-runtime-mobile`  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Exact GitHub state/code wins this handoff if later commits move `main`.

## Mission

Harden shared MetaForge runtime instead of letting each domain fork UI: form/list/report/action/workspace consistency, mobile/offline, accessibility, performance, shared controls and UX architecture.

## Ownership guard

- Own: `client/apps/runtime/**`, shared `client/packages/core|ui|controls|views|shell/**` architecture, routing/renderers, generic forms/lists/tables/actions, PWA/mobile/offline contracts, accessibility/performance/design-system primitives.
- UI state is never authoritative for permission/business rules.
- Do not hard-code domain schema into generic runtime when metadata/manifest can express it.
- Collaboration/search/notification feature ownership is WS15; WS14 only owns shared renderer primitives consumed by it.

## Phase A exact-state audit — 2026-08-03

### Runtime/renderers

- Generic runtime/router is metadata-first for list/form/workspace/overview/report/action/screen/import and lazy-loads the main renderer families.
- `/page/:page` and `/dashboard/:page` still route to `DeskFallback`.
- Client `AppManifest` and server app-registry expose metadata-driven `screen`/`action` primitives, but current app-package contract has no first-class generic Page/Dashboard payload. Implementing a client-only renderer would invent a second contract.
- Command palette and permission-aware global search are already wired through shared shell/adapter.

### Mobile/a11y

- Shared List already has mobile cards, desktop virtualization, roving keyboard focus, column preferences/pinning/resize/order and pull-to-refresh.
- Audit found duplicated business-context rendering in the mobile shell, missing drawer Escape/focus semantics, horizontally-scroll-only extension child grids and unstable pull-to-refresh listener lifecycle. Those independent gaps are now merged below.

### PWA/offline

- Audited baseline had no web app manifest, service-worker registration, IndexedDB cache, offline write queue, background sync or conflict handling.
- Installability can be separated from offline semantics; an empty service worker is not used to fake offline maturity.
- Real offline read/write/sync must preserve tenant/session boundaries, stale-release behavior and write-conflict semantics before `U01-003..007` can advance.

### Bundle/performance

- Runtime already lazy-loads most route renderer families.
- Print PDF correctly dynamic-imports `html2canvas` and `jspdf` only when the user requests PDF download.
- Runtime still imports assistant/print/recent-doc utilities through the root `@metaforge/views` barrel; subpath/lazy splitting is a plausible optimization, but no exact chunk measurement/build is available in this environment. No blind `manualChunks` or import surgery is merged without build evidence.

## Capability maturity after autonomous pass

- `U01-001 Responsive PWA`: **Wired** — responsive shell/list/child-grid paths improved; browser/deploy evidence is still insufficient for RC.
- `U01-002 Installable PWA`: **Wired** — manifest/install metadata merged; real-browser installation evidence still missing.
- `U01-003 Offline read/cache`: **Missing**.
- `U01-004 Offline write queue`: **Missing**.
- `U01-005 Background sync`: **Missing**.
- `U01-006 Conflict detection`: **Missing**.
- `U01-007 Conflict resolution UX`: **Missing**.
- `N03-001 Global Search`: **Wired**.
- `N03-008 Command Palette`: **Wired**.

## Phase B slice 1 — mobile shell/a11y/offline truthfulness

Risk: **FAST / UI-only**.

- PR `#315`, squash merge `f2d46105ca30c368ee4e9bdcf78cdcdb85dc7162`.
- Render business context once per viewport: desktop topbar at `lg+`, dedicated context row below `lg`.
- Mobile navigation now has a stable controlled-region id, labelled navigation landmark, `aria-controls`, `aria-expanded`, Escape close and focus restoration.
- Offline banner no longer promises cached reads or queued resend that do not exist.
- `client/scripts/check-app-shell-mobile.mjs` is wired into client lint.
- No public `AppShellProps`, backend/API/schema/permission/business invariant changes.

## Phase B slice 2 — installable PWA foundation

Risk: **FAST / UI-only**.

- PR `#325`, squash merge `27fb7273593d1bae1013aa7c8e03b02827eea40b`.
- Added `client/apps/runtime/public/manifest.webmanifest` with root-scoped id/start/scope, standalone display and canonical Forge icon declarations for 192/512 install slots.
- Runtime HTML links the manifest and mobile/Apple app-capable metadata.
- No service worker registration and no offline claim.
- `client/scripts/check-pwa-installability.mjs` is wired into client lint.
- Standalone installability contract check was exercised during the slice; full repository build/browser install is **NOT RUN**.

## Phase B slice 3 — extension child-grid mobile ergonomics

Risk: **FAST / UI-only**.

- PR `#328`, squash merge `9acf1867f40c4a14781b4e8604c7ad09de5b19cf`.
- Extended child-grid rows render as touch-friendly cards below `md`; existing scrollable table remains for `md+`.
- Mobile and desktop reuse one `renderControl` path, preserving `resolveField`, role/masking/readOnly, Dynamic Link target and `onChange` behavior.
- `client/scripts/check-child-grid-mobile.mjs` is wired into client lint.
- Full repository typecheck/build/browser regression is **NOT RUN**.

## Phase B slice 4 — stable pull-to-refresh listener lifecycle

Risk: **FAST / UI-only**.

- PR `#329`, squash merge `3981ee977fb6cea3e4375a92d99233010ab0b7d6`.
- The hook previously documented a stable-listener design but its effect depended directly on `onRefresh`, causing detach/attach churn whenever parent callbacks changed identity.
- Latest callback now lives in `onRefreshRef`; listener lifecycle depends on `enabled`, not callback identity, and gesture state resets when refresh becomes unavailable.
- `client/scripts/check-pull-to-refresh.mjs` is wired into client lint.
- Full repository typecheck/build/browser regression is **NOT RUN**.

## Legacy PR disposition

- `#269` HRM Wave 1: **REJECT for WS14 code reuse** — server HRM/migrations/tests only; WS14 is only a secondary contract reviewer.
- `#267` Bulk Stock Reconciliation: **REJECT for WS14 code reuse** — server/kernel/action/tests only.
- `#208` Plastic ERP Production Run: **REJECT for WS14 code reuse** — server/domain-only.
- `#216` Pricing matrix: **REJECT for canonical shared-runtime reuse** — hard-codes `Item Price`, `Price List`, `Item Group`, `UOM`, VND and pricing-specific behavior inside shared `client/packages/views/**`. UX ideas can inform a metadata/profile design; do not cherry-pick this implementation into generic runtime.

## Dependency Requests

### DR-WS14-01 — observable UI release fast path -> WS12

Need an observable/triggerable UI-only release path for GitHub-connector writes that returns workflow/run evidence and allows exact production verification (`/health`, `/release.json.releaseSha`, `bundleHash`). Contents-API commits/ref moves in this session produced no observable push-triggered run/status. Until this exists, production deploy is **UNPROVEN**, not DONE.

### DR-WS14-02 — Page/Dashboard compatibility contract -> WS09 + WS00

Define one canonical choice for legacy `/page/:page` and `/dashboard/:page`:

1. first-class metadata/API payloads the generic runtime can render; or
2. explicit compatibility/deprecation mapping to existing `AppScreen`/Overview primitives.

WS14 must not invent a client-only Page/Dashboard schema while app-registry/compiler owns the package contract.

### DR-WS14-03 — offline data/sync contract -> WS00 + WS11 + WS12

Before implementing `U01-003..007`, define cacheable data classes, tenant/user/session partitioning, logout/revoke purge behavior, release/schema freshness, queued-write idempotency/OCC, conflict detection/resolution and retry/background-sync boundary. A generic service worker without these contracts would create stale-data and cross-session risk.

### DR-WS14-04 — domain extension profile -> WS09 + WS17/domain owners

`ChildGridWithExtensions.tsx` still contains historical domain-specific child-DocType/field lists for sales and purchase-order extensions. Slice 3 improved only presentation and deliberately preserved behavior. Move these profiles into metadata/App Factory/vertical-owned configuration before claiming the shared child-grid architecture fully generic.

## Verification boundary

- GitHub exact diffs/mergeability were checked before each UI-only merge.
- Source regression scripts for all four slices are committed and wired into normal `client` lint.
- Full checkout/typecheck/build/E2E is **NOT RUN** in this execution environment because repository checkout cannot resolve `github.com`.
- Existing traceability already requires screenshots + E2E before UI requirements are promoted to Done; these new slices therefore remain at **Wired** where browser evidence is absent.
- Production `/release.json` evidence is **UNPROVEN**. Do not infer deploy success from merge alone.

## Autonomous Definition of Done for this pass

Completed all independent, low-risk WS14 Phase B slices that were supported by exact repo evidence without crossing another workstream's contract ownership:

1. mobile shell accessibility/focus/offline truthfulness;
2. installable PWA metadata foundation;
3. extension child-grid mobile presentation;
4. pull-to-refresh listener correctness/performance;
5. legacy frontend PR disposition and fallback/offline/bundle audits.

Remaining executable work is blocked by shared contract ownership (`DR-WS14-02..04`) or by missing browser/build/release evidence (`DR-WS14-01`). WS14 is therefore **BLOCKED**, not falsely marked DONE/Hardened.

## Resume order after dependencies unblock

1. Run client lint/typecheck/runtime build and targeted browser screenshots/E2E for slices 1–4.
2. Verify exact production release marker through WS12 fast path; promote `U01-001/002` only if evidence supports it.
3. Implement Page/Dashboard compatibility renderer after WS09/WS00 contract lands.
4. Implement offline read/write/sync only after DR-WS14-03 contract lands.
5. Measure runtime chunks before any barrel/subpath/manual-chunk optimization; split assistant/print only when measurement proves value.
6. Migrate child-grid domain extension profiles out of shared runtime after DR-WS14-04 lands.
