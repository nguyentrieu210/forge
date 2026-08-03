# UI V3-05 source lock

Date: 2026-08-04
Branch: `ui/v3-05-charts-command-center`
Scope: charts, KPI/dashboard presentation, command-center presentation primitives

## Apache ECharts

V3-05 locks its chart engine to:

- package: `echarts`
- version: `6.1.0`
- upstream: Apache ECharts
- license: Apache-2.0
- observed release date: 2026-05-18
- direct runtime dependencies observed for this release: `zrender@6.1.0`, `tslib@2.3.0`

The Forge package imports modular ECharts core/charts/components/renderers rather than a global full-bundle API. The wrapper does not expose raw ECharts options as an authoritative business contract.

## Command-center visual language

`@metaforge/visual` is Forge-owned React/CSS/SVG implementation. It borrows only generic command-center visual grammar such as restrained edge framing, metric emphasis, flow lines, radar/grid structure and status beacons.

No DataV package, copied DataV source, third-party dashboard template, proprietary asset or remote runtime is added by V3-05.

## Authority boundary

V3-05 is presentation-only:

- no backend endpoint is added or changed;
- no database/schema/migration is added or changed;
- no permission or tenant authority is changed;
- no business query becomes authoritative inside a chart component;
- no dashboard metadata contract is silently invented;
- map/geo primitives require the caller to provide the existing GeoJSON/data source;
- command-center surfaces consume caller-provided metrics/charts/alerts and do not create a shadow live-data source.

The canonical business truth remains in existing Forge services, metadata, permission and query paths.
