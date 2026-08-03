# V3-03 AUTH / LOGIN — Completion Evidence

Date: 2026-08-04
Owner branch: `ui/v3-03-auth-login`
Clean convergence branch: `converge/ui-v3-03-auth-20260804`
Exact clean base: `main@a022aae7ee967e0c9e08d0ce2514efb11ea3b771`
Risk: UI-only / FAST presentation slice

## Scope delivered

- Rebuilt the shared Forge login into the V3 red / black / white split composition.
- Added canonical branded boot/loading presentation with real indeterminate progress only; no fake percentage.
- Added canonical network/bootstrap error + retry presentation.
- Added session-expired and logout-completion notices without changing session authority.
- Added credential submitting/disabled/error/focus/autofill presentation.
- Added mobile/tablet single-column behavior with `100svh` and safe-area padding.
- Added low-cost CSS/SVG grid/data-node motion and required `prefers-reduced-motion` handling.
- Removed hard-coded Alumdoor hostname/product marketing behavior from the shared `LoginForm`; existing `brand` and `brandMark` inputs remain the branding seam.

## Exact runtime files changed

- `client/packages/shell/src/auth/AuthBoundary.tsx`
- `client/packages/shell/src/auth/AuthPresentation.tsx`
- `client/packages/shell/src/auth/LoginForm.tsx`
- `client/packages/shell/src/index.ts`

Clean-base compare before this evidence file: branch ahead by 4, behind by 0, with exactly those four runtime files changed.

## Authority invariants audited

Preserved in `AuthBoundary`:

- `adapter.getBoot()` remains the authoritative boot call and is still deduped per adapter instance;
- `adapter.setCsrfToken(boot.csrf_token)` remains the CSRF installation path;
- auth/permission boot failures still resolve to guest state;
- `adapter.onSessionExpired()` still invalidates boot cache and returns to guest;
- logout still calls `adapter.logout()` and invalidates boot in `finally`;
- no cookie/token storage behavior was added or changed.

Preserved in `LoginForm`:

- credentials are submitted only through `adapter.login(usr, pwd)`;
- failures are still mapped with `adapter.mapError()`;
- no direct auth API, secret, token persistence or permission logic was added.

## Vben disposition

- `PORT`: split auth hierarchy, complete loading/error/submitting states, credential focus polish.
- `ADAPT`: translated UX to Forge React/Tailwind/Radix primitives and existing adapter/session contracts.
- `REPLACE_WITH_FORGE`: kept Forge `AuthBoundary` and adapter authority instead of porting Vben auth/security logic.
- `REJECT_WITH_REASON`: no video, high-frequency particles, fake security claims, or product-specific shared login fork.

## Accessibility / responsive evidence from source audit

- login inputs preserve `username` and `current-password` autocomplete semantics;
- username disables capitalization/spellcheck for credential entry;
- password reveal has `aria-label` and `aria-pressed`;
- login error uses `role="alert"` + assertive live region;
- boot uses `role="status"`, polite live region and `aria-busy`;
- session/logout notices use polite live region;
- decorative SVG/grid content is non-interactive / hidden from accessibility tree;
- reduced-motion disables ambient/auth animations and collapses transition duration;
- mobile surface uses single-column layout, `100svh`, scrollable credential region and safe-area padding.

## Validation truth

Local container clone/build was not available because the execution sandbox could not resolve GitHub DNS. No local typecheck/build PASS is claimed.

The clean convergence branch was therefore created from exact current `main` and only the audited owner delta was transplanted. PR CI on this clean branch is the authoritative type/build/test gate before merge.

Browser screenshot / viewport matrix remains cross-surface acceptance owned by V3-07 MOBILE-QA. This does not expand V3-03 into V3-07's hotspot.

## Dependency status

V3-01 Foundation dependency is resolved: canonical V3 token/motion foundation was merged to `main` before the clean convergence branch was created.

No backend/shared authoritative contract dependency remains.

## Release rule

Merge/deploy is permitted only after the clean PR is mergeable and its required checks pass (or the repository demonstrably has no applicable PR check hook). Production deployment must be proven separately with the repository release proof contract (`/health`, `/release.json`, release SHA, bundle hash); a merge alone is not deployment evidence.
