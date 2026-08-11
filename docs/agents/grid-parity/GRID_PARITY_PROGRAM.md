# GRID PARITY PROGRAM — 2026-08-11

Status: PROGRAM BOOTSTRAP
Control branch: `program/grid-parity-20260811`
Exact baseline: `main@cecb19c51855ab3e6a05ce84261d717c630c96b7`
Scope: child-table/grid presentation and interaction parity after metadata-driven convergence, with AlumDoor as the reference vertical.

## 1. Problem statement

The current backend convergence is not the problem. The regression is in the child-grid presentation path.

Current runtime routing is:

```text
Table field
  -> table-controls.tsx
  -> MetadataChildGrid
     -> metadata-owned grid if child metadata explicitly owns form/quickEntry/surface
     -> legacy ChildGridWithExtensions only when metadata does NOT own presentation
```

AlumDoor `applyAlumdoorChildPresentation()` currently walks every child DocType and materializes `surface`, `form`, and `quickEntry` presentation. This makes a wide set of AlumDoor child tables metadata-owned and therefore routes them away from the mature grid.

The new `MetadataChildGrid` preserves the correct metadata/server-preview authority, but its interaction surface is intentionally minimal: responsive table/cards, add row, delete row, compact/expanded switch, control registry, server preview, server field overrides.

The mature grid still exists in `client/packages/views/src/form/ChildGrid.tsx` and historically supported a much richer operator workflow. Therefore the goal is NOT to roll back metadata-first architecture. The goal is to recover the mature smart-grid interaction model behind the metadata-owned path.

## 2. Confirmed regression classes

### R1 — Smart-grid tool regression

Metadata-owned grids currently lose or do not expose parity for the mature grid capabilities:

- column picker / hide-show;
- reorder;
- resize;
- pin/unpin;
- label rename/reset and persisted per-grid layout;
- multi-row selection;
- add one / add many;
- duplicate rows;
- move up/down;
- delete selected + undo;
- spreadsheet copy/paste;
- locale-aware pasted numeric parsing;
- header-aware / positional paste;
- fill-down;
- keyboard cell navigation;
- invalid-cell feedback;
- row detail editing;
- full-screen / large-grid mode;
- adaptive column suppression by `depends_on` / permission / row applicability.

Historical source and merged PR evidence show these were deliberate product behaviors, not accidental code.

### R2 — Too many / wrong columns

The metadata resolver itself is generic, but current AlumDoor presentation policy is stale relative to the newly converged Sales backend.

The current Sales quick policy still references legacy-facing fields such as:

```text
sales_mode
discount_percentage
amount
```

while current Sales authority now includes operator/server fields such as:

```text
sales_option
sales_option_code / label / version
price_variant
discount_basis_variant
discount_amount
adjustment_amount
net_amount
sales_package snapshots
```

The final visible column list must be derived from current backend contracts and operator needs; internal snapshots must not leak into business grids.

### R3 — Required-field inflation

`closeQuickOverRequired()` currently forces required editable fields into quick presentation. This is safe against making a required input unreachable, but it can make the compact grid wide and noisy when a field is required only conditionally for some row types.

The target rule is:

> A required field must remain reachable, but not necessarily as an always-visible column.

Conditional fields may be surfaced only when applicable, or through expanded/row-detail surfaces, provided the operator cannot reach a server-required state without a visible editor.

### R4 — Old client business intelligence must NOT be resurrected as authority

The mature `ChildGrid.tsx` accumulated Sales/Purchase calculations and item-specific adaptation over time. Current architecture has moved authoritative preview/calculation to server methods such as AlumDoor child-row preview and canonical domain controllers.

Parity recovery must split the old grid into:

```text
KEEP / GENERALIZE
  interaction shell
  spreadsheet UX
  column/layout UX
  keyboard/a11y
  row operations
  permission-aware field rendering
  conditional visibility

DO NOT RESTORE AS CLIENT AUTHORITY
  pricing formulas
  stock formulas
  door formulas
  purchase barem authority
  business-specific item classification when server/metadata now owns it
```

## 3. Target architecture

```text
Canonical child metadata
  - fields
  - form / quickEntry
  - surface
  - depends_on / read_only_depends_on
  - permissions
  - previewMethod / previewParentFields
        |
        v
Generic Smart Child Grid
  - compact operator columns
  - expanded/full grid columns
  - adaptive applicable columns
  - layout preferences
  - spreadsheet operations
  - row operations
  - mobile/tablet/desktop presentation
        |
        v
ControlRegistry / resolveField
        |
        v
Named server preview
  -> patch / clear / field_overrides
        |
        v
Canonical save/submit controller
```

The renderer must contain no AlumDoor, Item Price, door, rail, payroll, stock, or procurement business rule literals.

## 4. Smart-grid parity contract

### P0 — Correctness / safety

1. Only metadata-declared business columns are candidates for display.
2. `surface=internal`, hidden, masked and server-only snapshots never become normal columns.
3. `resolveField` remains the visibility/read-only/permission evaluator.
4. A column that is inapplicable to every current row is suppressed from compact view.
5. Server `field_overrides` can change hidden/required/read-only/link-filter/label presentation per row.
6. Manual edit, paste and fill-down use the same preview/effect path.
7. Async preview is version-guarded; stale responses cannot overwrite newer edits.
8. Opening an existing document must not mark it dirty merely because the grid hydrates display metadata.

### P1 — Spreadsheet/operator parity

