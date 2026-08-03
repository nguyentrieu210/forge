# A1 — Canonical BatchAction / BatchTransaction Contract

Date: **2026-08-04**  
Owner: **WS09 A1 — shared App Factory contract**  
Branch: `agent/ws09-batch-01-contract`  
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`  
Risk: **STANDARD contract; consumed by CRITICAL executor/inventory lanes**

## 1. Purpose

Define one vertical-neutral batch contract for App Factory actions. Inventory, BOM and future apps must consume this contract instead of creating module-specific bulk execution semantics.

The contract does **not** own Stock, BOM, GL, valuation, document lifecycle or legal behavior. Those remain with the canonical domain controller reached by the action method.

## 2. Architecture

```text
AppAction
  + input_tables[]
  + batch
       |
       v
normalizeBatchActionInvocation()
       |
       +-- shared_inputs  (ordinary scalar action inputs)
       +-- items[]        (bound repeatable rows)
       +-- stable item identity / operation_id
       |
       v
toBatchExecutorPlan(..., requestHash)
       |
       v
A2 generic executor
       |
       v
domain-owned adapter/controller
       |
       v
canonical authoritative write path
```

A2 owns execution/replay storage and hashing implementation. A1 owns the public semantics and the canonical material that A2 hashes.

## 3. Metadata contract

An AppAction may declare:

```json
{
  "batch": {
    "contract_version": 1,
    "input_table": "lines",
    "item_id_field": "row_id",
    "atomicity": "independent",
    "max_items": 100
  }
}
```

Rules:

- `contract_version` is exactly `1`;
- `input_table` must name one declared `input_tables[]` field;
- `item_id_field` must name one column of that table;
- `atomicity` is exactly `atomic` or `independent`;
- `max_items` is `1..500`, cannot exceed the input table `max_rows` and cannot be below its `min_rows`;
- a batch action must declare `preview` as well as `commit`;
- the contract contains no tenant, user, role, warehouse, company, Stock or BOM field name.

## 4. Author-facing brief contract

App Factory briefs use camelCase at the authoring boundary:

```json
{
  "batch": {
    "contractVersion": 1,
    "inputTable": "lines",
    "itemIdField": "row_id",
    "atomicity": "independent",
    "maxItems": 100
  }
}
```

`batch-action-brief.mjs` validates this extension and strips only this owned key before the legacy AJV schema. Other unknown action keys continue to fail `additionalProperties=false`.

The App Factory compiler normalizes it into the canonical snake_case manifest contract.

## 5. Request contract

The route/action layer supplies:

```json
{
  "contract_version": 1,
  "batch_id": "request-20260804-001",
  "idempotency_key": "client-retry-key",
  "payload": {
    "some_scalar_input": "value",
    "lines": [
      { "row_id": "row-1" },
      { "row_id": "row-2" }
    ]
  }
}
```

Trusted tenant, actor, roles and authorization are **not** part of this request contract. They must come from server-authenticated context.

Commit requires an `idempotency_key`. Preview does not require one because preview is required to have zero authoritative side effects.

The payload is bounded to **2,000,000 UTF-8 bytes** and item count is bounded by the metadata contract.

## 6. Shared inputs are not lost

The bound input table is separated from ordinary scalar action inputs:

```text
payload.lines -> items[]
payload minus lines -> shared_inputs
```

A2 receives every item as:

```text
{
  shared_inputs: <scalar action inputs>,
  item: <one input-table row>
}
```

This is required for generic actions where every row shares company, date, warehouse, supplier, target document or another scalar parameter. A1 does not interpret any of those keys.

## 7. Identity and ambiguous retry

### Batch identity

`batch_id` is caller correlation identity. It is not tenant authority.

### Item identity

`item_id_field` selects the stable row identity. Duplicate item IDs fail before execution.

### Operation identity

Every row deterministically receives:

```text
operation_id = batch_id + ":" + item_id
```

A2/domain adapters must carry this stable operation identity into canonical command/idempotency correlation where applicable.

### Commit replay

Commit requires a tenant-scoped idempotency key at the A2 replay-store boundary.

Same key + same canonical request may replay the stored result.

Same key + different canonical request must fail as an idempotency conflict.

The canonical request material includes:

- contract version;
- batch ID;
- mode;
- atomicity;
- **all shared scalar inputs**;
- ordered item IDs, indexes and row values.

It intentionally excludes the idempotency key itself. Object keys are stable-sorted before hashing material is produced.

This closes the ambiguous-transport-failure case: changing a shared scalar parameter while reusing the same idempotency key cannot be mistaken for the original request.

## 8. Preview / commit semantics

- Batch metadata requires the AppAction to have a `preview` method.
- Preview is semantically side-effect-free.
- Commit reaches the domain's canonical authoritative path.
- A1 does not provide an execution engine and does not authorize writes.
- A2 must continue to fail closed when commit prerequisites such as replay durability or atomic runner are absent.

## 9. Atomicity

### `independent`

Each item may succeed/fail independently. Result ordering still follows input index.

### `atomic`

The declaration means all-or-nothing commit is required. It is **not evidence that the platform currently has a multi-document transaction boundary**.

A2 has already audited that current single-document MutationStore semantics do not automatically prove a transaction spanning multiple document operations. Therefore an `atomic` commit must continue to fail closed unless A2/WS00 supplies a real authoritative atomic runner.

A1 does not fake atomicity with sequential writes plus optimistic wording.

## 10. Result envelope

Canonical result:

```text
contract_version
batch_id
mode
atomicity
trace_id
replayed
items[]
  index
  item_id
  operation_id
  status = success | error | rolled_back | skipped
  value | error
