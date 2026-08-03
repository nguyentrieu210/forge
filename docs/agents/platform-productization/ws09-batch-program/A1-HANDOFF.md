# A1 Handoff — Batch Contract

Branch: `agent/ws09-batch-01-contract`
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
Main at bootstrap: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Risk: **STANDARD**
Owner: WS09 shared App Factory contract
Status: **MISSION COMPLETE — READY FOR CONVERGENCE; EXECUTABLE CI UNPROVEN**

## Mission

Define one canonical, vertical-neutral `BatchAction / BatchTransaction` metadata and result contract that can be consumed by Inventory, Manufacturing and future apps.

## Required reading

1. `skills/forge-enterprise-completion/SKILL.md`
2. `CURRENT_STATUS.md`
3. `NEXT_TASKS.md`
4. `docs/agents/AUTO_AGENT_ORCHESTRATION.md`
5. `docs/agents/platform-productization/ws09-batch-program/PROGRAM_SPEC.md`
6. `docs/agents/platform-productization/ws09-batch-program/AGENT_BOARD.md`
7. `docs/agents/platform-productization/ws09-batch-program/NO_STOP_RULE.md`
8. `docs/agents/workstreams/WS09-bpm-app-factory.md`
9. current `server/packages/app-registry/**`, compiler/brief tooling, AppAction input-table compatibility code and tests
10. PR #542 only as an external client dependency; do not copy its implementation into this branch.

## Own

- shared batch metadata types/schema/parser/compiler seams;
- preview/commit contract;
- result envelope;
- atomicity declaration semantics;
- batch/item identity and idempotency contract;
- validation/bounds/compatibility tests;
- contract documentation.

## Forbidden

- Stock Reconciliation business fields/rules;
- BOM business fields/rules;
- stock ledger/valuation code;
- manufacturing costing code;
- client native input-table implementation from #542;
- generic executor implementation beyond the minimum seam needed to compile/test the contract.

## Contract decisions — CLOSED

Canonical detail: `A1-BATCH-CONTRACT.md`.

Locked decisions:

- public `BatchAction` metadata is versioned at `contract_version: 1`;
- one batch contract binds to one declared AppAction `input_table`;
- `item_id_field` is a declared column and provides stable per-row identity;
- `operation_id = batch_id:item_id`;
- commit requires an idempotency key scoped by A2 with trusted tenant context;
- same key + changed canonical request must conflict;
- canonical replay material includes **shared scalar inputs** plus ordered row values and excludes only the idempotency key;
- preview is mandatory for a batch action and semantically side-effect-free;
- `atomic` means a real authoritative all-or-nothing runner is required; it must fail closed if A2/WS00 cannot provide one;
- `independent` permits per-item outcomes but ordering/correlation remains deterministic;
- public result envelope has success/error/rolled_back/skipped item states;
- tenant/user/role remain server-trusted context and are not accepted as batch authority from payload;
- correction/reversal stays domain-owned;
- item count <= 500 and payload <= 2,000,000 UTF-8 bytes;
- no migration: rolling compatibility persists `batch` inside the bound existing `BulkTransaction` JSON and decorates it back to first-class metadata.

## Implemented

### Shared app-registry contract

- `server/packages/app-registry/src/batch-action.ts`
  - `BatchAction` / `AppActionBatchContract`;
  - `BatchTransaction` normalized invocation;
  - `BatchTransactionResult` envelope;
  - fail-closed parser;
  - request normalization and payload/item bounds;
  - canonical replay material;
  - A2 structural adapter via `toBatchExecutorPlan()`;
  - deterministic result mapping;
  - fixed cross-layer semantics.
- `server/packages/app-registry/src/index.ts`
  - exports the canonical contract.

### Compatibility/storage

- `server/packages/app-registry/src/action-input-table-compat.ts`
  - first-class `batch` is validated against `input_tables`;
  - package source is cloned, not mutated;
  - metadata is stored inside the already-proven bound `BulkTransaction` compatibility JSON;
  - installed actions decorate back to `input_tables + batch`;
  - legacy decode enforces the same preview invariant.

