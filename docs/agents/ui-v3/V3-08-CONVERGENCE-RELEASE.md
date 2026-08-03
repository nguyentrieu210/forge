# V3-08 — CONVERGENCE / RELEASE

Date: 2026-08-04
Branch: `ui/v3-08-convergence-release`
Role: integration candidate, acceptance and release-evidence owner
Exact creation base: `main@81a4deb26a66588f4e2fc0ef0f509e54808f4446`
Program spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`
Coordinator authority remains: `ui/v3-00-control`

## Why V3-08 exists

The technical spec originally groups Builder/Mobile/QA under Wave V3-08. The later Agent Board deliberately split that hotspot-heavy scope into V3-06 Builder and V3-07 Mobile-QA so those owners can work independently.

V3-08 therefore must **not** implement a second Builder or duplicate Mobile-QA. Its job is the missing final lane between parallel implementation and CONTROL sign-off:

`branch evidence -> exact-main convergence -> integrated acceptance -> UI-only release candidate -> production release proof`

This preserves the newer Agent Board ownership while keeping an explicit eighth execution lane for final integration.

## Owned scope

- audit exact branch drift for V3-01..V3-07 against current main;
- classify every branch delta as `integrate / narrow transplant / supersede / dependency`;
- assemble a clean UI-only release candidate without taking ownership of implementation hotspots;
- verify that no backend/schema/migration/business-rule/authoritative metadata change is hidden in the candidate;
- run/collect the existing Forge UI validation stack rather than creating a parallel QA framework;
- reconcile cross-surface visual inconsistencies only after the owning branch is integrated or ownership is explicitly handed over;
- produce final release-candidate evidence for CONTROL;
- after an actual UI fast-path deployment, record exact `/health` + `/release.json` proof including release SHA and bundle hash.

## Existing validation authority to reuse

V3-08 reuses current Forge infrastructure:

- root FAST gate: `node scripts/run-validation-gate.mjs --risk FAST`;
- client typecheck/build/test from root/client package scripts;
- `client/scripts/check-app-shell-mobile.mjs` and the rest of the existing client lint contract;
- `client/e2e-forge/playwright.ui.config.ts` with desktop 1440x1000, tablet 834x1112 and Pixel 7 coverage;
- existing `client/e2e-forge/ui-tests/**` and warehouse mobile projects;
- release proof contract: `/health` + `/release.json` with exact release SHA and bundle hash.

Do not add a new UI test runner merely because V3 has a new name.

## Acceptance matrix

The integrated candidate must cover, where the surface exists:

| Surface | Desktop | Tablet | Mobile | Light/Dark | Keyboard/A11y | Reduced motion | Error/empty/loading |
|---|---|---|---|---|---|---|---|
| boot/loading | required | smoke | smoke | required | focus sanity | required | required |
| login/auth/session chrome | required | required | required | required | required | required | required |
| app rail/context nav/header | required | required | adapted | required | required | required | required |
| workspace tabs | required | required | adapted | required | required | required | required |
| command/search | required | required | required | required | required | required | required |
| notifications/preferences | required | required | required | required | required | required | required |
| list/table | required | required | adapted | required | required | required | required |
| form/detail/context | required | required | adapted | required | required | required | required |
| matrix | required | required | adapted | required | required | required | required |
| report/kanban/calendar/gantt | smoke | smoke | applicable | required | smoke | required | required |
| dashboard/ECharts | required | required | adapted | required | labels/focus | required | required |
| command center | required | required | adapted | required | labels/focus | required | required |
| Builder | required | minimum supported | minimum supported | required | required | required | required |
| PWA/mobile shell | n/a | smoke | required | required | touch/focus | required | required |

Required human-readable evidence includes representative screenshots, not only source assertions.

## Integrated invariants

The candidate is rejected if any of these are true:

1. Vue becomes a production runtime dependency for Forge UI.
2. Apps fork shared shell/list/form primitives only to obtain V3 styling.
3. UI code becomes authoritative for permission, tenant, finance, stock, payroll or other business rules.
4. A second Form/List/Builder rendering authority is introduced.
5. unrestricted raw ECharts business configuration becomes canonical metadata accidentally.
6. DataV-style effects leak into normal accounting/forms/lists as decorative noise.
7. semantic success/warning/info states are collapsed into brand red.
8. motion lacks a reduced-motion path.
9. mobile is only a squeezed desktop layout with horizontal overflow or inaccessible controls.
10. release is claimed from merge state without exact deployed release proof.

## Initial exact-state audit

Observed after branch creation:

- current main: `81a4deb26a66588f4e2fc0ef0f509e54808f4446`;
- canonical UI V3 program baseline was created from `7819ade8cdb1213d9f99ae92f144ae8aee82b054` and is therefore behind current main by Finance/Inventory hardening commits with no UI-program-doc overlap;
- V3-01, V3-02, V3-03, V3-05, V3-06 and V3-07 currently contain their program docs/owner brief but no implementation delta beyond the shared program baseline;
- V3-04 is current-main based but likewise has no data-surface implementation delta at the observed point;
- therefore there is **nothing legitimate to converge yet** from V3-01..V3-07 beyond planning/source-of-truth material.

This is a dependency state, not permission to stop V3-08. Independent acceptance/release design and drift classification are complete here; implementation convergence begins only when owner branches expose real UI deltas.

## Dependency Requests

### DR-V3-08-01 — implementation heads

Owner: V3-01..V3-07

Need: real owned UI implementation deltas and their package/browser evidence.

Why: V3-08 must integrate exact code, not infer completion from agent briefs.

Blocked scope: final candidate assembly and integrated browser evidence only.

Can continue independently: yes.

Next independent work: preserve clean current-main lineage, acceptance matrix, branch-drift audit and release proof contract.

### DR-V3-08-02 — CONTROL parity sign-off

Owner: V3-00 CONTROL

Need: final parity/source-lock disposition for any useful Vben baseline item still open after integrated QA.

Why: V3-08 owns candidate assembly; CONTROL owns parity truth and program acceptance.

Blocked scope: final program-complete claim only.

Can continue independently: yes.

## Convergence algorithm

For each owner branch when it gains implementation:

1. compare exact current `main...owner-branch`;
2. separate shared program docs from real code delta;
3. reject or split any non-UI authoritative change;
4. prefer narrow transplant/replay onto current V3-08 head when the owner branch is stale/diverged;
5. preserve hotspot ownership semantics when resolving overlap;
6. run relevant package typecheck/test/build and existing lint invariants;
7. run desktop/tablet/mobile browser matrix for changed surfaces;
8. verify light/dark, keyboard, focus, reduced motion and overflow;
9. repeat after every integrated slice because screenshot evidence from a pre-convergence head is not final evidence;
10. only then create the UI-only release PR to main.

## Merge / deploy policy

V3-08 itself does not turn documentation or QA tooling into a fake UI-only change.

A final release PR may use the Forge UI fast path **only** when its actual diff is presentation/runtime UI-only and all required validation evidence passes. Any backend/schema/migration/business-rule/shared authoritative metadata delta must be split and held for explicit approval.

Production is considered deployed only after the canonical release path reports exact `/health` and `/release.json` proof for the merged release SHA and bundle hash.

## Completion

V3-08 is complete when:

- all real V3-01..V3-07 UI deltas are reconciled onto exact current main;
- no duplicate implementation authority survives convergence;
- integrated typecheck/test/build/browser/a11y/reduced-motion/mobile evidence is real and exact-head;
- CONTROL has a complete final acceptance record;
- UI-only release is merged/deployed through the canonical fast path when eligible;
- production release SHA and bundle hash are recorded after deployment;
- remaining gaps are explicit Dependency Requests rather than optimistic prose.
