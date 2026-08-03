# UI V3-05 progress

Date: 2026-08-04
Work branch: `ui/v3-05-charts-command-center`
Current-main observed during final convergence check: `bbf79b541ede38222544774ec8b5393f8e1bb1fe`

## Implemented

### `@metaforge/charts`

A dedicated presentation package now contains:

- modular Apache ECharts engine registration;
- Forge light/dark token resolution;
- responsive `ResizeObserver` lifecycle;
- reduced-motion handling;
- lazy engine loading;
- loading/error/empty states;
- accessible chart description/table fallback;
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

These are Forge-owned CSS/SVG/React primitives with no DataV runtime dependency.

### Existing surfaces migrated

- `DashboardView` no longer owns Recharts rendering and instead consumes `@metaforge/charts`.
- `OverviewChartCard` no longer owns Recharts rendering and instead consumes `@metaforge/charts`.
- existing route/drill-through, formatter, loading, error and empty-state behavior remains at the view boundary.
- `CommandCenterView` was added as an explicit presentational surface; it is not silently wired into authoritative metadata or routes.

## Static audit completed

- ECharts `GraphicComponent` is explicitly registered because the donut primitive uses the graphic layer for center metric text.
- V3-05 does not change server, schema, migration, permission, tenant or business-authority code.
- command-center motion uses reduced-motion fallbacks.
- direct Recharts ownership in the two audited dashboard chart surfaces has been removed from implementation code.

## Validation status

Not yet claimed green.

A temporary branch-only GitHub Actions workflow was attempted and removed after confirming it could not provide PR validation: pull-request workflows are loaded from the base/default branch, while this workflow existed only on the feature branch. The available execution container also cannot retrieve the ECharts package from the required registry/GitHub network path.

Therefore no fabricated `typecheck passed`, `tests passed` or `production deployed` claim is recorded here.

The remaining blocker and exact completion commands are recorded in `client/docs/ui-v3-05-dependency-request.md`.
