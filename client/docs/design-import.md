# MetaForge — Visual Directions Import

> Source handoff: `docs/design/visual-directions-review/` exported from Claude Design.
> Imported into the reusable kit on 2026-07-25. The prototype is a visual specification,
> not production runtime code.

## Imported directions

The handoff contains seven visual references:

- `MetaForge Visual Directions.dc.html` — palette/appearance switcher.
- `MFDirection.dc.html` — foundations, list/detail/context and dark sample.
- `MetaForge Run2 - Shell & Components.dc.html` — product shell, overlays, states and P0 controls.
- `MetaForge Run3 - Awesomebar & List.dc.html` — awesomebar, list, bulk actions and mobile cards.
- `MetaForge Run4 - Form Detail.dc.html` — split detail and form layout.
- `MetaForge Run5 - Timeline & Context.dc.html` — activity, context, AI and workflow.
- `MetaForge Run6 - Secondary Screens.dc.html` — login, workspace, report, kanban, calendar,
  gantt, tree, dashboard, quick entry, print, notifications and settings.

`Run6` was the active handoff canvas and is treated as the primary reference. The other runs
provide the shared shell and component language.

## Production import strategy

The HTML prototypes were **not copied into React**. Their design language was mapped into the
shared production layers:

1. `@metaforge/ui/styles.css`
   - Neutral, MetaForge Blue and Warm palettes.
   - Light/dark appearance as an independent axis.
   - Geist/Geist Mono typography.
   - Shared elevations, panel/control radii and semantic `mf-*` component hooks.
2. `@metaforge/shell`
   - Product shell, sidebar, active navigation, topbar, awesomebar and login.
3. `@metaforge/views`
   - Workspace, List, Form, split detail/context, Report, Kanban, Calendar, Gantt,
     Tree, Dashboard and Print surfaces.
4. `@metaforge/builder`
   - Existing builder markup consumes the same surface/palette hooks; no second builder theme.
5. Generated apps
   - Apps importing `@metaforge/ui/styles.css` receive the same system automatically.

This keeps runtime metadata, permissions, routing and API contracts unchanged. The import is a
presentation-layer change rather than a fork of the engine.

## Semantic hooks added

The implementation uses reusable hooks rather than page-specific prototype CSS:

- Shell: `mf-shell`, `mf-shell-sidebar`, `mf-shell-nav-item`, `mf-shell-topbar`,
  `mf-shell-search`, `mf-shell-content`.
- Auth: `mf-login-page`, `mf-login-card`, `mf-login-site`.
- Runtime: `mf-list-view`, `mf-list-toolbar`, `mf-form-view`, `mf-form-header`,
  `mf-form-section`, `mf-split`, `mf-context-frame`, `mf-context-tabs`.
- Secondary views: `mf-report`, `mf-kanban-column`, `mf-kanban-card`,
  `mf-calendar-event`, `mf-gantt`, `mf-tree`, `mf-dash`, `mf-print-frame`.
- Builder: `mf-builder`, `mf-palette`, `mf-canvas`, `mf-props`, `mf-palette-item`.

## Token architecture

```html
<html data-brand="blue|warm" data-theme="light|dark">
```

- No `data-brand` means Neutral/Zinc.
- `data-brand="blue"` is the default product direction.
- `data-brand="warm"` is the terracotta direction.
- `data-theme` remains controlled by `useTheme` and can follow the OS.

The visual aliases (`--mf-surface`, `--mf-soft`, `--mf-text-muted`, etc.) resolve from the
canonical shadcn/Tailwind tokens. Components never carry separate palette values.

## Deliberate deviations

- Prototype sample data and hard-coded labels were not imported.
- Prototype HTML event logic was not imported.
- Existing accessibility, permission and metadata behaviour remains authoritative.
- Quick Entry is still represented by the current form/container contracts rather than a
  second form engine.
- Secondary screen functionality remains at the support level declared in
  `FIELD_TYPE_COMPATIBILITY.md` and `KNOWN_GAPS.md`.

## Verification

Run from a clean checkout with dependencies available:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
```

Visual smoke targets: login, workspace, list, form split/context, dashboard, calendar,
kanban, tree, gantt, print and all three palettes in light/dark mode.
