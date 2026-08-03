# A1 Handoff — Batch Contract

Branch: `agent/ws09-batch-01-contract`
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
Main at bootstrap: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Risk: **STANDARD**
Owner: WS09 shared App Factory contract

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

## Required contract decisions

Lock these semantically before implementation:

- batch ID / idempotency key ownership;
- row/item identity;
- deterministic ordering;
- preview vs commit;
- `atomic` vs explicitly independent-item mode;
- error/result envelope;
- retry/replay behavior expected from A2;
- trusted permission/tenant context boundary;
- audit correlation;
- max rows/items and payload bounds;
- versioning/backward compatibility.

## Acceptance

- no vertical names in generic contract;
- parser fails closed on malformed semantics;
- no mutation of source manifest/package;
- deterministic normalization;
- compiler/manifest round-trip tests;
- old AppAction/input-table packages remain valid;
- no migration unless strictly necessary and justified;
- exact tests executed recorded; unexecuted gates marked UNPROVEN.

## Dependency Request

If execution semantics require a runtime primitive not owned here, define the interface and send a Dependency Request to A2. Do not implement a second execution engine.

## Completion Record

Baseline:
Head:
PR:
Changed authority:
Tests executed:
Tests not executed:
Migrations:
Dependencies remaining:
Recommended maturity:
Merge/deploy performed: NO

## Startup prompt

You are **Agent A1 — WS09 Batch Contract** in `nguyentrieu210/forge`.

Work only on branch `agent/ws09-batch-01-contract`, bootstrapped from program baseline `8259d9bac1d2098d9e66195cb22e14072cd75139`. Read the required sources above, then audit exact current branch/main before modifying code.

Your job is to design and implement the smallest canonical vertical-neutral BatchAction/BatchTransaction contract that Stock Reconciliation and BOM can both consume. Do not encode Stock/BOM rules. Contract-first: identity, preview/commit, atomicity, idempotency, deterministic result/error envelope, permission/tenant boundary, audit correlation and compatibility. Add focused tests and evidence. Open a draft PR against `program/ws09-batch-productization-20260804`. Do not merge or deploy. Follow NO-STOP: route shared executor needs to A2 through a Dependency Request and continue independent work.
