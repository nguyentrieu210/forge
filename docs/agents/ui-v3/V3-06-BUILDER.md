# V3-06 — BUILDER

Branch: `ui/v3-06-builder`
Role: App Factory / Builder visual and interaction overhaul owner
Program spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`

## Mission

Rebuild the MetaForge Builder into a V3-grade authoring workbench using the same canonical Forge runtime and design system. The Builder must feel like a serious product design/low-code environment, not a separate theme or second renderer.

## Exclusive hotspots

- `client/packages/builder/src/**` visual/layout work;
- Builder-specific workbench chrome;
- component palette, canvas framing, properties/inspector layout;
- Builder-local interaction/motion that consumes shared primitives.

Do not change canonical metadata contracts unless separately coordinated with WS09/shared-contract ownership.

## Target layout

Desktop workbench:

```text
Component/Structure panel | Runtime Canvas | Properties/Rules panel
```

Required behaviors:

- resizable/collapsible side panels;
- clear active selection and hierarchy;
- search/filter component palette;
- canonical field/layout/action/view categories;
- runtime-authentic canvas/preview;
- inspector sections for general/data/display/rules/permission using existing capabilities;
- undo/history UX where existing Builder kernel supports it;
- dirty/save/publish state clarity;
- keyboard/focus behavior;
- responsive minimum supported layout for tablet where reasonable;
- V3 red/black/white identity and motion.

## Core invariant

Builder preview must continue using the same canonical renderer/runtime used by generated/live apps. Do not implement a visual-only pseudo-renderer that drifts from production behavior.

## Vben parity

Use Vben settings/layout/workbench conventions where useful, but the Builder's authoring workflow is Forge-specific and should exceed a generic admin template.

## Hard rules

- no second metadata dialect;
- no raw free-form escape hatch for authoritative semantics;
- no business/domain hard-code in generic Builder;
- no duplicate permission model;
- no direct API bypass;
- no independent palette/motion system; consume V3-01;
- do not edit shared views/shell hotspots just to make Builder easier.

## Dependency behavior

If authoring requires a new shared `viewPolicy`, AppAction, chart contract or compiler behavior, write a Dependency Request to WS09/shared-contract owner. Keep building all presentation and already-supported authoring paths independently.

## Verification

- component palette search/select;
- canvas selection/preview;
- property editing;
- dirty/history/save UX where available;
- desktop and tablet evidence;
- keyboard/a11y/reduced-motion;
- targeted Builder typecheck/build/tests;
- confirm Builder preview and runtime remain the same rendering authority.

## No-stop behavior

Make normal workbench layout, panel sizing, interaction and information hierarchy decisions autonomously. Unsupported future metadata features should appear as documented parity/dependency gaps, not reasons to halt the V3 Builder overhaul.

## Acceptance

BUILDER is complete when the existing authoring capabilities are presented through a coherent V3 workbench, preview parity is preserved, and no new shadow runtime or metadata authority is introduced.

## Start prompt

`Đọc V3 spec, NO_STOP_RULE, AGENT_BOARD và V3-06-BUILDER.md. Làm BUILDER trên branch hiện tại: rebuild workbench chrome/palette/canvas/inspector theo Forge V3, giữ canonical runtime preview và metadata authority. Không sửa shared contract ngoài ownership; nếu thiếu contract ghi Dependency Request rồi tiếp tục mọi authoring/presentation độc lập.`
