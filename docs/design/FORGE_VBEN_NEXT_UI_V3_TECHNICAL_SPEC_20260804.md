# FORGE VBEN NEXT UI V3 — TECHNICAL SPEC

Date: 2026-08-04  
Status: DESIGN / IMPLEMENTATION SOURCE OF TRUTH FOR UI V3  
Repository: `nguyentrieu210/forge`  
Branch: `ui/metaforge-vben-next-v3-20260804`  
Base: `main@7819ade8cdb1213d9f99ae92f144ae8aee82b054`  
Risk: FAST for presentation-only slices; STANDARD when adding shared chart/view metadata contracts; CRITICAL is out of scope for this program unless a later slice touches auth/security/ledger/statutory/schema/migration authority.

---

## 0. Decision

MetaForge UI V3 will not be a recolor of the current MetaForge shell and will not be a literal Vue runtime embed.

The target is:

> **Vben completeness + Forge architecture + a new Red / Black / White visual identity + a stronger enterprise workspace + ECharts data visualization + controlled DataV command-center language + a first-class motion system.**

Vben is the canonical UX/reference baseline for product chrome, layouts, navigation, tabs, preferences, overlays, page containers, loading, authentication presentation and enterprise interaction conventions.

Forge remains authoritative for:

- React runtime;
- metadata-driven rendering;
- AppManifest/navigation data;
- DocType/meta contracts;
- permissions and trusted server capabilities;
- adapter/API boundaries;
- ControlRegistry and field behavior;
- Form/List/Matrix business semantics;
- tenant/session/OCC/security behavior;
- App Factory and Builder round-trip.

The implementation must therefore **port/adapt Vben behavior and visual patterns into existing React packages**, not add a parallel Vue application or a second UI engine.

---

## 1. Mandatory upstream source lock

Before implementation begins, the first implementation branch must record an exact immutable upstream source lock.

### 1.1 Vben

Canonical upstream:

- repository: `vbenjs/vue-vben-admin`;
- current major reference: Vben 5;
- observed latest GitHub release at planning time: `v5.7.0`;
- license: MIT.

Implementation rule:

1. pin an exact Vben tag and commit SHA before porting code/patterns;
2. record all upstream files/patterns actually reused or translated;
3. preserve required MIT copyright/license notice for copied or substantially derived source;
4. do not copy Vue runtime wholesale into Forge;
5. translate behavior into React primitives owned by Forge packages;
6. do not inherit Vben authorization as an authoritative security boundary.

### 1.2 Apache ECharts

Canonical upstream:

- repository: `apache/echarts`;
- observed latest release at planning time: `6.1.0`;
- license: Apache-2.0.

ECharts is the default chart engine for UI V3.

### 1.3 DataV

Canonical inspiration/source:

- repository: `DataV-Team/DataV`;
- license: MIT;
- use: selected border/decorative/data-screen primitives and visual concepts only.

Prefer small Forge-native React implementations using SVG/CSS over bringing a second visualization component runtime into shared business surfaces.

### 1.4 BigDataView

BigDataView is **visual inspiration only**. Do not copy source/assets unless a later source-lock task proves the exact repository/file license is compatible and records attribution.

Allowed inspiration:

- large-screen composition;
- KPI hierarchy;
- map-centric operations views;
- multi-panel information density;
- command-center framing.

---

## 2. Repo architecture that UI V3 must preserve

Exact Forge architecture currently uses a one-directional React package model:

```text
@metaforge/core
    ↑
@metaforge/adapter-frappe
@metaforge/ui
@metaforge/controls
    ↑
@metaforge/views
    ↑
@metaforge/shell
@metaforge/builder
    ↑
apps/*
```

UI V3 must not introduce:

- Vue as a second production application runtime;
- app-specific copies of shared shell/views;
- domain logic in UI primitives;
- frontend-only permission authority;
- direct API access from visual components;
- a second Form/List renderer for Builder;
- raw ECharts configuration as an uncontrolled canonical business contract;
- DataV dependencies in normal Form/List controls.

The current Forge Enterprise Completion Skill remains authoritative. If this spec conflicts with exact code, migrations, tests, current Skill or North Star, exact verified repo state wins.

---