### App Factory authoring/compiler

- `server/scripts/lib/batch-action-brief.mjs`
  - validates author-facing `batch` camelCase extension;
  - verifies table/identity binding, preview, atomicity and bounds;
  - strips only the owned extension before legacy AJV.
- `server/scripts/lib/compile-brief-app-factory.mjs`
  - emits canonical snake_case `batch` metadata.
- `server/scripts/lib/validate-brief-schema.mjs`
  - combines batch/input-table/UI extension validation without weakening unknown-key rejection.

### Regression authored

- `server/tests/app-batch-action-contract.test.mjs`
  - no source mutation;
  - lower/decorate round trip;
  - first-class and compatibility preview fail-closed;
  - table/id/bounds failures;
  - commit idempotency requirement;
  - duplicate item rejection;
  - stable operation correlation;
  - shared scalar inputs participate in replay identity;
  - A1 -> A2 plan mapping;
  - deterministic public result envelope.
- `server/tests/app-batch-action-brief.test.mjs`
  - owned batch brief extension accepted;
  - unknown keys remain fail-closed;
  - compiler emits canonical metadata;
  - canonical parser round-trips it;
  - invalid identity/preview declarations fail.

## Dependency resolution for downstream agents

### A2

Consume:

- `normalizeBatchActionInvocation()`;
- hash `canonicalBatchRequestMaterial()` using A2-owned hashing policy;
- `toBatchExecutorPlan()` to feed the existing runtime-only executor;
- `createBatchActionResultEnvelope()` to return canonical public result.

A2 remains owner of durable replay store, execution loop, audit sink and real atomic runner.

### A3 / A4

Consumer adapters receive each A2 item value as:

```text
{
  shared_inputs: <all scalar AppAction inputs>,
  item: <one row>
}
```

They must call their existing canonical domain authority and must not introduce a second batch primitive.

### A5

A1 closes the earlier missing-contract and ambiguous-retry dependency at source level. A5 still must prove executable integrated gates on the exact convergence candidate.

## Acceptance review

- no vertical names in generic contract: **YES — static diff audit**;
- parser fails closed on malformed semantics: **IMPLEMENTED + regression authored**;
- no mutation of source manifest/package: **IMPLEMENTED + regression authored**;
- deterministic normalization: **IMPLEMENTED + regression authored**;
- compiler/manifest round-trip: **IMPLEMENTED + regression authored**;
- old input-table packages remain supported: **compatibility bridge preserved**;
- migration: **NONE**;
- production mutation/deploy: **NONE**.

## Completion Record

Baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
Implementation/evidence head before this completion-record commit: `39f2a39d29ee2991949711c650e8e7ad4f85647d`
PR: `#548`
Changed authority: shared App Factory/AppAction metadata contract and compatibility/compiler seams only; no domain write authority
Tests authored: `app-batch-action-contract.test.mjs`, `app-batch-action-brief.test.mjs`
Tests executed: **NONE on exact head — GitHub Actions returned no workflow run**
Tests not executed: server TypeScript build, targeted Node regressions, full app-registry/package gate, integrated A1+A2+A3+A4 candidate
Static diff/ownership audit: no Stock/BOM/ledger/client implementation path added by A1
Migrations: **NONE**
Dependencies remaining: A2 durable replay/atomic execution; A3/A4 adapters; A5 integrated validation/convergence; external client #542 green gate
Recommended maturity: **A1 contract mission complete / ready for convergence; WS09 program maturity not promoted**
Merge/deploy performed: **NO**

## Startup prompt

A1 implementation is complete. Do not reopen implementation unless A2/A3/A4/A5 produces a concrete contract defect. For convergence, consume the canonical symbols documented in `A1-BATCH-CONTRACT.md`, preserve domain authority boundaries and do not merge/deploy this non-UI shared contract without the project approval gate.
