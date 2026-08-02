# WS04 -> WS09 proposal — Generic WMS Task contract

Status: **PROPOSAL / dependency evidence only**  
Owner of persistence/compiler contract: **WS09**  
Consumer domain: **WS04 Inventory/WMS**

## Goal

Provide one generic task envelope for putaway, picking, packing and replenishment without creating a second stock ledger and without hard-coding a vertical-specific task model into the shared React runtime.

## Non-negotiable boundary

A WMS task is an execution plan/audit record. It MUST NOT be authoritative stock quantity/value state.

Completion may reference a canonical stock document (`Purchase Receipt`, `Stock Entry`, `Delivery Note`, etc.), but stock movement remains authoritative only after that document posts through the normal kernel/controller/ledger path.

## Proposed logical schema

```text
Warehouse Task
- task_type: Putaway | Pick | Pack | Replenish
- company
- source_doctype
- source_name
- source_version / source_modified where available
- warehouse_scope
- assigned_to (optional until assignment)
- priority
- planned_at
- started_at
- completed_at
- cancelled_at
- state
- completion_doctype (optional)
- completion_name (optional)
- completion_version (optional)
- cancellation_reason (required on cancel)
- lines[]

Warehouse Task Line
- row_id
- item_code
- source_warehouse (optional by task type)
- target_warehouse (optional by task type)
- batch_no (optional)
- serial_no (optional)
- planned_qty_micros
- completed_qty_micros
- package_id / wave_key / reservation reference where applicable
```

Quantities are fixed-point integers at the domain boundary. Display decimals are not authoritative.

## Proposed states

Minimal generic lifecycle:

`Planned -> Assigned -> In Progress -> Completed`

Allowed side exits:

- `Planned -> Cancelled`
- `Assigned -> Cancelled`
- `In Progress -> Cancelled` only when no irreversible canonical stock posting has already completed for the task, or after the linked stock document is reversed through its own canonical correction path.

Assignment is optional. A system may move `Planned -> In Progress` when the actor starts an unassigned task and the permission contract allows self-assignment; whether that shortcut is enabled should be metadata/policy, not hard-coded in WS04.

## Completion invariants

1. `completed_qty_micros` cannot exceed `planned_qty_micros` per physical identity.
2. Serial line planned/completed quantity is exactly one stock unit.
3. Completed task cannot change item/batch/serial/warehouse identity.
4. Putaway completion must reference canonical inbound/transfer movement when the plan requires a physical move.
5. Pick completion alone does not reduce stock unless a canonical Stock Entry/Delivery posts.
6. Pack completion only reconciles against picked identities; it does not post stock.
7. Replenishment completion references canonical transfer/receipt movement.
8. Source document version/token should be checked before execution when the underlying demand may have changed.
9. Tenant/company/warehouse permission is server-side.
10. Retry with the same idempotency key must not create duplicate completion stock documents.

## Existing WS04 primitives to consume

- `requireLeafWarehouse()` — active leaf/company scope.
- `resolveWarehousePath()` — location hierarchy validation.
- `planPutaway()` — deterministic priority/capacity allocation.
- `planPicking()` — deterministic candidate allocation with shortage evidence.
- `buildPickWaves()` — deterministic grouped wave partitioning.
- `validatePacking()` — picked-vs-packed physical identity reconciliation.
- `planMinMaxReplenishment()` — explicit suggested transfer quantity.
- `normalizeInventoryScan()` — safe scanner payload normalization before permission-aware resolution.

## AppAction / metadata requirements from WS09

The persisted contract should support:

- typed child-row input/output;
- preview and commit actions;
- optimistic version token;
- idempotency key;
- row-level validation mapping;
- actor/assignee permissions;
- server-side state transitions;
- references to canonical completion documents;
- list/queue filters by state, assignee, warehouse, priority and task type.

## Explicitly out of scope

- no WMS stock ledger;
- no direct D1 mutation outside canonical document/kernel contracts;
- no React-owned business state machine;
- no Alumdoor-only task schema;
- no automatic stock posting merely because a task becomes Completed.

## Dependency mapping

This proposal refines `DR-WS04-08 -> WS09` and supports:

- `W02-004 Putaway task`
- `W02-005 Pick list` persistence
- `W02-006 Wave picking` persistence
- `W02-007 Packing` persistence
- `W02-008 Replenishment` persistence
- `W02-013 Warehouse task assignment`

WS04 can continue pure planning/integrity work independently; promotion of these capabilities from Foundation to Wired needs the WS09 persistence/action seam.
