# V3-02 — SHELL / WORKSPACE

Branch: `ui/v3-02-shell`
Role: application shell, navigation and workspace owner
Program spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`

## Mission

Port/adapt Vben's mature enterprise shell experience into Forge React and upgrade it into the Forge V3 workspace model: App Rail, contextual module navigation, command header, workspace tabs, command palette/search, notifications, preferences and layout modes.

## Exclusive hotspots

- `client/packages/shell/src/AppShell.tsx`;
- shell navigation/workspace/chrome modules;
- shell preference UI and local presentation state;
- command palette/search chrome;
- notification/profile chrome presentation.

Consume V3-01 tokens/motion. Do not redefine the design system locally.

## Required UX

- App Rail for top-level product/module context where architecture permits;
- Context Sidebar for active module navigation;
- compact/collapsed behavior;
- command/header bar;
- breadcrumb hierarchy;
- multi-tab workspace;
- tab open/close/pin/refresh/close-others/close-right;
- workspace maximize/full-content mode;
- menu/global search;
- notification entry and drawer/popover chrome;
- profile menu;
- preferences center;
- theme/light-dark-system controls backed by canonical foundation;
- density/layout preferences where supported;
- responsive drawer/sheet behavior;
- keyboard/focus/a11y behavior;
- online/offline/release/status truthfulness already established in current shell.

## Workspace state principle

Tabs must preserve useful user context when technically safe: active route/record, view state and scroll where existing architecture supports it. Do not create a second authoritative document state or bypass TanStack Query/runtime state ownership.

## Vben parity

Audit Vben shell/navigation/tab/preferences/search behaviors and classify every relevant item `PORT / ADAPT / REPLACE_WITH_FORGE / REJECT_WITH_REASON` in coordination with V3-00.

Forge should exceed baseline where ERP workflows need stronger multi-context behavior.

## Hard rules

- no Vue runtime;
- no client permission authority; visibility is UX only, effective capability remains server/runtime owned;
- do not hard-code Alumdoor/Finance/HRM nouns in shared shell;
- do not fork a second router;
- do not change auth/session semantics owned by V3-03;
- do not rewrite shared view renderers owned by V3-04;
- preserve existing manifest-driven navigation boundaries.

## Dependency behavior

If App Rail/module grouping requires metadata not currently exposed, first derive from existing manifest/nav structure. If a new authoritative metadata contract is genuinely required, issue Dependency Request to the proper shared contract owner and implement the best compatible shell seam independently.

## Verification

- desktop/tablet/mobile shell visual evidence;
- collapsed/expanded/sidebar/mixed/full-content states;
- keyboard/focus and ESC behavior;
- workspace tab lifecycle;
- search/command palette;
- notification/profile/preferences flows;
- light/dark/reduced-motion;
- targeted shell typecheck/build/tests;
- no regression to current offline/session-expiry truthfulness.

## No-stop behavior

Normal layout, component structure, tab behavior and local preference choices are yours to decide using Vben + V3 spec + repo evidence. If one feature needs another owner's contract, record it and continue all independent shell parity items.

## Acceptance

SHELL is complete when the authenticated Forge experience no longer feels like the old monolithic sidebar shell, reaches Vben-grade chrome completeness, preserves Forge metadata/runtime authority and works coherently across desktop and mobile entry points.

## Start prompt

`Đọc V3 spec, NO_STOP_RULE, AGENT_BOARD và V3-02-SHELL.md. Làm SHELL trên branch hiện tại: audit exact main và Vben parity, port/adapt App Rail + Context Sidebar + Header + Workspace Tabs + Command Palette + Notifications + Preferences + layout modes vào React Forge. Consume FOUNDATION, không sửa business/auth/view authority. Không dừng vì blocker cục bộ; ghi Dependency Request rồi tiếp tục.`
