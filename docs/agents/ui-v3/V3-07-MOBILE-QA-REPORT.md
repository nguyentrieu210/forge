# V3-07 — Mobile / QA execution report

Date: 2026-08-04  
Branch: `ui/v3-07-mobile-qa`  
Role: responsive convergence, accessibility and evidence owner

## Exact-main audit

Latest main observed during this execution: `64060ae1f08e8b6922828d4d27d8185073cf6697` (`feat(ui): establish Forge UI V3 foundation (#453)`).

V3-01 Foundation is therefore integrated on current main. The remaining owner branches were audited independently rather than treated as already-converged product evidence:

- V3-02 Shell: handoff/spec only at the latest audit;
- V3-03 Auth/Login: implementation exists on its owner branch but is not integrated on main;
- V3-04 Data Surfaces: implementation exists on its owner branch but is not integrated on main;
- V3-05 Charts/Command Center: implementation exists on its owner branch but is not integrated on main;
- V3-06 Builder: handoff/spec only at the latest audit.

Consequently this branch establishes and exercises the QA harness now, but does **not** claim final UI V3 cross-surface acceptance before those owner slices converge.

## QA-owned implementation

### Demo / metadata-runtime matrix

Added:

- `client/apps/demo/playwright.v3-qa.config.ts`
- `client/apps/demo/e2e/ui-v3-mobile-qa.spec.ts`
- `@metaforge/demo` command `e2e:v3:qa`

Matrix:

- desktop Chromium `1440x1000`;
- tablet Chromium `834x1112`;
- Pixel 7;
- compact touch viewport `360x800`;
- dark + `prefers-reduced-motion: reduce`.

Acceptance exercised by the focused V3-07 spec plus existing a11y/list/workspace specs:

- document/body horizontal overflow;
- list table-to-card responsive adaptation without a second mobile runtime;
- mobile navigation drawer visibility;
- Escape behavior and focus restoration;
- localized/long navigation reachability using the actual fixture metadata rather than hard-coded business labels;
- list, form, dashboard and Builder representative routes;
- screenshots attached per viewport;
- existing Axe serious/critical checks and keyboard gates;
- reduced-motion computed transition/animation timing.

### Runtime / login matrix

Added:

- `client/e2e-forge/playwright.v3-mobile-qa.config.ts`
- `client/e2e-forge/ui-tests/v3-mobile-qa.spec.ts`

The config intentionally starts only the runtime cookie proxy. It does not start Warehouse preview, so unrelated Warehouse build state cannot falsify MetaForge mobile QA.

Acceptance includes:

- generic Forge guest login;
- Alumdoor guest login;
- no horizontal overflow;
- mobile `44px` minimum input/action height on the representative login controls;
- keyboard focus reachability;
- password-reveal accessibility name;
- compact-phone behavior;
- dark/reduced-motion mode;
- screenshot artifacts.

## Existing repo evidence consumed

V3-07 reuses rather than duplicates existing proven primitives:

- `AppShell` already implements skip-to-content, mobile drawer focus entry, Escape close and trigger-focus restoration;
- generic list view already exposes mobile card adaptation;
- shared UI CSS already has global `prefers-reduced-motion` handling;
- existing demo a11y tests use Axe and cover serious/critical violations on list/form/kanban/calendar/dashboard;
- existing UI configs already cover desktop/tablet/Pixel/warehouse mobile. V3-07 adds the missing compact and reduced-motion acceptance as a focused matrix.

## Exact commands

Focused demo QA:

```bash
pnpm --filter @metaforge/demo... run build
pnpm --filter @metaforge/demo run e2e:v3:qa
```

Focused runtime QA:

```bash
pnpm --filter runtime... run build
pnpm --filter e2e-forge exec playwright test --config playwright.v3-mobile-qa.config.ts
```

A temporary PR-only workflow executes those commands against the exact PR head and uploads screenshots/reports. It must be removed before final merge after evidence is captured.

## Dependency Requests

### DR-V3-07-01 — final owner-surface convergence

**Owners:** V3-02, V3-03, V3-04, V3-05, V3-06, then V3-00 convergence.  
**Need:** integrate owner implementations before V3-07 can certify final shell/auth/data/chart/command-center/Builder appearance on one exact release tree.  
**Blocking:** no for the QA harness and independent acceptance work; yes for the claim “UI V3 final cross-device acceptance complete”.

After convergence, rerun the same V3-07 matrix without weakening assertions and assign any hotspot-specific failures back to the owning slice.

### DR-V3-07-02 — release proof after converged UI tree

**Owner:** V3-00 / release path.  
**Need:** exact merged UI SHA, deployment/release identifier, production health evidence and post-deploy representative browser proof for the converged V3 tree.  
**Blocking:** no for branch QA implementation; yes for any `Deployed`/production-complete claim.

## Maturity / acceptance statement

V3-07 currently provides a deterministic cross-device QA harness and independent responsive/accessibility/reduced-motion evidence path. Final program acceptance remains **gated by owner convergence and exact release proof**. No RC/Hardened/Deployed claim is inferred merely from source presence or from historical screenshots.
