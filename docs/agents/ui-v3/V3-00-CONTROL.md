# V3-00 — CONTROL / CONVERGENCE

Branch: `ui/v3-00-control`
Role: coordinator, Vben source-lock, parity truth, convergence owner
Program spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`

## Mission

Coordinate MetaForge UI V3 without competing with implementation owners. Establish a trustworthy Vben parity inventory, exact upstream source lock, current Forge state map, dependency graph and final convergence evidence.

## Owned scope

- Vben upstream source/version/SHA/license record;
- feature/parity inventory across layout, navigation, tabs, preferences, login, loading, motion, tables/forms, overlays, search, notifications, responsive and accessibility;
- classification of each useful Vben capability as `PORT / ADAPT / REPLACE_WITH_FORGE / REJECT_WITH_REASON`;
- branch drift audit and ownership conflict resolution;
- program status/evidence board;
- convergence ordering and final cross-surface acceptance;
- dependency request ledger;
- reject duplicate app-specific implementations of shared primitives.

## Do not own

- shared token implementation: V3-01;
- `AppShell.tsx` implementation: V3-02;
- auth/login implementation: V3-03;
- list/form shared renderer implementation: V3-04;
- charts/command visual implementation: V3-05;
- Builder implementation: V3-06;
- mobile/QA implementation: V3-07.

## Required outputs

1. Vben source lock with exact upstream repository/ref/SHA and license evidence.
2. Complete parity matrix grouped by:
   - foundation/theme;
   - layout modes;
   - sidebar/header/mixed navigation;
   - tabs/workspace;
   - search/command palette;
   - preferences;
   - auth/login/loading;
   - notification/profile/settings;
   - modal/drawer/overlay;
   - list/table/form patterns;
   - dashboards/charts;
   - motion/transitions;
   - mobile/responsive;
   - accessibility/keyboard/reduced-motion.
3. Current Forge equivalent/evidence for every parity item.
4. Owner branch + status + acceptance evidence field.
5. Dependency request ledger.
6. Final convergence checklist and release proof.

## No-stop behavior

Do not wait for agents to finish in order to continue inventory, drift audit, dependency analysis, review of completed diffs, or acceptance design. If a branch is blocked, record the blocker and continue coordinating all other branches.

Do not ask for ordinary technical confirmation. Use Skill, North Star, current repo and V3 spec as decision evidence.

## Convergence rules

- exact code wins stale planning docs;
- no two branches own the same hotspot concurrently;
- do not merge a stale whole branch when a narrow reuse/cherry-pick is safer;
- UI-only verified slices may use fast-path merge/deploy;
- any backend/schema/business-rule/shared authoritative contract change is split and held before merge/deploy;
- final product must remain one React runtime and one canonical design system.

## Acceptance

CONTROL is complete when parity truth is exhaustive enough that no major Vben UX capability is silently omitted, every item has a disposition/owner/evidence, all branch work is reconciled against exact main, and final UI V3 release evidence is recorded without inflating maturity.

## Start prompt

`Đọc docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md, docs/agents/ui-v3/NO_STOP_RULE.md, docs/agents/ui-v3/AGENT_BOARD.md và V3-00-CONTROL.md. Làm coordinator CONTROL trên branch hiện tại: khóa exact Vben source, lập parity matrix đầy đủ, audit exact main/branch drift, điều phối dependency/convergence. Không chiếm hotspot implementation của agent khác. Không dừng vì blocker cục bộ; ghi Dependency Request và tiếp tục phần độc lập.`
