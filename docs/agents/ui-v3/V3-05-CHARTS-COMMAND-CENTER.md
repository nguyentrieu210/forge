# V3-05 — CHARTS / COMMAND CENTER

Branch: `ui/v3-05-charts-command-center`
Role: ECharts presentation, dashboard and operational visual-language owner
Program spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`

## Mission

Create the Forge V3 visual/data layer: a consistent ECharts-based presentation system, KPI primitives, dashboard surfaces and restrained DataV-inspired command-center mode. This work must look substantially more advanced than stock Vben while remaining compatible with Forge's metadata/runtime architecture.

## Owned scope

- chart presentation wrappers/theme/config helpers that do not redefine authoritative data contracts;
- reusable KPI/metric/sparkline presentation;
- dashboard composition and data-visual loading/error states;
- DataV-inspired visual primitives implemented safely in React/CSS/SVG;
- command-center layouts and motion;
- operational visualization polish.

## Required chart primitives

Where supported by current data inputs, standardize:

- line/area;
- bar/stacked bar;
- pie/donut;
- scatter;
- heatmap;
- gauge;
- treemap;
- funnel;
- sankey;
- map/geo where existing data/source allows;
- sparkline;
- finance-oriented waterfall if justified by existing runtime inputs.

## ECharts boundary

Wrap ECharts behind Forge components/theme helpers. Keep brand red as primary series where semantically appropriate, but use a readable categorical palette for multi-series data.

Do **not** accidentally make unrestricted raw ECharts option blobs the canonical Forge metadata grammar.

If first-class chart metadata/query contracts are required, file a Dependency Request to the shared contract/App Factory owner and keep the presentation layer independently usable with current props/view-models.

## Command Center mode

Allowed visual language:

- deep black/graphite background;
- controlled red highlights;
- live/status pulse;
- subtle grid/data lines;
- panel edge/separator effects;
- animated KPI values only on meaningful entry/update;
- ECharts dataset transitions;
- operational flow lines/maps;
- alert emphasis;
- reduced-motion fallback.

Do not apply command-center decoration to ordinary accounting/list/form surfaces.

## DataV / BigDataView rule

Use DataV-style ideas as visual primitives and BigDataView only as composition inspiration. Do not pull questionable assets/code blindly. Implement source-clean primitives in Forge and record any third-party source/license used.

## Required states

- initial loading/skeleton;
- empty/no-data;
- partial data;
- error/retry;
- live/update transition;
- filter/time-range update;
- responsive dashboard stacking;
- fullscreen command-center mode;
- reduced motion.

## Verification

- chart theme consistency light/dark;
- representative dashboard desktop/tablet/mobile;
- command-center fullscreen evidence;
- ECharts resize/container behavior;
- no animation leak/perpetual unnecessary CPU loops;
- keyboard/text alternatives where relevant;
- targeted typecheck/build/tests;
- license/source record for new third-party runtime dependencies;
- performance observation for large/animated charts.

## No-stop behavior

If canonical chart metadata is missing, build a clean presentation/view-model seam and continue. Do not block the entire visual system waiting for a shared contract. Record the dependency and let CONTROL coordinate it.

## Acceptance

VISUAL is complete when Forge has one coherent chart/dashboard language, command-center mode feels intentionally more advanced than default Vben, and no presentation shortcut compromises metadata/data authority or everyday business usability.

## Start prompt

`Đọc V3 spec, NO_STOP_RULE, AGENT_BOARD và V3-05-CHARTS-COMMAND-CENTER.md. Làm VISUAL trên branch hiện tại: xây ECharts presentation system + KPI/dashboard + DataV-inspired command surfaces + motion theo red/black/white V3. Không tạo raw chart metadata authority hoặc business query contract. Nếu thiếu contract, tạo view-model seam + Dependency Request và tiếp tục.`