error? (batch-level)
```

`createBatchActionResultEnvelope()`:

- sorts by input index;
- rejects duplicate result indexes;
- verifies `operation_id == batch_id:item_id`;
- normalizes item/batch errors;
- maps an A2-compatible runtime trace without importing A2 into App Factory.

## 11. A2 adapter seam

A1 exposes `toBatchExecutorPlan(invocation, requestHash)`.

It structurally matches A2's runtime-only plan:

```text
batchId
requestHash
mode
atomicity
idempotencyKey?
items[] { id, value }
```

`value` is `{ shared_inputs, item }`.

A2 remains owner of:

- request hashing implementation;
- durable replay claim/store;
- in-flight conflict handling;
- execution loops;
- transaction runner integration;
- audit sink implementation.

No second executor is implemented in A1.

## 12. Permission and tenant boundary

The metadata contract does not accept trusted tenant/user/role values.

The existing AppAction `permission_doctype` remains the presentation/gating metadata, but actual authorization remains server-side. A2 and domain adapters receive authenticated context from the route/kernel and must not substitute request payload fields for that context.

## 13. Correction ownership

BatchAction defines execution correlation, not domain correction semantics.

Stock reversal/reconciliation correction belongs to Inventory authority. BOM amend/version correction belongs to Manufacturing authority. Future domains own their equivalent lifecycle.

Generic code must not invent a cross-domain reversal ledger.

## 14. Rolling compatibility

Current AppAction storage still uses the proven `BulkTransaction:<json>` bridge for first-class input tables.

A1 stores the optional canonical `batch` metadata as one extra property inside the **bound table's existing compatibility JSON**. Consequences:

- old clients continue reading `columns/minRows/maxRows/allowPaste` and ignore `batch`;
- new server/tooling decorates the installed action back to first-class `input_tables + batch`;
- no new fake UI field is added;
- source package is cloned and not mutated;
- native manifest storage can later replace the bridge mechanically.

No migration is required for this A1 slice.

## 15. Public implementation surface

`server/packages/app-registry/src/batch-action.ts`

- `BatchAction` / `AppActionBatchContract`;
- `BatchTransaction` / normalized invocation;
- `BatchTransactionResult` / canonical result;
- `parseAppActionBatchContract()`;
- `normalizeBatchActionInvocation()`;
- `canonicalBatchRequestMaterial()`;
- `toBatchExecutorPlan()`;
- `createBatchActionResultEnvelope()`;
- fixed `BATCH_ACTION_SEMANTICS`.

Other changed seams:

- `action-input-table-compat.ts` — install/list round-trip bridge;
- `batch-action-brief.mjs` — authoring validation/normalization;
- `compile-brief-app-factory.mjs` — emission;
- `validate-brief-schema.mjs` — legacy schema compatibility;
- package barrel export;
- focused manifest/request/result/brief tests.

## 16. A1 completion boundary

A1 mission is complete when this exact branch is accepted by convergence evidence.

A1 does **not** claim:

- A2 durable replay store is complete;
- multi-document atomic commit exists;
- Stock Reconciliation is wired;
- BOM is wired;
- client PR #542 is green;
- WS09 overall is RC/Hardened.

Those are downstream gates owned by A2/A3/A4/A5 and the external client dependency.