## 3. Product identity

Working product/design name:

> **Forge Vben Next / MetaForge UI V3**

It must be visually recognizable as Forge, not as Vben with a color variable changed.

### 3.1 Brand language

Primary identity:

- red;
- black / graphite;
- white;
- restrained neutral silver/gray.

Default business UI must remain readable for prolonged ERP use. Red is reserved for identity, primary interaction and selected states; semantic colors remain separate.

### 3.2 Core light tokens

```text
--forge-bg:               #F6F7F8
--forge-surface:          #FFFFFF
--forge-surface-soft:     #F0F2F4
--forge-foreground:       #15171A
--forge-muted:            #69707D
--forge-border:           #DEE2E7
--forge-border-strong:    #C9CED6

--forge-black:            #090909
--forge-graphite:         #111317
--forge-graphite-soft:    #181B20

--forge-primary:          #E52521
--forge-primary-hover:    #C91C18
--forge-primary-active:   #B21714
--forge-primary-soft:     #FDECEB
--forge-primary-border:   #F4B8B5
```

### 3.3 Core dark tokens

```text
--forge-bg:               #0B0C0E
--forge-surface:          #131519
--forge-surface-raised:   #191C21
--forge-foreground:       #F7F7F8
--forge-muted:            #9CA3AF
--forge-border:           #292D33
--forge-border-strong:    #3A3F47

--forge-primary:          #EF332D
--forge-primary-hover:    #FF433C
--forge-primary-active:   #CF211C
--forge-primary-soft:     #3A1514
```

### 3.4 Semantic colors remain independent

```text
success     green
warning     amber
error       red semantic scale distinct from brand accents where necessary
info        blue/cyan
pending     violet
neutral     gray
```

Do not turn success/warning/info into brand red.

### 3.5 Theme simplification

UI V3 should converge the current large theme zoo into a canonical Forge identity.

Required appearance axis:

```text
light | dark | system
```

Optional customer branding may remain through manifest/token overrides, but production Forge surfaces must have one canonical visual grammar.

---

## 4. Typography, density and geometry

### 4.1 Typography

Keep Geist / Geist Mono unless a later measured typography audit proves a better multilingual choice.

Hierarchy:

```text
Display / dashboard KPI   28–48
Page title                20–24
Section title             14–16 semibold
Body                      13–14
Dense table               12–13
Metadata/secondary        11–12
Mono values/codes         Geist Mono
```

Use tabular numerals for money, quantity, time, KPI and finance tables where supported.

### 4.2 Density modes

UI V3 supports exactly three density presets:

```text
compact      ERP power-user / dense tables
standard     default
comfortable  touch / low-density business screens
```

Do not expose arbitrary per-component density controls.

### 4.3 Radius

Default radius should be tighter than consumer SaaS:

```text
control       6–8px
panel         8–10px
overlay       10–12px
pill          status/tag only
```

Avoid card-inside-card nesting and excessive rounded containers.

### 4.4 Elevation

Use four surface levels:

```text
L0 Canvas
L1 Section
L2 Panel
L3 Overlay/Floating
```

Shadows are primarily for overlays and important raised panels, not every card.

---

## 5. Motion system

Motion is a first-class UI V3 subsystem, not ad-hoc CSS.

Create shared motion tokens/helpers in `@metaforge/ui` or a narrowly scoped shared module.

### 5.1 Motion categories

#### Micro

Use for hover/focus/toggle/menu/icon/tab controls.

```text
duration: 80–160ms
```

#### Navigation

Use for sidebar collapse, nav state, app rail, context navigation.

```text
duration: 160–220ms
```

#### Workspace

Use for workspace tab create/close/switch/maximize and view restoration.

```text
duration: 160–240ms
```

#### Overlay

Use for modal/drawer/command palette/AI panel.

```text
duration: 160–260ms
```

#### Data

Use for KPI counts, ECharts dataset transitions, inserted/updated records.

```text
duration: 200–700ms depending on meaning
```

#### Command-center

Longer ambient effects are allowed only in command-center mode.

### 5.2 Canonical easing

Define a tiny set only:

```text
standard       cubic-bezier(.2,.8,.2,1)
enter          cubic-bezier(.16,1,.3,1)
exit           cubic-bezier(.4,0,1,1)
linear-flow    linear
```

