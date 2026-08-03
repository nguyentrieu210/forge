# UI V3-05 progress

Date: 2026-08-04
Work branch: `ui/v3-05-charts-command-center`
Delivery branch: `ui/v3-05-charts-command-center-delivery`
Delivery base: `main@fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`
Delivery PR: `#505`
Root-lock dependency PR: `#511`
Validation PR: `#508`

## Implemented

### `@metaforge/charts`

A dedicated presentation package now contains:

- modular Apache ECharts engine registration;
- Forge light/dark token resolution;
- responsive `ResizeObserver` lifecycle;
- reduced-motion handling;
- lazy engine loading;
- loading/error/empty states;
- accessible chart description/table fallback via Forge UI primitives;
- value/compact formatter seams;
- caller-owned click/drill-through callback;
- pure chart-model helpers and focused model tests.

Implemented chart primitives:

1. line;
2. area;
3. bar;
4. stacked bar;
5. donut;
6. scatter;
7. heatmap;
8. gauge;
9. treemap;
10. funnel;
11. sankey;
12. map/geo with caller-provided GeoJSON;
13. sparkline;
14. waterfall.

KPI/dashboard primitives:

- `ForgeKpiCard`;
- `ForgeKpiStrip`;
- `ForgeDashboardPanel`.

### `@metaforge/visual`

Separate command-center-only presentation primitives:

- `DataPanel`;
- `EdgeFrame`;
- `GlowDivider`;
- `MetricNumber`;
- `StatusPulse`;
- `FlowLine`;
- `GeoConnection`;
- `RadarFrame`;
- `CommandCenterGrid`;
- `AlertBeacon`.

These are Forge-owned CSS/SVG/React primitives with no DataV runtime dependency. Inline decorative background styles were removed in favor of token/Tailwind classes so V3-05 does not add native-UI debt.

### Existing surfaces migrated

- `DashboardView` no longer owns Recharts rendering and instead consumes `@metaforge/charts`.
- `OverviewChartCard` no longer owns Recharts rendering and instead consumes `@metaforge/charts`.
- interactive KPI, overview and command-center cards use `Button` from `@metaforge/ui` rather than browser-default buttons.
- existing route/drill-through, formatter, loading, error and empty-state behavior remains at the view boundary.
- `CommandCenterView` was added as an explicit presentational surface; it is not silently wired into authoritative metadata or routes.

### Evidence harness

An isolated demo-only surface now exists at `client/apps/demo/v3-05.html` for Playwright evidence. It renders deterministic mock presentation data only and does not create a production route or metadata contract.

The evidence suite covers:

- dashboard desktop/tablet/mobile breakpoints;
- light/dark dashboard;
- command-center fullscreen;
- repeated resize with stable ECharts canvas count;
- reduced-motion media behavior;
- screenshot artifacts;
- Axe WCAG A/AA serious/critical scan.

## Validation status

Core exact-head validation already passed in GitHub Actions run `30843088702`:

- generated root/client lockfiles;
- root/client `--frozen-lockfile` replay;
- chart model tests;
- `@metaforge/visual` typecheck;
- `@metaforge/views` typecheck;
- full client workspace typecheck;
- client selfchecks;
- runtime dependency-graph production build.

The generated client lock and migrated dashboard selfcheck are already on the delivery branch. The generated root lock is isolated in PR `#511`, which changes only root `pnpm-lock.yaml` because the production UI-only deploy guard intentionally does not classify that file as UI-only.

A later native-UI scan exposed eight V3-05 violations plus unrelated debt already present on `main`. All eight V3-05 violations have been removed. Validation now gates V3-05 files independently while recording the repository-wide native-UI debt as baseline instead of misclassifying it as a V3-05 regression.

Final responsive/fullscreen/accessibility evidence is being rerun on the current delivery head before the branch can be declared release-ready.

No production deploy is claimed yet.
