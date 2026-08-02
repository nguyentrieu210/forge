# WS14 — MetaForge Frontend Runtime / Mobile / Offline / A11y

Status: **ACTIVE**  
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
- Mobile currently renders `businessContext` once inside the top bar and a second time in the dedicated `lg:hidden` context row, wasting narrow-screen space and duplicating controls.
- Mobile drawer trigger/aside do not expose an explicit `aria-controls`/`aria-expanded` relationship and the custom drawer has no Escape close path.

### PWA/offline

- `client/apps/runtime/vite.config.ts` has only React + Tailwind plugins; repository search found no web app manifest, service-worker registration, IndexedDB cache, offline write queue or background sync implementation.
- Therefore `U01-002` through `U01-007` remain **Missing** on exact main.
- Current offline banner says cached data remains viewable and changes can be resent later, but those guarantees are not implemented. The banner must fail honest until an offline contract exists.

### Capability maturity

- `U01-001 Responsive PWA`: **Wired**, responsive shell exists; generic-shell targeted browser evidence still needed for RC.
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

Target changes:
1. render business context once per viewport: desktop in top bar, mobile in the dedicated context row;
2. add explicit mobile navigation semantics (`aria-controls`, `aria-expanded`, labelled navigation) and Escape close behavior;
3. change offline copy to state only what runtime truly guarantees: network requests/saves are unavailable until connectivity returns;
4. add targeted source regression and run shell/runtime typecheck/build before merge.

No backend/API/schema/permission/business invariant changes.

## Dependencies / deferred contracts

- Installable/offline PWA is not being faked in this slice. A real service-worker/cache/write-queue design must preserve auth/tenant boundaries and release freshness before `U01-002..007` can advance.
- Shared metadata/compiler changes remain WS09; permission/auth enforcement remains WS11; no dependency request is blocking this UI slice.

## Legacy PR disposition

- `#269` HRM Wave 1: **REJECT for WS14 code reuse**. Exact changed-file list contains server HRM/migrations/tests only; WS14 is secondary contract reviewer, not implementation owner.
- `#267` Bulk Stock Reconciliation: **REJECT for WS14 code reuse**. Exact changed-file list contains server/kernel/action/tests only; no shared frontend implementation to cherry-pick.
- `#208` Plastic ERP Production Run: **REJECT for WS14 code reuse**. Exact changed-file list is server/domain-only; no shared frontend implementation.
- `#216` Pricing matrix: **REJECT for canonical shared-runtime reuse**. It hard-codes `Item Price`, `Price List`, `Item Group`, `UOM`, VND and pricing-specific fields/behavior inside shared `client/packages/views/**`, violating WS14 metadata-first ownership. UX ideas may inform the primary domain/WS09 design, but the code must not be cherry-picked into generic runtime as-is.

## Guard

UI state không trở thành source of truth cho permission/business rules. Không hard-code Alumdoor/domain schema vào generic runtime.

## Handoff checklist

Cuối slice ghi affected shared APIs, browser/build evidence, backward compatibility, deployment evidence, dependency requests, PR/head SHA và next slice.