### 5.3 Canonical page transitions

Expose only:

```text
none
fade
slide
workspace
```

No large catalog of novelty transitions.

### 5.4 Reduced motion

Every animation path must obey:

```css
@media (prefers-reduced-motion: reduce)
```

Requirements:

- disable ambient animation;
- remove non-essential translate/scale motion;
- reduce durations to near-zero for navigation;
- keep visibility/state changes understandable;
- ECharts animation disabled or materially reduced.

### 5.5 Motion performance

Preferred animated properties:

```text
transform
opacity
clip-path only when measured safe
```

Avoid layout-thrashing animation of large data surfaces. Sidebar width transition may be used only with measured containment and must not create continuous expensive table relayout.

---

## 6. New application layout

UI V3 is not restricted to Vben's stock layout. It combines Vben's proven feature completeness with a new enterprise workspace hierarchy.

### 6.1 Desktop default

```text
┌──────┬────────────────────────────────────────────────────────────┐
│      │ Command Header                                             │
│ APP  │ breadcrumb · global search · create · AI · notify · user │
│ RAIL ├────────────────────────────────────────────────────────────┤
│      │ Workspace Tabs                                             │
│      ├───────────────┬────────────────────────────────────────────┤
│      │ Context Nav   │                                            │
│      │               │              Workspace                     │
│      │               │                                            │
│      │               │                                            │
│      └───────────────┴────────────────────────────────────────────┤
│      │ status/sync/release/offline when relevant                  │
└──────┴────────────────────────────────────────────────────────────┘
```

### 6.2 App Rail

Target width:

```text
56–64px desktop
```

Responsibilities:

- Forge identity;
- home;
- top-level product areas/modules;
- app switcher;
- settings/admin entry;
- optional tenant/company switch affordance when supplied by trusted app context.

The rail is high-level only. It must never become another 80-item sidebar.

### 6.3 Context Navigation

Target expanded width:

```text
232–272px
```

Responsibilities:

- current module nav;
- groups;
- current search scope;
- pinned/favorite items;
- collapsible groups;
- badges/status when supplied by metadata;
- active-route reveal.

### 6.4 Command Header

Contains:

- contextual breadcrumb;
- global command/search entry;
- primary create action when available;
- AI entry when configured;
- notifications;
- fullscreen;
- user/account menu;
- contextual business switcher only when supplied by app/runtime.

### 6.5 Workspace Tabs

Workspace tabs become a first-class ERP primitive.

Required behavior:

- open;
- close;
- close others;
- close right;
- pin;
- reorder;
- refresh;
- maximize;
- restore;
- duplicate where safe;
- title update when document identity changes;
- unsaved/dirty marker;
- dirty close guard;
- bounded tab count policy;
- restore current session state where appropriate.

A workspace entry should retain presentation state where safe:

- scroll position;
- active internal tab;
- context panel tab;
- list query/filter state;
- non-authoritative local UI state.

Do not persist sensitive authoritative data in local storage merely to restore a tab.

---

## 7. Navigation modes

Port the useful Vben navigation/layout completeness into Forge, but keep one default.

Supported:

```text
sidebar
mixed
header
compact
content-only
command-center
```

Default:

```text
app rail + context sidebar + command header + workspace tabs
```

All navigation modes must consume the same canonical AppManifest/nav model.

No mode-specific business routing logic.

---

## 8. Login/Auth presentation V3

Auth behavior remains owned by existing `AuthBoundary` and adapter/session contracts. UI V3 replaces presentation only unless a separate approved auth task is created.

### 8.1 Desktop composition

```text
┌──────────────────────────────┬──────────────────────────┐
│                              │                          │
│ FORGE                        │ Sign in                  │
│ Enterprise Operating        │                          │
│ Platform                     │ identity/email           │
│                              │ password                 │
│ animated grid / data lines  │                          │
│ product capability motif    │ [ Sign in → ]           │
│                              │ SSO/options if supplied  │
└──────────────────────────────┴──────────────────────────┘
```

Left visual surface:

```text
black / graphite
white typography
red controlled highlights
```

Right authentication surface:

