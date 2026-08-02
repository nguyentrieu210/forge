# WS14 — MetaForge Frontend Runtime / Mobile / Offline / A11y

Status: **ACTIVE — slice 1 merged; deploy evidence blocked**  
Owner: **gpt-ws14**  
Branch: `agent/ent-14-frontend-runtime-mobile`  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes, including UI fixes merged after the seed baseline. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Harden shared MetaForge runtime thay vì mỗi domain tự làm UI: form/list/report/action/workspace consistency, mobile/offline, accessibility, performance, shared controls và UX architecture.

## Own

`client/apps/runtime/**`, shared `client/packages/core|ui|controls|views|shell/**` architecture, routing/renderers, generic forms/lists/tables/actions, PWA/mobile/offline contracts, accessibility/performance/design-system primitives.

## Phase A exact-state audit — 2026-08-03

### Runtime/renderers

- Generic runtime/router is already metadata-first for list/form/workspace/overview/report/action/screen/import and lazy-loads large renderer families.
- `client/apps/runtime/src/main.tsx` still routes `/page/:page` and `/dashboard/:page` to `DeskFallback`; no generic Page/Dashboard renderer exists on current main.
- Command palette + permission-aware global search are wired through the shared shell/adapter; no separate app-specific navigation fork is required for this slice.

### Mobile/a11y shell

- `AppShell` already has a skip link, keyboard shortcut dialog, mobile drawer, active-page semantics and main-content focus after navigation.
- Audit found `businessContext` rendered in both topbar and the dedicated mobile context row.
- Audit found the custom mobile drawer missing an explicit trigger/controlled-region relationship and Escape close behavior.

### PWA/offline

- `client/apps/runtime/vite.config.ts` has only React + Tailwind plugins; repository search found no web app manifest, service-worker registration, IndexedDB cache, offline write queue or background sync implementation.
- Therefore `U01-002` through `U01-007` remain **Missing** on the audited baseline.
- The pre-slice offline banner claimed cached reads and later resend behavior that the runtime did not implement.

### Capability maturity

- `U01-001 Responsive PWA`: **Wired**. Responsive shell exists; generic-shell targeted browser/deploy evidence is still needed for RC.
- `U01-002 Installable PWA`: **Missing**.
- `U01-003 Offline read/cache`: **Missing**.
- `U01-004 Offline write queue`: **Missing**.
- `U01-005 Background sync`: **Missing**.
- `U01-006 Conflict detection`: **Missing**.
- `U01-007 Conflict resolution UX`: **Missing**.
- `N03-001 Global Search`: **Wired** in shared shell + adapter.
- `N03-008 Command Palette`: **Wired** in shared shell.

## Phase B slice 1 — mobile shell/a11y/offline truthfulness

Risk: **FAST / UI-only**.

Fast-path sub-branch: `fix/ui-ws14-mobile-shell-a11y-20260803`.

### Implemented

1. Render `businessContext` once per viewport: desktop topbar at `lg+`, dedicated context row below `lg`.
2. Add mobile navigation semantics: stable controlled-region id, labelled navigation landmark, `aria-controls`, `aria-expanded`.
3. Close mobile navigation on Escape and restore focus to the menu trigger; backdrop/close-button paths also restore focus.
4. Replace misleading offline promise with fail-honest copy: unloaded data and saves require connectivity.
5. Add `client/scripts/check-app-shell-mobile.mjs` and wire it into the normal `client` lint command.
6. No public `AppShellProps` API changes; no backend/API/schema/permission/business invariant changes.

### Merge evidence

- PR: `#315` — `fix(ui): harden WS14 mobile shell accessibility`.
- Head before squash: `b414314f45de746fdef7b2bc3827dbfa8660e221`.
- Squash merge on `main`: `f2d46105ca30c368ee4e9bdcf78cdcdb85dc7162`.
- Exact pre-merge compare: 4 files only (`AppShell.tsx`, `client/package.json`, regression script, this WS14 handoff); client behavior diff was +18/-6 in `AppShell.tsx`.
- GitHub reported PR mergeable before merge.

### Verification boundary

- Local checkout/typecheck/build could not run because the execution environment could not resolve `github.com`.
- The source regression is committed and wired into `client` lint, but the repository exposed no pull-request workflow run for PR #315 in this connector session.
- Contents-API write and a subsequent Git-data ref move on the `fix/ui-*` branch produced no observable commit status/workflow run through the available GitHub connector.
- Therefore build/deploy evidence is **not fabricated**: `U01-001` remains **Wired**, not RC/Hardened.

### Production deploy evidence — BLOCKED / UNPROVEN

- Repository policy authorizes `fix/ui-*` push as the production UI fast lane.
- Available tooling could not observe a corresponding push-triggered `ALU Build and Deploy` run, and the current web/container network could not fetch production `/release.json` or `/health` directly.
- Do **not** mark production deploy DONE until `/release.json.releaseSha` matches an exact deployed target revision and includes `bundleHash`.
- Dependency request to WS12/release lane: restore an observable/triggerable fast-path for GitHub-connector writes or provide a dispatch/run surface that returns run + exact release evidence. This is a release-pipeline blocker, not a reason to weaken WS14 UI scope.

## Dependencies / deferred contracts

- Installable/offline PWA is not being faked with an empty service worker. A real cache/write-queue design must preserve auth/tenant boundaries and release freshness before `U01-003..007` advance.
- Chromium-based browsers no longer require a service-worker fetch handler merely for installation from the browser menu; `U01-002` can be designed as a separate manifest/installability slice instead of pretending offline support exists.
- Shared metadata/compiler changes remain WS09; permission/auth enforcement remains WS11.

## Legacy PR disposition

- `#269` HRM Wave 1: **REJECT for WS14 code reuse**. Exact changed-file list contains server HRM/migrations/tests only; WS14 is secondary contract reviewer, not implementation owner.
- `#267` Bulk Stock Reconciliation: **REJECT for WS14 code reuse**. Exact changed-file list contains server/kernel/action/tests only; no shared frontend implementation to cherry-pick.
- `#208` Plastic ERP Production Run: **REJECT for WS14 code reuse**. Exact changed-file list is server/domain-only; no shared frontend implementation.
- `#216` Pricing matrix: **REJECT for canonical shared-runtime reuse**. It hard-codes `Item Price`, `Price List`, `Item Group`, `UOM`, VND and pricing-specific fields/behavior inside shared `client/packages/views/**`, violating WS14 metadata-first ownership. UX ideas may inform the primary domain/WS09 design, but the code must not be cherry-picked into generic runtime as-is.

## Next slice

1. `U01-002` installable PWA manifest/icon/start-url foundation without claiming offline capability.
2. Revisit `/page/:page` and `/dashboard/:page` `DeskFallback` only after confirming metadata/API contracts with WS00/WS09.
3. Continue large-table/mobile ergonomics and bundle/performance audit after release evidence is observable.

## Guard

UI state không trở thành source of truth cho permission/business rules. Không hard-code Alumdoor/domain schema vào generic runtime.
