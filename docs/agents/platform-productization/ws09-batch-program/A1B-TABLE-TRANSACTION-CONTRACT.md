# A1B — Table Transaction Contract Correction

Date: 2026-08-04
Branch: `agent/ws09-batch-01b-table-transaction`
Owner: WS09 shared App Factory contract
Risk: STANDARD shared contract; downstream Stock remains CRITICAL

## Why this correction exists

The accepted A1 contract originally treated every row in an AppAction input table as one executor item. That shape is valid for independent row operations, but it is not valid for every repeatable-input action.

Two canonical WS09 consumers prove the distinction:

- Stock Reconciliation is one authoritative document whose frozen snapshot/count rows are children of the same transaction.
- BOM bulk entry is one authoritative Draft whose component rows are children of the same BOM revision.

Forcing either consumer through row-only itemization would split one domain transaction into unrelated writes or require a vertical-specific encoding workaround in the generic layer.

## Canonical itemization

`AppActionBatchContract` now declares:

- `itemization: row | table`;
- default is `row` when an older v1 batch declaration omits the field;
- `row` requires `item_id_field` naming one input-table column;
- `table` forbids `item_id_field` and treats the entire ordered table as one executor item;
- `max_items` always bounds input rows, not executor-item count.

### Row mode

For row `R`:

- `item_id = R[item_id_field]`;
- `operation_id = batch_id:item_id`;
- executor value = `{ shared_inputs, item: R }`.

Use this when rows are genuinely independent domain operations.

### Table mode

For input table `lines`:

- one executor item only;
- `item_id = lines`;
- `operation_id = batch_id:lines`;
- executor value = `{ shared_inputs, item: { lines: [ordered rows...] } }`.

Use this when the table is the child collection of one domain-owned transaction/document.

## Invariants

- Table mode does not weaken row/payload bounds.
- Input row order participates in canonical request identity.
- Shared scalar inputs participate in canonical request identity.
- Idempotency key remains excluded from request-hash material and is the tenant-scoped replay key.
- Tenant/user/roles remain trusted server context, not payload authority.
- Preview remains mandatory and side-effect free.
- The generic layer still contains no Stock/BOM fields or lifecycle rules.
- Domain controller/resource remains authoritative for validation, permission, correction, ledger and persistence.

## Compatibility

Existing contract v1 declarations without `itemization` parse as `row`. Existing first-class/legacy `BulkTransaction` persistence continues unchanged except that normalized batch metadata now records the explicit itemization value.

No migration is required: this is manifest metadata normalized through the existing compatibility bridge.

## Consumer decision

- A3 Stock Reconciliation: `itemization=table`.
- A4 BOM bulk Draft: `itemization=table`.
- Future genuinely independent operations may use `itemization=row`.

This document changes no domain authority and performs no production operation.