```text
white in light mode
graphite panel in dark mode
```

### 8.2 Login motion

Allowed:

- low-cost SVG/CSS grid drift;
- subtle data-node movement;
- logo mask/reveal;
- auth panel fade/translate entry;
- button progress state;
- successful session transition into shell.

Forbidden:

- heavy autoplay video;
- high-frequency particles;
- continuous large canvas GPU load;
- distracting motion near credentials inputs;
- fake security/status claims.

### 8.3 Auth states

Must visually cover:

- initial checking;
- guest login;
- invalid credentials;
- server/network error;
- session expired mid-use;
- re-authentication;
- optional SSO supplied by app;
- lock screen if later enabled;
- offline truthfulness.

---

## 9. Global loading and skeleton system

Replace generic spinner-first loading with a hierarchy:

1. app boot loader;
2. route/workspace progress;
3. surface skeleton;
4. inline control spinner only for local actions.

### 9.1 Boot loader

Forge branded:

```text
black background
FORGE mark
red progress/accent
short exit fade
```

No simulated percentage unless real progress exists.

### 9.2 Skeletons

Provide shared skeleton patterns for:

- list;
- form;
- dashboard;
- detail/context;
- matrix;
- cards/mobile.

Skeleton dimensions must approximate final layout to reduce CLS.

---

## 10. Preferences Center

Port the useful Vben preferences concept but reduce configuration entropy.

Canonical sections:

### Appearance

```text
light | dark | system
```

### Navigation

```text
sidebar | mixed | header
```

### Density

```text
compact | standard | comfortable
```

### Workspace

```text
tabs on/off where app permits
breadcrumb
animations
fullscreen controls
```

### Accessibility

```text
reduced motion override
enhanced focus indicators where needed
```

### Developer/demo-only

Advanced token/layout experimentation must not be presented as normal end-user settings unless product evidence requires it.

Preferences must be centralized, typed and versioned. Do not continue scattered per-component localStorage keys as the long-term model.

---

## 11. Command Palette / Global Search

Port and upgrade Vben's global-search experience.

Default trigger:

```text
Ctrl/Cmd + K
```

Search categories:

- navigation;
- recent workspace entries;
- create actions;
- documents when adapter/provider supplies an authorized search source;
- reports;
- commands;
- Forge AI entry when configured.

Presentation:

- centered overlay;
- short fade/scale/translate entry;
- keyboard-first roving selection;
- grouped results;
- recent actions;
- no business search data invented by the client.

---

## 12. Notifications and user chrome

Port Vben-grade dropdown/drawer quality while keeping Forge notification contracts.

Required:

- unread count;
- new notification micro-motion once;
- read/unread state;
- loading/error/retry;
- view all;
- mark all read when capability supplied;
- keyboard accessibility;
- mobile sheet adaptation.

Do not continuously shake/ring the notification icon.

---

## 13. List and table system

The List surface must be denser and more enterprise-grade than generic shadcn admin examples.

### 13.1 Canonical composition

```text
Page header
View/status tabs when metadata supplies them
Search / filter / sort / columns / export controls
Selection action bar when rows are selected
Data table or deterministic mobile representation
Pagination / bounded virtualized strategy where applicable
```

### 13.2 Data table requirements

- sticky header;
- sticky key columns where policy allows;
- resizing;
- column visibility;
- sorting;
- filters;
- row selection;
- keyboard focus/navigation where practical;
- empty/loading/error states;
- bulk action reveal only on selection;
- responsive behavior;
- large-data seam;
- stable keys;
- number alignment/tabular numerals;
- status semantics;
- no per-cell network request architecture.

### 13.3 Table motion

Allowed:

- inserted row soft red identity flash -> neutral;
- updated cell short highlight;
- deleted row fade/collapse;
- sort/reorder motion only when cheap;
- sticky edge shadow on scroll.

Do not animate all visible rows during scroll or pagination.

---

## 14. Form / Detail / Context system

Keep one canonical Form renderer driven by metadata.

### 14.1 Desktop form composition

```text
Record header
status/workflow
actions
main field/content surface
child grids / items
summary/totals
optional context inspector
```

### 14.2 Context inspector

Desktop optional right-side inspector with tabs such as:

