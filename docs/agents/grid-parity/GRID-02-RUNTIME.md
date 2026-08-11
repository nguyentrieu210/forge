# GRID-02 — RUNTIME / SMART CHILD GRID

Branch: `agent/grid-02-runtime-20260811`
Program baseline inherited from: `program/grid-parity-20260811@70676edfe930112e34dfe6b7d1fe5b89e5d7c80e`
Initial status: BOOTSTRAPPED
Risk: STANDARD shared-runtime behavior.

## Mission

Restore mature SmartGrid operator interactions in the metadata-owned child-grid path without reintroducing vertical/business formulas into React.

## Read first

1. `skills/forge-enterprise-completion/SKILL.md`
2. `docs/agents/grid-parity/GRID_PARITY_PROGRAM.md`
3. `docs/agents/grid-parity/AGENT_BOARD.md`
4. `docs/agents/grid-parity/NO-STOP-RULE.md`
5. current `MetadataChildGrid.tsx`, `ChildGrid.tsx`, `ChildGridWithExtensions.tsx`, table control registration and grid tests.
6. GRID-01 parity matrix when it becomes available; do not block obvious independent extraction while waiting.

## Owned hotspot

Preferred:

```text
client/packages/views/src/form/MetadataChildGrid.tsx
client/packages/views/src/form/child-grid-presentation.ts   # interpretation only when needed
client/packages/views/src/grid/**                           # generic extraction if justified
client/packages/views/tests/**                              # runtime-focused tests only
```

## Required direction

Do not simply switch metadata-owned tables back to legacy `ChildGrid`. Build one generic smart path or extract reusable primitives so metadata ownership and smart interaction coexist.

Target interaction parity includes, subject to GRID-01 evidence:

- adaptive applicable-column suppression using `resolveField`;
- compact vs full/expanded surfaces from metadata;
- column picker / reorder / resize / pin / reset / persisted layout;
- row selection;
- add row and add-many;
- duplicate / move / delete / undo;
- spreadsheet paste / fill-down;
- keyboard navigation;
- row detail;
- fullscreen/large-grid surface;
- mobile card parity;
- control registry reuse;
- masked/read-only/permission-safe cells;
- dynamic Link target/filter support;
- server `field_overrides`;
- server preview on every edit path, including paste/fill;
- stale preview protection.

## Hard architecture boundary

Generic runtime must not contain:

- AlumDoor names;
- Item Price/Pricing Rule business rules;
- door/rail/shaft logic;
- purchase barem formulas;
- stock calculations;
- payroll logic;
- hard-coded Sales/Purchase DocType branches unless a truly generic compatibility seam already exists and is being removed rather than expanded.

Legacy source may be mined for interaction code, but business algorithms must be discarded or replaced by metadata/server-preview seams.

## Required tests

At minimum prove:

1. metadata-owned grid does not lose smart-toolbar features;
2. inapplicable columns disappear from compact view;
3. internal fields never surface;
4. layout preferences survive reload and reset safely;
5. paste/fill respects read-only/hidden/masked cells;
6. paste/fill invokes the same server preview path as manual edits;
7. stale preview does not overwrite a newer edit;
8. mobile remains usable;
9. a non-AlumDoor child meta can use the same renderer with zero vertical literals.

## Dependency boundary

GRID-03 owns exact AlumDoor quick/full/internal field declarations. If a runtime test needs an AlumDoor field list, use a fixture or issue a Dependency Request; do not edit the source brief.

## Completion

When ready, record exact head, diff, tests/build/typecheck/browser evidence actually run, and any parity items still intentionally deferred. Stop before merge/deploy.

## Startup prompt

`Đọc docs/agents/grid-parity/GRID-02-RUNTIME.md + GRID_PARITY_PROGRAM.md + Forge Enterprise Completion Skill. Audit exact branch/current main. Khôi phục SmartGrid interactions cho metadata-owned child grid bằng generic runtime/extraction, giữ metadata + server preview authority, không copy business formula từ legacy ChildGrid. Cover adaptive columns, layout controls, row ops, spreadsheet/keyboard, row detail/fullscreen/mobile và preview parity. Không sửa AlumDoor presentation source. Ghi Dependency Request và tiếp tục phần độc lập. Không merge/deploy.`
