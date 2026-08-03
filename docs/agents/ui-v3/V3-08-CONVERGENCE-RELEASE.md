# V3-08 — CONVERGENCE / RELEASE

Date: 2026-08-04
Final release branch: `ui/v3-08-release-final-20260804`
Role: exact-main UI V3 release candidate, integrated acceptance and release evidence
CONTROL authority: `ui/v3-00-control`

## Why this branch exists

The technical spec originally grouped Builder/Mobile/QA into Wave V3-08. The later Agent Board split implementation into V3-06 Builder and V3-07 Mobile-QA. V3-08 therefore owns the missing final lane:

`owner slices -> exact-main convergence -> integrated QA -> UI-only merge/deploy -> production proof -> CONTROL sign-off`

## Exact-main reconstruction

Early V3-08 convergence branches became stale while main accepted Finance and UI V3 owner PRs. Rather than force-rebase overlapping histories, the final branch was created from exact `main@72ed8005a2f1d7849e372f1bb7de0f12882966de`.

That base already contains:

- V3-01 Foundation;
- V3-03 Auth/Login convergence;
- V3-04 Data Surfaces convergence;
- the V3-03 session-notice UI follow-up.

V3-08 then replayed only missing owner slices:

- V3-02 Shell through internal PR #490;
- V3-06 Builder through internal PR #491;
- V3-05 Charts/Command Center through internal PR #492;
- V3-07 Mobile-QA through internal PR #493.

This preserves newer main fixes instead of overwriting them with older owner snapshots.

## Cleanup

The final branch deliberately removes temporary/owner-only CI scaffolding after harvesting the reusable implementation/tests:

- `.github/workflows/ui-v3-shell-validation-temp.yml`;
- `.github/workflows/ui-v3-05-validate.yml`;
- `client/docs/ui-v3-05-validation-trigger.md`;
- `.github/workflows/ui-v3-07-qa-temp.yml`.

Builder's current execution head no longer carried its former temporary workflow.

## Authority invariants

- React/Forge remains the runtime; no Vue production dependency.
- Auth/session/CSRF semantics remain server/adapter authoritative.
- List/Form/Context/Bulk remain canonical metadata-driven renderers.
- Builder uses existing metadata/save contracts and does not become a second runtime authority.
- Charts/visual packages are presentation/view-model primitives, not unrestricted authoritative ECharts metadata.
- No backend/schema/migration/business-rule/permission/tenant authority belongs in this branch.
- Semantic state colors remain distinct from brand red.
- Reduced-motion and responsive shared-runtime behavior remain required.

## Integrated validation gate

V3-07's own report states that its QA matrix must be rerun after all owner slices converge. This branch is the first exact-main-derived tree containing all required slices.

Before merge, exact-head evidence must cover:

- frontend lint/typecheck/build;
- charts model tests and Builder checks;
- demo desktop/tablet/Pixel 7/compact/reduced-motion matrix;
- runtime Forge + Alumdoor login/mobile matrix;
- representative Shell/Auth/List/Form/Dashboard/Builder coverage;
- keyboard/focus, overflow, touch-target and reduced-motion assertions.

An empty status list is not PASS.

## Dependency Requests

### DR-V3-08-01 — exact integrated CI/browser evidence

Owner: V3-08 release PR.
Need: run normal repository UI gates plus reusable V3-07 focused matrices on the exact final PR head.
Blocking: merge/deploy claim only.
Independent source convergence: complete.

### DR-V3-08-02 — CONTROL parity acceptance

Owner: V3-00 CONTROL.
Need: consume the final merged release evidence and close remaining parity/source-lock dispositions.
Blocking: program-wide completion claim only.

## Merge / deploy policy

If the exact final diff remains `client/**` + UI V3 docs/QA only and all required exact-head checks pass, this is an eligible UI FAST-path change and may merge/deploy without another technical confirmation.

If any backend/schema/migration/business/shared-authority path appears, split it and stop before non-UI merge/deploy.

## Production proof

After deployment record exact merged/release SHA, `/health`, `/release.json`, bundle hash and representative post-deploy browser smoke. Merge state alone is not `Deployed` evidence.
