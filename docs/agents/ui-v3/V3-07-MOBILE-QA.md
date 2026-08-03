# V3-07 — MOBILE / QA

Branch: `ui/v3-07-mobile-qa`
Role: responsive convergence, accessibility and evidence owner
Program spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`

## Mission

Converge MetaForge UI V3 across mobile/tablet/desktop and close the evidence gap: responsive behavior, touch ergonomics, keyboard/a11y, reduced motion, visual regression, performance and release proof. This branch is not a dumping ground for rewriting other owners' hotspots.

## Owned scope

- cross-surface responsive QA and integration fixtures;
- mobile shell/bottom navigation/sheet behavior where ownership does not conflict;
- visual regression fixtures/screenshots;
- accessibility and keyboard acceptance;
- reduced-motion acceptance;
- performance and interaction evidence;
- PWA/mobile presentation convergence with existing WS14 foundations;
- final cross-device acceptance report.

## Required responsive model

Desktop may use App Rail + Context Sidebar + Header + Workspace Tabs.

Mobile should prefer:

- compact top bar;
- bottom navigation or clear primary app navigation where appropriate;
- drawer/sheet for secondary context;
- safe viewport handling with mobile keyboard;
- touch-size actions;
- list/card/table adaptation driven by generic/runtime policy;
- context/detail tabs/sheets rather than permanently squeezed sidebars;
- stable loading/scroll/focus behavior.

Do not invent a separate mobile business app/runtime when the same metadata-driven surface can adapt.

## QA matrix

At minimum cover representative:

- boot/loading;
- login;
- shell expanded/collapsed and mobile nav;
- workspace tabs;
- command palette;
- notifications/preferences;
- list/table;
- form/detail/context;
- matrix where available;
- dashboard/chart;
- command-center responsive behavior;
- Builder minimum supported viewport.

States:

- light/dark;
- normal/reduced-motion;
- loading/empty/error;
- keyboard-only where relevant;
- touch/mobile;
- long Vietnamese labels;
- large data where existing fixtures support it.

## Hotspot discipline

If a fix belongs inside V3-01/02/03/04/05/06 exclusive files, do not race-edit the hotspot. Produce exact reproduction/evidence and a Dependency Request to the owner, then continue testing all other surfaces.

Only apply direct fixes in shared files when ownership has been explicitly handed over for convergence or the owner branch is already integrated and CONTROL has assigned the conflict.

## Accessibility

Verify/fix as ownership permits:

- focus visible;
- logical tab order;
- focus restoration after drawers/modals/mobile menus;
- ESC behavior;
- aria names/labels;
- color contrast;
- semantic status not expressed by color alone;
- `prefers-reduced-motion`;
- skip-to-content and landmark structure where present.

## Performance

Record measured evidence rather than inventing SLA claims. Watch for:

- unnecessary rerenders from motion/preferences;
- ECharts resize/update churn;
- perpetual animation loops;
- layout thrash during sidebar/tab transitions;
- large table regressions;
- heavy assets on login/command surfaces;
- mobile viewport/scroll jank.

## Release evidence

For UI-only slices merged/deployed through fast path, capture exact release SHA/hash/health evidence required by Forge. Historical successful UI appearance is not proof of the current release.

## No-stop behavior

A broken single surface does not stop QA of all others. Record exact blocker/repro, issue Dependency Request, then continue the matrix. Fix ordinary QA-owned responsive/a11y issues autonomously.

## Acceptance

MOBILE-QA is complete when the program has defensible cross-device visual, keyboard, a11y, reduced-motion and performance evidence; remaining failures are explicit and assigned; and any deployed UI V3 release is tied to exact release proof.

## Start prompt

`Đọc V3 spec, NO_STOP_RULE, AGENT_BOARD và V3-07-MOBILE-QA.md. Làm MOBILE/QA trên branch hiện tại: audit exact main, chạy responsive/a11y/reduced-motion/visual/performance matrix cho toàn UI V3, sửa phần thuộc ownership và gửi Dependency Request chính xác cho hotspot của agent khác. Không dừng vì một blocker; tiếp tục toàn bộ matrix độc lập và ghi exact evidence/release proof.`
