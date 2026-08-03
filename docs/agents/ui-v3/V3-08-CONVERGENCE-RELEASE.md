# V3-08 — CONVERGENCE / RELEASE

Date: 2026-08-04
Canonical branch: `ui/v3-08-convergence-release`
Clean relay: `ui/v3-08-convergence-release-r2`
Role: final UI V3 integration candidate, integrated acceptance and release-evidence owner
Program spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`
CONTROL authority remains: `ui/v3-00-control`

## Purpose

The original technical spec grouped Builder/Mobile/QA in Wave V3-08. The later Agent Board intentionally split those implementation hotspots into V3-06 Builder and V3-07 Mobile-QA. V3-08 therefore does not implement a second Builder or QA runtime.

Its missing responsibility is the final lane:

`owner branch evidence -> clean exact-main convergence -> integrated QA -> UI-only release candidate -> deployed release proof -> CONTROL sign-off`

## Clean reconstruction

The first V3-08 branch started while main was changing rapidly across Finance/Inventory and UI V3 owner work. Whole-branch resyncs later produced ancestry/program-document conflicts even when runtime files did not conflict.

V3-08 was therefore reconstructed on a clean relay from `main@151d657bb44b1164e206b48dd2f67ca7d2f11155`, then each official owner execution head was integrated directly. This avoids importing stale backend history and avoids resolving coordinator-document conflicts by overwriting newer truth.

Latest main observed during this handoff: `d1263b5639878b73bf60923f25b9166de0644896`, which already contains V3-01 Foundation, V3-03 Auth and V3-04 Data convergence. Final branch-to-main comparison must remain authoritative because main is concurrent.

## Integrated owner slices

| Slice | Source / evidence | Convergence result |
|---|---|---|
| V3-01 Foundation | main PR #453 + release evidence #471 | already inherited from main base |
| V3-02 Shell | execution head `a041a78b3e88b5a3e6eaf40ce489022f607a2242`, internal PR #479 | integrated; branch-specific validation workflow removed |
| V3-03 Auth/Login | official head `b33c5bc197f8d820998bd5bca296310beecd1c3c`, internal PR #477 | integrated; auth/session/CSRF authority preserved |
| V3-04 Data Surfaces | official head `db9d9d2e8d4f898675ddaa43758226d4c1081a7b`, internal PR #478 | integrated; canonical List/Form/Context/Bulk renderers preserved |
| V3-05 Visual | owner head `fdf5ca7ac56672ba4f341683780284722fa0b1cf`, internal PR #483 | charts + visual primitives + dashboard/command center integrated; owner-only workflow removed |
| V3-06 Builder | execution head `2398e3432ed5647da955658eb3bc083e6930c8d8`, internal PR #481 | BuilderRoutes + DocType/Workflow/Print + browser regression integrated; temporary workflow removed |
| V3-07 Mobile-QA | official head `d03b55321eaae2805d97b55352769da070d69b17`, internal PR #482 | reusable desktop/tablet/mobile/reduced-motion QA matrix integrated; temporary workflow removed |

Temporary owner validation files deliberately removed from the release tree:

- `.github/workflows/ui-v3-shell-validation-temp.yml`;
- `.github/workflows/ui6-builder-validation.yml`;
- `.github/workflows/ui-v3-07-qa-temp.yml`;
- `.github/workflows/ui-v3-05-validate.yml`;
- `.github/workflows/tmp-ui-v3-04-validation.yml`.

The reusable tests/configs remain. Branch-specific CI scaffolding does not.

## Authority audit

The integrated release candidate must retain these invariants:

1. React/Forge remains the runtime; no Vue production runtime.
2. Authentication/session/CSRF authority remains in the existing adapter/session path.
3. List/Form/Context/Bulk continue using canonical metadata-driven renderers.
4. Builder continues editing existing metadata models through existing callbacks/save contracts; no second rendering authority.
5. Charts are presentation/view-model primitives, not unrestricted authoritative raw ECharts metadata.
6. No backend/schema/migration/finance/stock/payroll/permission/tenant authority is introduced by V3 convergence.
7. Semantic success/warning/error/info colors remain distinct from brand red.
8. Motion has a reduced-motion path.
9. Mobile uses responsive/adapted shared runtime rather than a shadow business runtime.
10. Production completion requires exact deployed release proof, not merely a merged PR.

## Release candidate blast radius

At the handoff audit, the substantive V3-08 delta versus main is confined to:

- `client/apps/demo/**` UI/browser QA;
- `client/e2e-forge/**` UI/browser QA;
- `client/packages/builder/**` presentation and UI-safe TypeScript cleanup;
- `client/packages/charts/**` presentation package;
- `client/packages/shell/**` shell/auth presentation;
- `client/packages/views/**` data/dashboard presentation;
- `client/packages/visual/**` presentation primitives;
- `docs/agents/ui-v3/**` V3 handoff/evidence.

No production backend, migration or authoritative business contract belongs in this release candidate. Re-audit the exact final diff before merge because main is moving concurrently.

## Integrated acceptance gate

V3-07 established the reusable test matrix, but its own report correctly states that final V3 acceptance requires rerunning after owner convergence. V3-08 is that converged tree.

Required exact-head evidence before final merge:

- relevant package typecheck/tests/build;
- frontend structural lint;
- V3 demo desktop/tablet/Pixel 7/compact/reduced-motion matrix;
- runtime Forge + Alumdoor login/mobile matrix;
- representative List/Form/Dashboard/Builder/Shell/Auth coverage;
- no horizontal overflow;
- keyboard/focus accessibility;
- minimum representative mobile touch targets;
- reduced-motion behavior;
- screenshot/browser evidence where configured.

An empty GitHub status list is not a PASS.

## Dependency Requests

### DR-V3-08-01 — exact integrated validation

Owner: V3-08 / canonical CI lane.

Need: execute the reusable V3-07 and repository UI gates against the final converged V3-08 head after all owner slices are present.

Blocking: final merge/deploy claim only.

Independent convergence work: complete.

### DR-V3-08-02 — CONTROL final parity sign-off

Owner: V3-00 CONTROL.

Need: consume the exact converged branch, final browser evidence and any remaining Vben parity/source-lock disposition.

Blocking: program-wide `complete` claim only.

Independent release-candidate engineering: complete.

## Merge / deploy policy

If the final exact diff remains UI/client/docs/QA only and exact-head gates are green, V3-08 is eligible for the Forge UI FAST path and may be merged/deployed without a separate technical confirmation.

If any backend/schema/migration/business-rule/shared authoritative metadata delta appears, split it and stop before non-UI merge/deploy.

## Production proof

After a successful UI release, record:

- exact merged/release SHA;
- `/health` success;
- `/release.json` exact release identifier;
- exact bundle hash;
- representative post-deploy browser smoke.

Do not mark V3 `Deployed` from source or merge state alone.