- activity;
- comments;
- attachments;
- related;
- audit/history;
- AI/context insight only when permitted/configured.

Mobile becomes bottom sheet or secondary tab flow.

### 14.3 Form motion

- validation message reveal, no violent shake;
- focus invalid field;
- section collapse with height/opacity/chevron motion;
- status transition;
- save/submit progress;
- dirty indicator;
- conflict state lock/reload affordance.

Authoritative document/workflow behavior must remain server-bound.

---

## 15. Drawer / Modal / Quick Entry

Create/standardize Forge primitives equivalent to Vben-grade overlays:

```text
ForgeDrawer
ForgeModal
ForgeConfirm
ForgeQuickEntry
ForgeInspector
```

Required:

- controlled/uncontrolled API seam appropriate to React;
- loading state;
- submit lock;
- before-close guard;
- dirty guard;
- focus trap;
- escape behavior;
- restore focus;
- destroy-on-close option where safe;
- mobile placement adaptation;
- accessible title/description.

Quick Entry must call canonical Forge create/write paths. It is not a second mini document engine.

---

## 16. Matrix

UI V3 must consume the canonical Matrix metadata/runtime work already developed in UI01/UI02 convergence streams.

Visual upgrade only unless separate shared-contract work is explicitly branched.

Required presentation:

- V3 shell/chrome;
- red active/focus semantics;
- business-neutral matrix renderer;
- sticky axes;
- virtualization seam;
- keyboard navigation;
- dirty/conflict state;
- mobile step/card flow;
- high-density desktop mode.

Do not add Item Price/Alumdoor literals to generic Matrix code.

---

## 17. ECharts architecture

Create a dedicated package when implementation begins:

```text
@metaforge/charts
```

### 17.1 Responsibilities

- ECharts lazy loading/registration;
- Forge light/dark themes;
- responsive resize handling;
- accessible chart summaries/fallback text where practical;
- dataset transitions;
- formatter boundary;
- chart primitives;
- dashboard composition helpers;
- print/export safe rendering path where applicable.

### 17.2 Minimum primitives

```text
ForgeLineChart
ForgeAreaChart
ForgeBarChart
ForgeStackedBarChart
ForgeDonutChart
ForgeScatterChart
ForgeHeatmap
ForgeGauge
ForgeTreemap
ForgeFunnel
ForgeSankey
ForgeMap
ForgeSparkline
ForgeWaterfall
```

### 17.3 Metadata boundary

Presentation-only implementation may wrap existing data/contracts.

If a first-class chart grammar is added, use a separate non-UI-only branch and contract review.

Preferred future semantic contract:

```text
dataset reference
x/category field
series field(s)
aggregation/semantic formatting reference
presentation type
interaction policy
permission/query boundary
```

Do **not** make arbitrary raw `EChartsOption` blobs the canonical business metadata contract.

---

## 18. DataV / command-center visual package

Create only if actual command-center screens require it:

```text
@metaforge/visual
```

Allowed primitives:

```text
DataPanel
EdgeFrame
GlowDivider
MetricNumber
StatusPulse
FlowLine
GeoConnection
RadarFrame
CommandCenterGrid
AlertBeacon
```

Rules:

- business Form/List must not depend on this package;
- animations default off under reduced-motion;
- SVG/CSS preferred;
- no decorative component may imply fake live data;
- actual live indicators must be backed by real runtime state.

---

## 19. Presentation modes

A future presentation policy may expose:

```text
business
operations
command
```

Meaning:

### Business

- Vben-like enterprise workbench;
- light/neutral data surfaces;
- minimal ambient motion;
- Finance/HR/CRM/Procurement default.

### Operations

- same shell;
- stronger KPI/status visibility;
- compact ECharts;
- WMS/MRP/logistics default candidate.

### Command

- full-screen capable;
- dark-first;
- ECharts + DataV visual primitives;
- map/flow/KPI emphasis;
- monitoring/executive screens only.

Do not implement this as app-name conditionals. Use generic presentation metadata/config only after contract ownership is agreed.

---

## 20. Dashboard V3

Dashboards must move away from a wall of identical rounded cards.

Canonical hierarchy:

```text
KPI strip
primary trend/analysis
secondary comparison
exceptions/actions
optional map/process view
```

