# GRID-01 — PARITY / REFERENCE

Branch: `agent/grid-01-parity-20260811`
Program baseline inherited from: `program/grid-parity-20260811@70676edfe930112e34dfe6b7d1fe5b89e5d7c80e`
Initial status: BOOTSTRAPPED
Risk: docs/reference/tests only unless a dependency is explicitly accepted.

## Mission

Produce the exact current-vs-mature SmartGrid parity contract so implementation does not rediscover or accidentally retire working operator behavior.

## Read first

1. `skills/forge-enterprise-completion/SKILL.md`
2. `docs/agents/grid-parity/GRID_PARITY_PROGRAM.md`
3. `docs/agents/grid-parity/AGENT_BOARD.md`
4. `docs/agents/grid-parity/NO-STOP-RULE.md`
5. current `client/packages/views/src/form/MetadataChildGrid.tsx`
6. current `client/packages/views/src/form/ChildGrid.tsx`
7. current `client/packages/views/src/form/ChildGridWithExtensions.tsx`
8. current `server/scripts/lib/alumdoor-child-presentation.mjs`
9. merged PRs #714 and #795 as historical parity evidence; inspect exact source commits where useful.

## Required output

Create/update under this branch only:

- `docs/agents/grid-parity/SMART_GRID_PARITY_MATRIX.md`
- optional deterministic reference fixture(s) / source-only regression(s) that do not change runtime behavior.

The parity matrix must classify every mature behavior as:

```text
KEEP_GENERIC
KEEP_METADATA
SERVER_OWNED
REMOVE_DEBT
NOT_APPLICABLE
```

At minimum inventory:

- adaptive columns / depends_on;
- compact vs expanded/full columns;
- selection;
- add one / add many;
- duplicate;
- move;
- delete + undo;
- column picker;
- reorder;
- resize;
- pin;
- rename/reset;
- persisted layout;
- spreadsheet paste;
- header-aware / positional paste;
- locale numerics;
- fill-down;
- keyboard navigation;
- validation/error cells;
- row detail;
- fullscreen;
- mobile cards;
- dynamic Link filters;
- server field overrides;
- preview versioning;
- dirty-state behavior.

## Required per-DocType audit

At minimum:

- Quotation Item
- Sales Order Item
- Delivery Note Item
- Sales Invoice Item
- Purchase Order Item
- Purchase Receipt Item
- two ordinary/non-AlumDoor child tables as control references.

For each, record:

```text
current quick columns
current full columns
conditional fields
internal fields
required fields
backend preview outputs
visible operator columns target
```

Do not decide target columns from old UI alone; current backend/business contracts win.

## Forbidden zone

Do not modify:

- `MetadataChildGrid.tsx`;
- AlumDoor brief/generator presentation code;
- Sales/Pricing/Stock/Payroll controllers.

## Completion evidence

Record exact branch head, sources inspected, files changed and unresolved Dependency Requests. Do not claim implementation parity; this worker only locks the reference contract.

## Startup prompt

`Đọc docs/agents/grid-parity/GRID-01-PARITY.md + GRID_PARITY_PROGRAM.md + Forge Enterprise Completion Skill. Audit exact branch/current main. So sánh MetadataChildGrid hiện tại với mature ChildGrid và historical merged evidence #714/#795; lập SMART_GRID_PARITY_MATRIX theo KEEP_GENERIC/KEEP_METADATA/SERVER_OWNED/REMOVE_DEBT/NOT_APPLICABLE và per-DocType Sales/Purchase column matrix. Không sửa runtime hoặc business metadata. Ghi Dependency Request nếu cần và tiếp tục phần độc lập. Không merge/deploy.`
