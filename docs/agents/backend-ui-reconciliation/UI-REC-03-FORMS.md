# UI-REC-03 — FORM / LIST / WORKSPACE PROJECTION

Branch: `agent/ui-rec-03-form-list-workspace-20260811`
Fork point: `program/backend-ui-reconciliation-20260811@c4209b8318ac36110ca84094d905ce724ffae3d5`
Status: RUNNING
Risk: STANDARD; shared runtime contract changes require convergence and explicit merge approval.
PR: `#829` → `program/backend-ui-reconciliation-20260811` (draft; do not merge/deploy from worker).

## Current progress — 2026-08-11

Substantive implementation has started on the P0 Attendance/Payroll lane.

- `AlumDoor Attendance Day`: explicit operator list + full/detail form; Quick Entry disabled because human roles are read/report-only while system roles own record creation/update.
- `AlumDoor Attendance Policy`: explicit useful list + full workflow form; Quick Entry disabled because the policy is coupled, versioned and submittable.
- `AlumDoor Pay Profile`: explicit useful list + full workflow form; hidden server-owned `profile_key` stays outside the operator form; Quick Entry disabled.
- Focused regression coverage reads the real app source through `readAppSource`, so assertions run after canonical metadata derivation rather than against hand-parsed JSON only.
- Sales Order canonical summary/preview projection already exists in the current AlumDoor V2 source and has focused regression coverage; do not duplicate its pricing logic in client code.

No Grid runtime, sidebar/catalog, controller, schema, migration or business-formula changes are owned by this slice.

## Dependency Request

```text
Dependency Request
Owner: UI-REC-01 / GRID program
Need: final backend↔metadata truth matrix and exact child-grid candidate
Why: REC3 owns parent Form/List/Workspace projection, not truth inventory or Grid interaction runtime
Blocked scope: final REC3 closure/certification only
Can continue independently: yes
Next independent work: Sales, Purchase/Receipt and Inventory parent projection audit; generator-owned drift is routed through source rather than hand-editing generated briefs
```

## Mission

Audit and reconcile user-facing Form/List/Workspace metadata with current backend authority, excluding Grid interaction implementation which belongs to the Grid parity program.

## Read first

1. exact branch/main state;
2. `skills/forge-enterprise-completion/SKILL.md`;
3. `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md`;
4. `docs/agents/backend-ui-reconciliation/PROGRAM.md`;
5. UI-REC-01 truth/matrix when available;
6. current brief generators, viewPolicy/form composition contracts, FormView/List/Workspace generic runtime;
7. Grid program contract to respect ownership boundary.

## Audit scope

Priority flow families:

```text
Sales / CRM
Procurement
Inventory / ATP / warehouse
Manufacturing
Attendance / Payroll
Finance / AR / AP / payment
Warranty / Service
```

For each primary DocType/surface verify:

- operator primary vs secondary vs internal fields;
- section/tab/main/aside/full/summary composition;
- quick-entry vs full-page/workspace precedence;
- readonly/required/depends/fetch/link behavior;
- server preview method + declared dependencies + output fields;
- workflow/action buttons and state visibility;
- list identity columns, useful filters/status and bulk affordances;
- correction/cancel/amend surfaces where applicable;
- child-table metadata declarations only; Grid interaction parity remains external dependency.

## Reference failure modes

- Sales Order server preview returns canonical totals but metadata omits fields;
- required server field has no reachable editor;
- internal snapshot appears as ordinary form/list field;
- stale legacy field remains visible after backend authority changes;
- operational full workspace is accidentally collapsed into quick-entry behavior;
- action exists server-side but no valid UI path exposes it.

## Allowed zones

- source brief/view-policy/form/list/workspace declarations;
- generators and generated artifacts through source;
- focused form/list/workspace tests;
- generic shared projection primitive only when business-neutral, reusable and not already owned elsewhere.

## Forbidden

- `MetadataChildGrid` smart interaction implementation;
- sidebar/catalog ownership of UI-REC-02;
- pricing/stock/payroll/manufacturing formulas in React;
- domain controller changes merely to simplify presentation.

## Grid dependency

May audit which child fields should be quick/full/internal and whether inputs are reachable. Do not certify child-table operator parity until the Grid program produces an exact candidate and QA verifies it.

## Acceptance

- P0 primary forms/lists/workspaces reflect current backend contracts;
- preview outputs intended for users are materialized;
- internal fields do not leak by default;
- required fields/actions are reachable before authoritative transition;
- metadata remains declarative and generated outputs reproducible;
- targeted regressions prove corrected projection contracts;
- branch remains unmerged/un-deployed until convergence gate.

## Startup prompt

`Đọc docs/agents/backend-ui-reconciliation/UI-REC-03-FORMS.md, PROGRAM.md và Forge Enterprise Completion Skill. Audit exact Form/List/Workspace projection against current backend, ưu tiên Sales/Procurement/Inventory/Attendance-Payroll. Sửa source metadata/generator, khóa preview outputs, required reachability, internal-field hiding và workspace precedence. Không implement Grid smart interactions, không đưa business formulas vào React. Ghi Dependency Request khi cần GRID/domain owner. Không merge/deploy.`
