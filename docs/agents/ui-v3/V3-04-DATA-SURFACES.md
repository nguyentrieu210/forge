# V3-04 — DATA SURFACES

Branch: `ui/v3-04-data-surfaces`
Role: shared business data-surface presentation owner
Program spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`

## Mission

Upgrade the reusable Forge business surfaces to Vben-grade density, hierarchy and interaction while keeping the current metadata-driven renderer authoritative. Own List/Table/Form/Detail/Context and generic overlay/quick-entry presentation, not domain business behavior.

## Exclusive hotspots

- `client/packages/views/src/list/**`;
- generic table/list presentation under shared views;
- form/detail/context presentation modules;
- generic data-surface layout helpers;
- generic drawer/modal/quick-entry composition when view-owned.

Coordinate with V3-01 for tokens/motion and V3-02 for shell/chrome boundaries.

## Required List/Table UX

- strong page header/action hierarchy;
- compact search/filter/sort/column controls;
- bulk action state only when selection exists;
- high-density readable headers/rows;
- sticky header behavior;
- column sizing/resizing where existing primitives permit;
- clear selected/hover/focus/current states;
- new/updated cell highlight motion kept subtle;
- empty/loading/error/retry states;
- skeleton loading where appropriate;
- responsive transformation using current metadata/runtime policy rather than hard-coded domain cards;
- keyboard and screen-reader behavior preserved/improved.

## Required Form/Detail UX

- record header with status/actions;
- clear sections without card-within-card sprawl;
- efficient multi-column desktop layout;
- context/activity/related information composition;
- section collapse/reveal motion;
- validation focus/error reveal without gimmicky shake;
- sticky action/workflow behavior where current runtime supports it;
- mobile/tabbed context adaptation;
- preserve canonical controls registry and field permission behavior.

## Overlay/Quick Entry

Standardize business-facing drawer/modal/quick-entry presentation and motion, but keep create/update actions on canonical adapter/document paths.

## Matrix boundary

Do not rewrite the Matrix metadata contract or pricing/domain semantics. Reuse generic Matrix renderer and apply V3 visual treatment only within ownership-safe seams; issue Dependency Request to existing Matrix owners if a shared hotspot would conflict.

## Hard rules

- no `if doctype === ...` domain styling in shared views;
- no business calculations inside React;
- no permission authority changes;
- no duplicate document state/source of truth;
- no raw DataV/command-center decoration on everyday accounting/forms/lists;
- no separate Builder renderer.

## Vben parity

Audit Vben table/form/overlay UX for reusable behaviors. PORT interaction quality, ADAPT to Forge metadata controls, REPLACE where Forge already has stronger canonical behavior, and reject only with explicit reason.

## Verification

- representative large List;
- List selection/bulk/filter/sort/empty/loading/error;
- create/edit/read-only Form;
- workflow/status/validation/error states;
- detail/context panel;
- drawer/modal/quick-entry;
- desktop/tablet/mobile evidence;
- keyboard/a11y/reduced-motion;
- targeted views typecheck/build/tests;
- scan for domain-specific literals added to generic renderer.

## No-stop behavior

Make normal layout/density/component/refactor decisions autonomously. If one renderer hotspot is actively owned elsewhere, isolate the visual adapter/fixture, file a Dependency Request and continue every other data surface instead of waiting.

## Acceptance

DATA is complete when everyday ERP screens are visibly V3, denser and clearer than the old system, while metadata, controls, permissions and document behavior remain canonical and generic.

## Start prompt

`Đọc V3 spec, NO_STOP_RULE, AGENT_BOARD và V3-04-DATA-SURFACES.md. Làm DATA SURFACES trên branch hiện tại: audit exact main + Vben table/form parity, rebuild List/Table/Form/Detail/Context/overlay presentation theo Forge V3, giữ metadata/controls/permission/business authority nguyên vẹn. Không hard-code domain. Không dừng vì blocker cục bộ; ghi Dependency Request và tiếp tục các surface độc lập.`
