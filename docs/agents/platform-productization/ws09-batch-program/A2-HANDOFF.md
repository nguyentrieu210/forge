# A2 Handoff — Generic Batch Executor

Branch: `agent/ws09-batch-02-executor`
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
Main at bootstrap: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Risk: **CRITICAL once commit-capable**
Owner: shared server orchestration

## Mission

Implement one generic server-side batch executor that consumes the canonical A1 contract, provides deterministic preview/commit behavior, idempotency/replay protection and audit correlation, while delegating all domain validation and side effects to domain-owned operations.

## Required reading

1. `skills/forge-enterprise-completion/SKILL.md`
2. `CURRENT_STATUS.md`
3. `NEXT_TASKS.md`
4. program `PROGRAM_SPEC.md`, `AGENT_BOARD.md`, `NO_STOP_RULE.md`
5. `docs/agents/workstreams/WS09-bpm-app-factory.md`
6. current document kernel, app-registry installer/action infrastructure, idempotency/OCC/audit/outbox primitives
7. A1 handoff and A1 candidate contract once available.

## Own

- generic execution/orchestration runtime;
- trusted context propagation;
- batch idempotency/replay guard;
- atomicity implementation matching A1 declaration;
- deterministic ordered result envelope;
- audit/correlation metadata;
- generic failure/retry tests.

## Forbidden

- inventing a competing contract while A1 owns it;
- Stock Reconciliation rules, warehouses, valuation or stock ledger logic;
- BOM versioning/costing rules;
- direct client/UI implementation;
- bypassing document kernel/domain authority.

## Work before A1 lands

You may audit current primitives, write interface fixtures, identify transaction boundaries and prepare tests. Do not freeze a second public contract. If A1 is incomplete, create a Dependency Request and continue infrastructure work that does not constrain semantics.

## Critical invariants

- trusted tenant/user/role comes from server context, never client payload;
- repeated idempotency key cannot duplicate committed side effects;
- preview cannot mutate authoritative data;
- all-or-nothing mode must actually roll back/avoid partial commit;
- independent-item mode must expose each item outcome deterministically;
- domain validator is invoked for each operation;
- retry after ambiguous transport failure is deterministic;
- ordering and result correlation are stable;
- audit trail links batch -> item -> domain operation.

## Acceptance

- targeted success/failure/idempotency/retry tests;
- tenant/permission boundary tests;
- atomicity tests appropriate to actual persistence layer;
- no domain-specific names in generic package;
- migration replay if schema is introduced;
- exact execution evidence recorded;
- no merge/deploy without approval.

## Completion Record

Baseline:
A1 contract head consumed:
Head:
PR:
Changed authority:
Tests executed:
Tests not executed:
Migrations:
Permission/tenant evidence:
Idempotency/retry evidence:
Dependencies remaining:
Recommended maturity:
Merge/deploy performed: NO

## Startup prompt

You are **Agent A2 — WS09 Generic Batch Executor** in `nguyentrieu210/forge`.

Work only on `agent/ws09-batch-02-executor`, baseline `8259d9bac1d2098d9e66195cb22e14072cd75139`. Audit exact current state and required sources. Consume A1's canonical contract; do not invent another. Build a vertical-neutral executor with server-trusted context, deterministic preview/commit, declared atomicity, idempotency/replay protection, audit correlation and deterministic item results. Domain operations remain authoritative. Treat commit-capable changes as CRITICAL. Add failure/retry/tenant/permission evidence. Open a draft PR against `program/ws09-batch-productization-20260804`; do not merge or deploy. If A1 is not ready, document the dependency and continue safe audit/fixtures/tests rather than stopping.