KPI animation:

- animate on first meaningful reveal/change only;
- do not count from zero on every rerender;
- respect reduced motion;
- preserve exact formatting/rounding semantics from data layer.

ECharts transitions should update datasets without destroying/recreating the whole chart when possible.

---

## 21. Builder V3

Builder must continue rendering the same canonical runtime surfaces.

Target composition:

```text
┌ Components ─┬──────────── Canvas ─────────┬ Properties ┐
│ Fields      │ actual Forge runtime        │ General    │
│ Layout      │ preview                     │ Data       │
│ Views       │                             │ Display    │
│ Actions     │                             │ Rules      │
│ Charts      │                             │ Permission │
└─────────────┴─────────────────────────────┴────────────┘
```

Builder goals:

- Vben-grade chrome;
- clear canvas focus mode;
- resizable panels;
- command palette/search;
- undo/redo state remains existing Builder authority;
- no duplicate theme;
- preview uses shared runtime;
- properties organized by semantic groups;
- desktop/tablet preview modes.

---

## 22. Mobile

Vben is a useful admin baseline, but Forge must go beyond it because field/WMS/HR actors use mobile.

### 22.1 Mobile shell

```text
top app bar
content
bottom navigation for primary app actions where manifest/runtime allows
sheets for secondary nav/preferences/context
```

### 22.2 Adaptations

```text
sidebar       -> sheet
drawer        -> full-height or bottom sheet
workspace tabs-> compact scrollable tabs / history switcher
table         -> deterministic responsive table/card policy
context panel -> sheet/tab
command       -> full-screen command search
```

Existing WS14 PWA/a11y/offline contracts remain authoritative. UI V3 must not invent offline persistence semantics.

---

## 23. Accessibility

Mandatory:

- WCAG-conscious contrast for text/focus/status;
- keyboard navigation in shell/menu/tabs/command palette;
- visible focus indicators;
- focus trap/restoration for overlays;
- semantic landmark/navigation labels;
- skip link retained;
- reduced motion;
- no color-only status meaning;
- minimum practical mobile touch targets;
- chart accessible summary/fallback where feasible;
- screen-reader friendly loading/state changes where useful.

Vben visual parity is not acceptance if accessibility regresses existing Forge behavior.

---

## 24. Performance budget

UI V3 must feel faster, not merely look heavier.

Rules:

- no Vue runtime;
- ECharts lazy load by chart/dashboard route when possible;
- DataV/visual package lazy load for command-center only;
- SVG/CSS ambient effects preferred over large canvas/video;
- avoid loading all icon packs;
- preserve current PDF dynamic imports;
- no N×M network call assumptions in Matrix/table;
- no per-row expensive animation on scroll;
- avoid layout thrash from sidebar/workspace transitions;
- skeletons sized to reduce CLS;
- code split command-center/dashboard if bundle measurement justifies it.

Performance claims require measured bundle/browser evidence.

---

## 25. Package ownership / expected files

### `client/packages/ui`

Owns:

- canonical Red/Black/White tokens;
- density/radius/elevation;
- motion tokens/helpers;
- overlay primitives/styles;
- skeleton primitives;
- shared state/status styling.

Expected hotspot:

- `client/packages/ui/src/styles.css`

Avoid growing one unbounded stylesheet indefinitely; extract logical modules if current package build supports it cleanly.

### `client/packages/shell`

Owns:

- App Rail;
- Context Navigation;
- Command Header;
- Workspace Tabs shell;
- navigation modes;
- preferences UI;
- command palette chrome;
- notification/user chrome;
- login/auth presentation;
- global loading presentation.

Current `AppShell.tsx` should be decomposed rather than expanded into another monolith.

Suggested components:

```text
ForgeAppShell
AppRail
ContextSidebar
CommandHeader
WorkspaceTabBar
WorkspaceManager
PreferencesDrawer
GlobalCommand
NotificationCenter
AccountMenu
ForgeBootLoader
```

### `client/packages/views`

Owns presentation/runtime composition for:

- List V3;
- Form V3;
- Detail/context V3;
- Matrix V3 skin/composition;
- Report/Kanban/Calendar/Gantt/Tree/Dashboard visual convergence;
- responsive data surfaces.