1. Add row and configurable add-many.
2. Multi-row select.
3. Duplicate selected/current row.
4. Move rows up/down.
5. Delete selected/current rows.
6. Undo last deletion.
7. Column picker.
8. Column reorder.
9. Column resize.
10. Pin/unpin.
11. Optional display-label customization with reset.
12. Persist layout by child DocType + presentation mode + schema/policy version.
13. Excel/Sheets TSV paste with quoted tabs/newlines/escaped quotes.
14. Header-aware or positional paste.
15. Vietnamese/international numeric paste.
16. Respect hidden/masked/read-only/disabled cells during paste.
17. Per-cell validation/error indication.
18. Fill-down on selected rows.
19. Enter / Shift+Enter / Tab navigation.
20. Row detail surface.
21. Full-screen/large-grid mode.
22. Mobile remains touch-friendly; do not replace working cards with a desktop table squeezed onto mobile.

### P2 — Column intelligence

Compact view must be operator-first.

For a mixed transaction grid:

- identity column is always reachable;
- current-row/applicable fields can appear dynamically;
- conditional fields do not create permanent columns of `—`;
- technical/snapshot fields stay internal;
- expanded/full mode may expose additional business-detail fields, not raw implementation snapshots by default;
- requiredness is evaluated per row, not used as a blanket reason to expose every conditional field.

## 5. AlumDoor reference acceptance

At minimum certify these child tables:

### Sales

- `Quotation Item`
- `Sales Order Item`
- `Delivery Note Item`
- `Sales Invoice Item`

Sales operator target starts from current commercial architecture, not legacy literals. Candidate compact columns must be audited from current backend and business-case contract. Expected family includes:

```text
Mặt hàng
Phương án bán
Màu (when applicable)
Rộng/Cao or relevant dimension (when applicable)
Số bộ / quantity basis
SL tính tiền
ĐVT
Đơn giá
Tiền CK
Phụ thu
Thành tiền
```

Exact visibility is conditional and must be evidence-backed.

### Procurement / stock

- `Purchase Order Item`
- `Purchase Receipt Item`
- representative generic/ordinary child tables

Do not regress the smart purchase workflows already proven historically: compact order entry, expanded detail, row operations, layout controls and spreadsheet entry.

## 6. Workstreams

### GRID-01 — PARITY / REFERENCE

Owns:

- current-vs-mature feature inventory;
- exact historical source/PR evidence;
- per-DocType column parity matrix;
- acceptance scenarios;
- architectural debt classification (`keep`, `generalize`, `server-owned`, `remove`).

Must not modify shared runtime or business metadata.

### GRID-02 — RUNTIME

Owns:

- generic metadata-owned Smart Child Grid runtime;
- shared grid interaction primitives;
- spreadsheet/keyboard/layout/mobile behavior;
- reuse/extraction from mature grid where safe;
- no business-specific formulas or DocType branching.

Preferred hotspot:

```text
client/packages/views/src/form/MetadataChildGrid.tsx
client/packages/views/src/form/child-grid-presentation.ts (runtime-only interpretation if required)
client/packages/views/src/grid/** or equivalent generic extraction
```

Forbidden:

```text
server/scripts/lib/alumdoor-child-presentation.mjs
AlumDoor brief business column declarations
pricing/stock/payroll controllers
```

### GRID-03 — ALUMDOOR META

Owns:

- reconcile child-grid metadata against current backend fields;
- correct quick/full/internal surfaces;
- current Sales Option / pricing / package field projection;
- purchase/receipt presentation policy;
- generated AlumDoor brief/materialized metadata;
- server metadata regression tests.

Preferred hotspot:

```text
server/scripts/lib/alumdoor-child-presentation.mjs
server/scripts/build-alumdoor-v2-brief.mjs
server/briefs/alumdoor-v2.json (generated only)
server/tests/*child-grid* / focused metadata contracts
```

Forbidden:

```text
client/packages/views/src/form/MetadataChildGrid.tsx
shared renderer implementation
business controller authority
```

### GRID-04 — QA / CONVERGENCE

Owns:

- parity regression suite;
- browser/E2E fixtures;
- desktop/tablet/mobile evidence;
- Sales + Purchase representative flows;
- leakage scan preventing business rules from re-entering generic renderer;
- convergence audit of GRID-02 + GRID-03 heads.

Must not solve failures by implementing another owner's business/runtime logic.

## 7. Dependency graph

```text
GRID-01 parity contract ─────┐
                            ├──> GRID-04 convergence/evidence
GRID-02 runtime ─────────────┤
GRID-03 AlumDoor metadata ───┘
```

GRID-02 and GRID-03 may run in parallel using this program contract. GRID-01 may refine the parity matrix without blocking obvious independent implementation. GRID-04 can bootstrap fixtures immediately but may only certify after exact candidate heads converge.

## 8. Risk / merge boundary

- GRID-01: docs/tests only unless later evidence requires otherwise.
- GRID-02: shared client runtime; STANDARD unless implementation remains strictly presentation-only. Treat as STANDARD program work because it changes shared operator behavior.
- GRID-03: metadata/source brief; STANDARD and potentially release-candidate changing.
- GRID-04: tests/evidence.

No production deploy, tenant metadata install, D1 mutation, DNS/secret/provider change or customer-data mutation is authorized by this program bootstrap.

Do not merge the non-trivial runtime/metadata convergence into `main` solely because branches are green. Convergence review and explicit merge authorization remain separate.

## 9. Definition of done

The program is complete only when:

1. metadata-owned grids retain metadata/server authority;
2. mature SmartGrid operator interactions have parity or an explicit evidence-backed retirement decision;
3. compact grids stop showing irrelevant columns;
4. Sales quick/full columns match the current commercial backend, including Sales Option and server-resolved monetary outputs;
5. internal snapshots do not leak;
6. Sales and Purchase representative flows pass browser evidence;
7. desktop/tablet/mobile behavior is verified;
8. generic renderer contains no vertical business literals;
9. exact convergence SHA passes targeted MetaForm/grid contracts and build/typecheck gates;
10. no production mutation is performed without a separate authorization.
