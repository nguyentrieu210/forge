# V3-07 — Mobile / QA execution report

Date: 2026-08-04  
Branch: `ui/v3-07-mobile-qa`  
Role: responsive convergence, accessibility and evidence owner

## Exact-main audit

Latest main observed before the final V3-07 merge-candidate run: `fe0c2f1a9c490eb400e19a5d55baea9a4b60c307` (`feat(ui-v3): rebuild shell as enterprise workspace (#466)`).

Integrated UI V3 owner slices at that point:

- V3-01 Foundation: merged (`64060ae1f08e8b6922828d4d27d8185073cf6697`);
- V3-02 Shell: merged (`fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`);
- V3-03 Auth/Login: merged (`a99af64b6509477238bc9dc848e226828531b599`) with client-only centering/release follow-up `72ed8005a2f1d7849e372f1bb7de0f12882966de`;
- V3-04 Data Surfaces: merged (`d1263b5639878b73bf60923f25b9166de0644896`);
- V3-06 Builder: merged (`bbf79b541ede38222544774ec8b5393f8e1bb1fe`), including the Builder TypeScript repair that unblocked the demo dependency graph;
- V3-05 Charts / Command Center: implementation exists on its owner branch but was not integrated on main at the latest audit.

V3-07 therefore validates the currently converged UI tree without editing owner hotspots. Final whole-program UI V3 acceptance remains gated only by V3-05 convergence plus exact release proof.

## QA-owned implementation

### Demo / metadata-runtime matrix

Added:

- `client/apps/demo/playwright.v3-qa.config.ts`;
- `client/apps/demo/e2e/ui-v3-mobile-qa.spec.ts`;
- `@metaforge/demo` command `e2e:v3:qa` using the isolated `e2e/tsconfig.json`.

Matrix:

- desktop Chromium `1440x1000` runs the existing Axe/list/workspace regression suites plus V3-07 acceptance;
- tablet Chromium `834x1112` runs focused responsive acceptance;
- Pixel 7 runs focused responsive acceptance;
- compact touch viewport `360x800` runs focused responsive acceptance;
- dark + `prefers-reduced-motion: reduce` runs focused motion acceptance.

The matrix deliberately avoids multiplying the same desktop regression suite across every device. Cross-device projects exercise only the assertions whose result actually depends on viewport/motion state.

Acceptance covers:

- document/body horizontal overflow;
- list table-to-card adaptation without a second mobile runtime;
- mobile navigation drawer visibility;
- Escape close and trigger-focus restoration;
- longest localized navigation label reachability using actual fixture metadata;
- representative list, form, dashboard and Builder routes;
- fresh-profile appearance onboarding dismissal before viewport measurement;
- screenshots attached per viewport;
- existing Axe serious/critical checks and keyboard gates on desktop;
- reduced-motion computed transition/animation timing.

### Runtime / auth matrix

Added:

- `client/e2e-forge/playwright.v3-mobile-qa.config.ts`;
- `client/e2e-forge/ui-tests/v3-mobile-qa.spec.ts`.

The config intentionally starts only the runtime cookie proxy. Warehouse preview is not part of this focused lane, so unrelated Warehouse state cannot falsify MetaForge auth/mobile QA.

Acceptance covers:

- canonical Forge auth route `/login` rather than website-first `/`;
- shared V3 auth surface `forge-auth-login`;
- Alumdoor through the V3-03 `brand` / `brandMark` seam, not a product-specific shared-login fork;
- no horizontal overflow;
- nominal `44px` mobile input/action height with a `0.25px` tolerance for device-scale fractional rounding;
- desktop keyboard focus order and password reveal accessibility name;
- Pixel 7 and compact-phone touch behavior;
- dark/reduced-motion mode;
- screenshot artifacts.

## Evidence discovered during execution

The temporary exact-merge-candidate gate caught several useful failures instead of merely proving that test files exist:

1. An inherited Builder TypeScript failure initially blocked the demo graph. V3-07 recorded it as a V3-06 dependency and continued runtime QA. V3-06 later merged `bbf79b...`, and a subsequent V3-07 merge-candidate run proved the full demo dependency graph builds successfully with `@metaforge/builder` included.
2. The first generic auth fixture incorrectly assumed `/` was the login route. Repo authority shows `/` is website-first and `/login` is the reserved Forge auth route; the test was corrected rather than changing runtime routing.
3. Device-scale rounding reported a nominal `44px` control as `43.99997px`; the touch invariant now allows only `0.25px` numerical tolerance rather than weakening the target.
4. V3-03 intentionally removed hard-coded Alumdoor product behavior from shared `LoginForm`. V3-07 adapted its assertion to the preserved brand/brandMark seam instead of resurrecting a product fork.
5. Playwright 1.62 attempted to validate the demo application project-reference tsconfig. V3-07 now explicitly uses the existing isolated `e2e/tsconfig.json`.

These are QA-harness/fixture corrections or resolved owner dependencies; none required changing backend, schema, permission, session, metadata or business authority.

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

A temporary PR-only workflow validates `refs/pull/473/merge`, records the PR head/base/merge-candidate SHA and uploads browser evidence. The workflow is temporary and must be removed before merge after the final evidence run.

## Dependency Requests

### DR-V3-07-01 — V3-05 final owner-surface convergence

**Owner:** V3-05 Charts / Command Center, then V3-00 convergence.  
**Need:** integrate the V3-05 owner implementation before claiming one-tree acceptance of the complete UI V3 program.  
**Blocking:** no for V3-07 QA implementation/merge; yes for the statement “all V3-01..07 visual slices are converged on one release tree”.

V3-07 must not edit V3-05 chart/dashboard hotspots merely to eliminate this dependency.

### DR-V3-07-02 — exact release proof

**Owner:** canonical UI release path / V3-00.  
**Need:** exact merged UI SHA, deployment/release identifier, production health evidence and post-deploy convergence evidence.  
**Blocking:** no for QA source merge; yes for any `Deployed`/production-complete claim.

## Maturity / acceptance statement

V3-07 provides a deterministic cross-device QA harness and an independent responsive/accessibility/reduced-motion evidence path. V3-01/02/03/04/06 are integrated on main as of the latest audit; V3-05 remains the only owner-slice convergence dependency. No RC/Hardened/Deployed claim is inferred merely from source presence, a merged PR, a triggered workflow or historical screenshots.
