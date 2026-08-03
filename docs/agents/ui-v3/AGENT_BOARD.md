# Forge UI V3 — Agent Board

Date: 2026-08-04
Program branch: `ui/metaforge-vben-next-v3-20260804`
Canonical spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Shared execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`
Coordinator: ChatGPT project coordinator / convergence owner

## Program goal

Deliver **MetaForge UI V3 / Forge Vben Next**: preserve Forge's React metadata/runtime authority while reaching Vben-level UX completeness and moving the entire product to a new red/black/white visual, layout, interaction, motion, data-visualization and responsive system.

This is not a theme swap. The target includes shell, login, workspace, navigation, tabs, preferences, list/form/data surfaces, ECharts dashboards, DataV-inspired command surfaces, Builder, mobile, accessibility and motion.

## Branch topology

| Agent | Branch | Primary ownership |
|---|---|---|
| V3-00 CONTROL | `ui/v3-00-control` | parity inventory, source-lock, coordination, convergence, acceptance |
| V3-01 FOUNDATION | `ui/v3-01-foundation` | design tokens, typography, elevation, motion primitives, reduced motion |
| V3-02 SHELL | `ui/v3-02-shell` | app rail, context nav, header, tabs, command palette, notifications, preferences |
| V3-03 AUTH | `ui/v3-03-auth-login` | login V3, boot/loading/auth chrome/session surfaces |
| V3-04 DATA | `ui/v3-04-data-surfaces` | list/table/form/detail/context/drawer/modal/quick-entry presentation |
| V3-05 VISUAL | `ui/v3-05-charts-command-center` | ECharts presentation layer, KPI, dashboard, DataV-inspired command surfaces |
| V3-06 BUILDER | `ui/v3-06-builder` | Builder visual/layout overhaul using canonical runtime |
| V3-07 MOBILE-QA | `ui/v3-07-mobile-qa` | responsive/mobile convergence, a11y, reduced motion, visual regression, performance evidence |
| V3-08 CONVERGENCE-RELEASE | `ui/v3-08-convergence-release` | exact-main integration candidate, integrated acceptance, release evidence handoff to CONTROL |

All child branches are cut from or synchronized with the program baseline containing the V3 technical spec and NO-STOP rule. Agents must still audit exact current `main` before implementation and classify drift.

## Dependency order

```text
V3-00 CONTROL
      |
      v
V3-01 FOUNDATION
      |
      +----------------+----------------+----------------+
      v                v                v                v
V3-02 SHELL       V3-03 AUTH       V3-04 DATA       V3-05 VISUAL
      |                |                |                |
      +----------------+--------+-------+----------------+
                                v
                         V3-06 BUILDER
                                |
                                v
                         V3-07 MOBILE-QA
                                |
                                v
                    V3-08 CONVERGENCE-RELEASE
                                |
                                v
                         V3-00 CONVERGENCE
```

Parallel work is allowed whenever an owner can isolate behind existing contracts or a local adapter/view-model. Do not wait merely because a neighboring branch has not finished.

## Shared hotspot ownership

### V3-01 FOUNDATION exclusive hotspots

- `client/packages/ui/src/styles.css`
- canonical color/spacing/radius/elevation/motion tokens;
- shared animation/reduced-motion primitives.

Other agents may consume tokens/classes but should not redefine the system independently.

### V3-02 SHELL exclusive hotspots

- `client/packages/shell/src/AppShell.tsx`
- workspace navigation/chrome;
- shell preferences, command/search chrome and notifications presentation.

### V3-03 AUTH exclusive hotspots

- shell auth/login presentation files;
- global boot/auth loading surfaces where they are auth-owned.

Do not change authentication authority or session semantics.

### V3-04 DATA exclusive hotspots

- shared `client/packages/views/src/list/**`;
- shared form/detail/context presentation;
- generic data-surface layout and table presentation.

Do not add domain-specific business rules to shared views.

### V3-05 VISUAL exclusive hotspots

- chart presentation wrappers/theme;
- dashboard/command-center visual primitives;
- DataV-inspired decorative/operational primitives.

A new authoritative `viewPolicy.chart` or data-query contract is **not** owned here; isolate and request WS09/shared-contract ownership if needed.

### V3-06 BUILDER exclusive hotspots

- `client/packages/builder/src/**` visual/layout work;
- Builder must preview/use canonical runtime rather than invent a second renderer.

### V3-07 MOBILE-QA exclusive hotspots

- cross-surface responsive convergence where no other owner is actively editing the same file;
- browser fixtures, screenshots, visual regression, a11y, reduced-motion and performance acceptance.

If a mobile fix belongs inside another owner's hotspot, file a Dependency Request instead of racing the file.

### V3-08 CONVERGENCE-RELEASE integration ownership

V3-08 has no new implementation hotspot. It integrates exact owner deltas after ownership is complete, resolves convergence only with evidence, reruns the cross-surface acceptance matrix and creates the final UI-only release candidate when eligible.

Do not use V3-08 to rewrite an owner's still-active hotspot or to smuggle non-UI contract changes into the release candidate.

## Coordinator responsibilities

The coordinator does not compete with agent hotspots. Coordinator duties:

1. maintain Vben parity matrix and source-lock truth;
2. inspect current main/branch drift;
3. adjudicate ownership conflicts;
4. record dependency requests and unblock via seams;
5. decide convergence order using exact diffs/evidence;
6. reject duplicate or app-specific implementations of shared primitives;
7. ensure UI-only fast-path is used only when blast radius is truly UI-only;
8. ensure non-UI/shared-contract work stops before merge/deploy;
9. maintain final cross-surface acceptance and release evidence.

## Global hard rules

- React/Forge remains the runtime; no Vue runtime import.
- Vben is a UX completeness baseline, not a permission/data/business authority.
- Forge metadata, server permission, document kernel, OCC/idempotency and tenant boundaries remain unchanged unless a separately owned non-UI workstream intentionally changes them.
- Red/black/white is canonical UI V3 identity. Semantic success/warning/error/info colors remain semantically distinct.
- Motion must support `prefers-reduced-motion`.
- DataV-style effects are limited to operational/dashboard/command surfaces, never indiscriminately applied to accounting/forms/lists.
- ECharts should be wrapped behind Forge visual primitives. Do not expose unrestricted raw ECharts configuration as canonical metadata by accident.
- Apps consume shared primitives; do not fork per Alumdoor/HRM/Finance unless a truly vertical visual is explicitly required.

## Merge/deploy policy

Presentation-only UI slices that pass their gates may be merged/deployed through the UI fast path according to Forge policy. Each branch must record exact release evidence if deployment occurs.

If a branch discovers the need for backend/schema/migration/business-rule/shared authoritative metadata changes, split that work into a separate branch and do not merge/deploy it without explicit approval.

## Program-level Definition of Done

The V3 program is not complete until the following surfaces are coherent in light/dark where applicable and verified on desktop plus relevant mobile/tablet layouts:

- boot/loading;
- login/auth/session-expiry chrome;
- app shell/navigation;
- workspace tabs;
- command palette/search;
- notifications/preferences;
- list/table;
- form/detail/context;
- matrix;
- kanban/calendar/gantt/report where present;
- dashboard/ECharts;
- command-center mode;
- Builder;
- PWA/mobile shell;
- accessibility, keyboard and reduced motion;
- performance/visual regression acceptance.

Completion requires evidence, not the existence of components.
