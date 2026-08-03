# V3-01 — FOUNDATION

Branch: `ui/v3-01-foundation`
Role: canonical design system + motion foundation owner
Program spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`

## Mission

Build the canonical Forge UI V3 foundation consumed by every other UI branch: red/black/white tokens, typography, spacing, radius, elevations, focus states, semantic colors, motion primitives and reduced-motion behavior.

Vben is the completeness/interaction reference. Forge remains React/Tailwind/Radix and must not import Vue runtime.

## Exclusive hotspots

- `client/packages/ui/src/styles.css`;
- shared theme/token files under `client/packages/ui`;
- generic motion/reduced-motion utilities that truly belong to the UI package.

Other agents consume this layer. Do not let downstream branches redefine separate palettes or motion systems.

## Required foundation

### Color identity

Canonical product identity:

- primary red: deep, high-contrast enterprise red;
- graphite/black navigation and dark surfaces;
- white/light neutral work surfaces;
- semantic green/warning/red/info remain distinct from brand red where meaning requires it;
- light/dark/system supported without white flash;
- remove blue as default product identity while preserving safe compatibility where required during rollout.

### Typography/density

- consistent heading/body/label/tab/table hierarchy;
- compact/default/comfortable density contract if supported by preferences;
- numeric/KPI typography suitable for ERP and dashboards;
- tabular numeric behavior where appropriate.

### Surface/elevation

Define deterministic levels for canvas, section, panel, overlay and command surfaces. Avoid nested-card visual noise.

### Motion system

Provide shared duration/easing/transition contracts for:

- micro interaction;
- navigation;
- workspace/page transition;
- drawer/modal/popover;
- loading/skeleton reveal;
- theme transition;
- status/value highlight;
- reduced-motion override.

Motion must be functional and restrained on business surfaces. Stronger decorative motion belongs to V3-05 command surfaces.

## Existing code audit

Audit current Zinc/Blue/Warm/extended palettes and the merged Alumdoor premium red/orange/graphite experiments. Reuse proven contrast, focus, table and shell ideas where they fit the new canonical system; do not preserve historical palette sprawl merely for nostalgia.

Classify old theme behavior as preserve/compat/deprecate before removal.

## Hard rules

- no app-specific CSS in canonical foundation;
- no `:has([data-alumdoor-logo])`-style product detection as the canonical V3 mechanism;
- no business logic;
- no permission behavior changes;
- no chart metadata contract changes;
- no arbitrary animation library dependency unless repo evidence shows clear benefit over CSS/React primitives;
- `prefers-reduced-motion` is required, not optional polish.

## Required verification

- targeted package typecheck/build where available;
- token scan for unresolved/duplicate brand authorities;
- contrast/focus review for light/dark;
- representative Button/Input/Select/Dialog/Popover/Table chrome visual evidence;
- reduced-motion evidence;
- verify existing apps still compile through shared `@metaforge/ui/styles.css` consumption.

## No-stop behavior

Decide normal token values, easing, radii and surface hierarchy autonomously within the V3 spec. If an old app requires compatibility, add a narrow compatibility seam and continue rather than stopping the whole foundation.

If a needed change crosses into shell/view/business contracts, write a Dependency Request to the owner and keep completing foundation work.

## Acceptance

Foundation is complete when downstream agents can build their V3 surfaces without inventing local brand colors, shadows, motion timings or reduced-motion behavior, and the system remains generic across Forge apps.

## Start prompt

`Đọc V3 technical spec, NO_STOP_RULE, AGENT_BOARD và V3-01-FOUNDATION.md. Làm FOUNDATION trên branch hiện tại: audit exact main, xây canonical red/black/white tokens + typography + density + elevation + motion/reduced-motion trong @metaforge/ui. Reuse evidence tốt hiện có nhưng bỏ palette/theme sprawl khi an toàn. Không sửa shell/views/business contracts. Không dừng vì blocker cục bộ; ghi Dependency Request và tiếp tục.`