### `client/packages/charts` (new)

Owns ECharts integration and chart primitives.

### `client/packages/visual` (new only when needed)

Owns DataV-inspired operational/command-center visual primitives.

### `client/packages/builder`

Owns V3 Builder chrome while reusing shared runtime.

---

## 26. Vben parity inventory

Before calling V3 complete, create a tracked parity inventory against the pinned Vben source lock.

Minimum categories:

### Shell/layout

- sidebar nav;
- mixed nav;
- header nav;
- full-header/sidebar variants;
- collapse;
- responsive/mobile behavior;
- breadcrumb;
- fullscreen/content-only.

### Tabs/workspace

- open/close;
- pin;
- reorder;
- refresh;
- max count;
- close others/right;
- restore;
- maximize.

### Preferences

- appearance;
- navigation;
- sidebar/header/tab behavior;
- widgets;
- transitions;
- density/radius equivalents chosen for Forge.

### Widgets

- global search;
- notification;
- theme toggle;
- fullscreen;
- refresh;
- language entry if enabled;
- lock screen only if Forge session model later supports it correctly.

### Overlays

- drawer;
- modal;
- confirm;
- loading;
- destroy-on-close behavior;
- before-close/dirty guard.

### Authentication presentation

- login;
- loading/error states;
- session-expiry presentation;
- optional alternate auth entries when supplied by backend/app.

Every Vben feature must be classified:

```text
PORT
ADAPT
REPLACE_WITH_FORGE
REJECT_WITH_REASON
```

“100% Vben” means no useful baseline capability is silently forgotten; it does not mean preserving framework-specific or inappropriate behavior.

---

## 27. Implementation waves

Do not implement all V3 changes as one mega branch.

### Wave V3-00 — source lock and parity matrix

Branch suggestion:

```text
ui/v3-00-vben-source-lock
```

Deliver:

- exact Vben tag/SHA;
- source/license attribution plan;
- feature parity inventory;
- current Forge mapping;
- screenshot/reference set.

### Wave V3-01 — foundation

```text
ui/v3-01-foundation
```

Deliver:

- red/black/white tokens;
- type/density/radius/elevation;
- motion tokens;
- reduced motion;
- skeleton foundation.

### Wave V3-02 — shell

```text
ui/v3-02-shell
```

Deliver:

- App Rail;
- Context Sidebar;
- Command Header;
- responsive shell;
- collapse/navigation motion.

### Wave V3-03 — workspace

```text
ui/v3-03-workspace
```

Deliver:

- workspace tab manager;
- pin/reorder/close/maximize/refresh;
- local presentation-state restoration;
- dirty guards.

### Wave V3-04 — login/preferences/overlays

```text
ui/v3-04-login-preferences-overlays
```

Deliver:

- Login V3;
- boot loader;
- Preferences Center;
- Modal/Drawer/Quick Entry visual convergence;
- command palette.

### Wave V3-05 — data surfaces

```text
ui/v3-05-data-surfaces
```

Deliver:

- List/Table V3;
- Form/Detail/Context V3;
- secondary screens visual convergence.

### Wave V3-06 — charts/dashboard

Presentation-only path:

```text
ui/v3-06-echarts-dashboard
```

If chart grammar/shared metadata is needed, split contract changes into a non-fast-path branch.

### Wave V3-07 — operations/command center

```text
ui/v3-07-command-center
```

Deliver:

- `@metaforge/visual` if justified;
- command-center composition;
- DataV-inspired visual primitives;
- ECharts operational screens.

### Wave V3-08 — builder/mobile/QA

Split as needed to avoid shared hot-spot conflicts.

---

## 28. Fast-path / merge policy

Per Forge Skill:

### UI-only

After blast-radius verification:

```text
typecheck/build relevant scope
browser/screenshot verification
a11y targeted checks
mobile checks
no schema/business/API contract change
```

UI-only slices may use project fast-path merge/deploy policy.

### Not UI-only

If a slice changes:

- `viewPolicy` canonical metadata;
- AppManifest shared contracts;
- permission/security semantics;
- server actions;
- schema/migration;
- backend query contracts;
- business rules;

