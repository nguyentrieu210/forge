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

---

## Execution handoff — 2026-08-11

Status: `READY` for convergence/QA; not merged or deployed.
PR: `#826` → `program/grid-parity-20260811`
Implementation candidate audited after GRID-01 matrix: `c9d6995c8210195ff8116faf0deb28c2cefa0ead`

### Implemented

- metadata-owned routing remains separate from legacy fallback, with hook-order invariant;
- adaptive whole-column applicability through `resolveField` + server `field_overrides`;
- compact/full metadata surfaces with internal-field suppression;
- schema/policy-versioned local layout: picker, order, width, pin, alias, reset;
- row selection, add-one/add-many, editable-value duplicate, stable move, batch delete + undo;
- quoted TSV, header/positional paste, locale numeric parsing and per-cell parse errors;
- fill-down only to blank editable selected targets;
- Enter/Shift+Enter/Tab navigation with writable edge-row creation;
- row detail, fullscreen sheet and mobile-card editing;
- one mutation seam for manual/paste/fill with permission/mask checks and server preview;
- duplicate rows re-enter server preview instead of copying server/internal snapshots;
- stale async preview version guard retained;
- first persisted-document hydration consumes projection overrides without applying preview patch/clear through `onChange`, avoiding dirty-on-open from projection loading.

### GRID-01 reconciliation

Consumed `agent/grid-01-parity-20260811/docs/agents/grid-parity/SMART_GRID_PARITY_MATRIX.md` after it reached `READY`.
The runtime candidate was tightened for the locked contracts on duplicate preview, blank-only fill-down, edge keyboard behavior, cell feedback and hydration dirty-state safety.

### Diff / ownership audit

PR changes are limited to generic client grid runtime/helper, runtime-focused tests/selfcheck wiring, and this GRID-02 handoff document.
No AlumDoor presentation source, generated business brief, Sales/Pricing/Stock/Payroll controller, schema/migration or deployment code is changed by GRID-02.

### Executable evidence actually run

- GitHub Actions workflow runs on candidate head: **none**.
- GitHub combined commit statuses: **none**.
- Browser/E2E run: **none**.
- Typecheck/build run: **none from GitHub**, because the program/control branch has no workflow trigger covering PR #826.
- PR mergeability check: GitHub reports mergeable before final handoff update.

Runtime source-contract tests and a deterministic generic smart-grid selfcheck are authored/wired in the PR, but are not claimed as executed evidence here.

### Dependency Request

Owner: `GRID-04 QA`
Need: Run the exact convergence candidate through client typecheck/build, hook-order lint, metadata-child-grid source/selfcheck coverage and representative browser flows; certify no internal/masked leakage, no dirty-on-open regression, manual/paste/fill/duplicate preview equivalence, blank-only fill-down, keyboard edge-row behavior and mobile/fullscreen usability.
Why: Executable convergence/browser evidence belongs to GRID-04, and the current control branch does not trigger a GitHub Actions validation run for PR #826.
Blocked scope: final executable parity certification only.
Can continue independently: yes — GRID-02 implementation and ownership audit are complete.
Next independent work: coordinator converges GRID-02 with GRID-03 candidate, then GRID-04 validates that exact head.

### Stop boundary

Risk remains `STANDARD` shared-runtime behavior. Do not merge or deploy this worker PR without the program convergence/QA step and explicit authorization required by the Forge completion skill.
