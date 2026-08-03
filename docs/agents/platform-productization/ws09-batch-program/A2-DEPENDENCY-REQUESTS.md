# A2 Dependency Requests — Generic Batch Executor

Branch: `agent/ws09-batch-02-executor`
PR: #549
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`

## DR-A2-01 — Canonical BatchAction contract

Dependency Request
From: A2
To: A1 / `agent/ws09-batch-01-contract`
Need: canonical BatchAction/BatchTransaction mapping for batch identity, request fingerprint/idempotency key, item identity/order, preview/commit, atomicity, bounded item count and public result/error envelope.
Why owner belongs there: A1 owns the public App Factory/app-registry contract and result semantics. A2 must not invent a competing manifest/API contract.
Blocked scope: direct import/wiring from canonical A1 contract into the executor; final public result adapter; concrete replay key persistence schema whose key/version semantics depend on A1.
Independent work remaining: yes — generic runtime execution mechanics, fail-closed replay guard interface, trusted-context propagation, stable per-item operation correlation, atomic-runner boundary, audit event correlation and targeted tests.
Evidence: `server/packages/batch-executor/src/index.ts`, `server/tests/batch-executor.test.mjs`, PR #548 currently contains bootstrap handoff only.

A2 intentionally exposes `BatchExecutionPlan` and `BatchExecutionTrace` as **runtime-only** seams. They are not an AppAction manifest contract and must be adapted/replaced as needed when A1 lands.

## DR-A2-02 — Multi-document authoritative atomic transaction scope

Dependency Request
From: A2
To: WS00 / document-kernel authority
Need: an authoritative transaction runner capable of committing multiple domain/document operations all-or-nothing without bypassing `MutationStore`/document-kernel invariants, or an explicit architectural declaration that BatchAction atomic mode is unsupported for multi-document commits.
Why owner belongs there: current `MutationStore.execute(plan)` is the canonical document write boundary. `D1MutationStore.execute()` assembles one document mutation, ledgers, outbox, version/audit and mutation receipt into one D1 `batch()` call. A2 must not duplicate this SQL or bypass the kernel to fake multi-document atomicity.
Blocked scope: production wiring of A1 `atomic` commit semantics when a batch spans more than one authoritative document/domain operation.
Independent work remaining: yes — executor fails closed with `BATCH_ATOMIC_RUNNER_REQUIRED`; independent-item execution and preview mechanics remain testable; stable `operationId = batchId:itemId` is propagated so each domain operation can reuse canonical command idempotency.
Evidence: `server/packages/document-kernel/src/store.ts` exposes one-plan `execute`; `server/packages/document-kernel/src/d1-store.ts` persists `mutation_guard`, document/ledger/outbox/version data and `mutation_receipts` in the same D1 batch and recovers ambiguous completion via the receipt.

## Production evidence boundary

No D1 replay table/migration is introduced on A2 before A1 freezes key/version semantics. No production route calls the new package yet. No merge/deploy is authorized or performed.