then it must be separated, reviewed under appropriate risk, and must stop before merge/deploy until explicitly approved according to project policy.

Do not hide contract changes inside a “visual redesign” PR.

---

## 29. Validation gates

Every UI V3 slice must provide evidence proportional to scope.

### Required for presentation slices

- TypeScript typecheck for changed package graph;
- relevant unit tests;
- production build of affected runtime/app graph;
- desktop screenshots;
- mobile screenshots;
- light/dark screenshots;
- keyboard smoke;
- reduced-motion smoke;
- high-contrast/focus review;
- no forbidden domain literals in shared primitives;
- no accidental API/schema changes.

### Required visual reference surfaces

At minimum:

- login;
- boot loading;
- workspace/home;
- list;
- form;
- detail/context;
- matrix;
- modal;
- drawer;
- command palette;
- preferences;
- notifications;
- dashboard;
- report;
- kanban;
- calendar;
- gantt/tree where supported;
- builder;
- mobile shell;
- command center when introduced.

### Release proof after actual deploy

Use the existing Forge release proof contract:

```text
/health
/release.json
release SHA
bundle hash
```

Do not claim production deploy from a commit/merge alone.

---

## 30. Definition of Done

MetaForge UI V3 is complete only when:

1. Vben baseline parity inventory has no unclassified useful feature;
2. Forge uses a coherent Red/Black/White design system across authenticated surfaces and login;
3. shell layout is the new App Rail + Context Nav + Command Header + Workspace model;
4. workspace tabs are functional and state-safe;
5. motion is systematic and reduced-motion compliant;
6. List/Form/Detail/Matrix/secondary screens visually converge;
7. Builder uses the same system/runtime;
8. mobile experience is intentionally adapted, not merely shrunk desktop;
9. ECharts is the canonical chart engine;
10. DataV language is isolated to operations/command-center contexts;
11. permission and metadata authority remain Forge-owned;
12. no second Vue runtime or second form/list engine exists;
13. package/bundle performance is measured and acceptable;
14. accessibility does not regress;
15. generated apps consume shared V3 primitives without app-specific forks;
16. production evidence is recorded after deploy.

---

## 31. Explicit non-goals

This UI program does not by itself:

- redesign authoritative business workflows;
- change accounting/stock/payroll rules;
- create new backend permission models;
- add offline write semantics;
- migrate customer data;
- replace metadata with hard-coded React screens;
- clone Vben Vue internals into Forge;
- copy BigDataView code/assets without a clean source/license lock;
- turn every business page into a neon command center.

---

## 32. First implementation task

Start with **V3-00 source lock + parity matrix**, then V3-01 foundation.

Do not start by manually styling one Alumdoor page. The redesign must enter through shared Forge primitives so all current and generated apps converge automatically.

Implementation prompt:

```text
Read skills/forge-enterprise-completion/SKILL.md, CURRENT_STATUS.md, NEXT_TASKS.md,
docs/FORGE_ENTERPRISE_NORTH_STAR.md, client/ARCHITECTURE.md and
FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md.

Audit exact current main before coding. Pin exact upstream Vben 5 source tag/SHA and create a
feature/source/license parity matrix. Classify every useful Vben shell/layout/tab/preferences/
auth/overlay/motion feature as PORT, ADAPT, REPLACE_WITH_FORGE or REJECT_WITH_REASON.

Then implement only the owned UI slice on a fresh branch from exact current main. Preserve Forge
React metadata/runtime/permission authority. Do not add Vue runtime, domain business literals,
raw ECharts business metadata or a second Form/List engine. UI-only verified changes may use the
project fast path; split any shared contract/backend/schema change into its own branch and stop
before merge/deploy when policy requires approval.
```

---

## 33. Planning evidence

This spec was prepared from:

- exact Forge `main` observed at branch creation;
- Forge Enterprise Completion Skill;
- `CURRENT_STATUS.md`;
- `NEXT_TASKS.md`;
- Forge North Star;
- current MetaForge React architecture;
- current UI/shell visual implementation state;
- Vben 5 upstream/documentation and MIT license status;
- Apache ECharts upstream/release state;
- DataV upstream and MIT license status.

No production merge/deploy is performed by this documentation task.
