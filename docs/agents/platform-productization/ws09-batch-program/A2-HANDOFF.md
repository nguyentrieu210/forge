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
- deterministic ordered execution trace for A1 result mapping;
- audit/correlation metadata;
- generic failure/retry tests.

## Forbidden

- inventing a competing contract while A1 owns it;
- Stock Reconciliation rules, warehouses, valuation or stock ledger logic;
- BOM versioning/costing rules;
- direct client/UI implementation;
- bypassing document kernel/domain authority.

## Work before A1 lands

A1 PR #548 is still bootstrap-only at `e1dd7b4b69296d4916c0a5172ece92aac3cf23d7`; no canonical contract implementation is available to consume. Per NO-STOP, A2 continued only infrastructure work that does not freeze the public manifest/result contract.

Implemented pre-contract infrastructure:

- new vertical-neutral `@cloudforge/batch-executor` package;
- runtime-only `BatchExecutionPlan` / `BatchExecutionTrace` adapter seam explicitly documented as non-public and replaceable by A1 mapping;
- trusted server context (`tenantId`, actor, trace) is supplied separately from item payload;
- stable `operationId = batchId:itemId` propagated to each domain callback for canonical command idempotency/correlation;
- preview and commit use separate domain callbacks so preview never invokes the commit callback;
- commit requires an idempotency key and an atomic replay-store claim before side effects;
- same key + different request hash fails closed;
- same completed key + same hash returns stored trace without re-executing side effects;
- in-flight duplicate commit fails closed for retry rather than double execution;
- independent-item mode preserves deterministic input ordering and records per-item failure without silently dropping later rows;
- atomic commit refuses to execute without an authoritative transaction runner;
- audit events correlate batch -> item -> stable domain operation.

## Kernel audit / atomicity truth

Current `MutationStore` exposes one-plan `execute(plan)` as the authoritative document mutation boundary. `D1MutationStore.execute()` builds one D1 `batch()` containing document/version/ledger/outbox/mutation-receipt work, and recovers ambiguous completion through the persisted receipt.

That is strong single-document atomic/idempotent authority, but it is **not** an exposed multi-document transaction scope. A2 therefore does not call several document mutations and claim they are all-or-nothing. Production atomic BatchAction wiring is blocked on an authoritative transaction runner or an explicit contract decision that multi-document atomic mode is unsupported.

See `A2-DEPENDENCY-REQUESTS.md`.

## Critical invariants status

- trusted tenant/user/role comes from server context, never client payload: **FOUNDATION PROVEN in executor seam/test; route/domain permission wiring pending**;
- repeated idempotency key cannot duplicate committed side effects: **FOUNDATION PROVEN with atomic claim interface/in-memory replay test; durable D1 adapter pending**;
- preview cannot mutate authoritative data: **executor calls preview callback only; domain preview purity still consumer-owned and pending A3/A4 evidence**;
- all-or-nothing mode must actually roll back/avoid partial commit: **fail-closed unless `AtomicBatchRunner` exists; production runner unavailable**;
- independent-item mode exposes outcomes deterministically: **targeted test PASS**;
- domain validator is invoked for each operation: **domain callback is mandatory, concrete controller/permission path pending consumers**;
- retry after ambiguous transport failure is deterministic: **stable operation correlation + replay interface present; durable replay/domain wiring UNPROVEN**;
- ordering and result correlation are stable: **targeted test PASS**;
- audit trail links batch -> item -> domain operation: **event contract + rollback/replay correlation tested; durable audit sink pending**.

## Targeted execution evidence

Because the GitHub connector session has no repository checkout and GitHub Actions returned no workflow run for the new head, full-repo CI remains **UNPROVEN**.

A local isolated reconstruction of the exact A2 implementation source was executed with the repository TypeScript version available in the environment:

- TypeScript 5.8.3 strict compile (`ES2022`, `NodeNext`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`): **PASS**.
- A2 targeted runtime harness: **7/7 PASS** covering preview/commit separation, trusted tenant context, deterministic order/operation IDs, independent failure continuation, exact replay/no duplicate callback, idempotency conflict, missing replay guard, missing atomic runner, atomic rollback correlation/replay release and duplicate item IDs.
- GitHub Actions for branch head: **NO RUN OBSERVED — UNPROVEN**.

The isolated harness is targeted implementation evidence, not a substitute for repository build/test/typecheck or Cloudflare/D1 integration evidence.

## Acceptance remaining

- A1 canonical contract import/adapter and public result envelope;
- durable D1 replay claim/completion implementation after A1 key/version semantics freeze;
- authoritative multi-document atomic transaction primitive, or explicit removal/restriction of atomic mode;
- concrete route + MetadataPermissionService/domain-controller tenant/permission evidence;
- durable audit sink correlation with document-kernel audit/outbox;
- repository package build/typecheck/test and worker integration tests;
- A3/A4 consumer evidence for preview purity and domain idempotency;
- no migration replay currently required because A2 introduced no schema.

## Completion Record

Baseline: `program/ws09-batch-productization-20260804@8259d9bac1d2098d9e66195cb22e14072cd75139`
A1 contract head consumed: **NONE — #548 is bootstrap-only at `e1dd7b4b69296d4916c0a5172ece92aac3cf23d7`**
Implementation evidence head before this handoff update: `2b739f43a9171322bf196414e10b6596f04da63b`
PR: #549
Changed authority: new generic server execution mechanics only; **not wired to production routes/domain authority**
Tests executed: isolated strict TypeScript compile PASS; targeted A2 harness 7/7 PASS
Tests not executed: full `server` build/unit suite, worker tests, D1 integration, consumer permission tests, GitHub CI (**no run observed**)
Migrations: NONE
Permission/tenant evidence: trusted context is separate from item payload and propagated unchanged; concrete permission service integration pending
Idempotency/retry evidence: atomic replay claim contract + conflict/in-flight/replay behavior; stable per-item operationId; durable D1 replay adapter pending
Dependencies remaining: DR-A2-01 A1 canonical contract; DR-A2-02 authoritative multi-document atomic transaction scope; downstream A3/A4 integration
Recommended maturity: **Foundation** only; not Wired/RC/Hardened
Merge/deploy performed: NO

## Startup prompt

You are **Agent A2 — WS09 Generic Batch Executor** in `nguyentrieu210/forge`.

Work only on `agent/ws09-batch-02-executor`, baseline `8259d9bac1d2098d9e66195cb22e14072cd75139`. Audit exact current state and required sources. Consume A1's canonical contract; do not invent another. Build a vertical-neutral executor with server-trusted context, deterministic preview/commit, declared atomicity, idempotency/replay protection, audit correlation and deterministic item results. Domain operations remain authoritative. Treat commit-capable changes as CRITICAL. Add failure/retry/tenant/permission evidence. Open a draft PR against `program/ws09-batch-productization-20260804`; do not merge or deploy. If A1 is not ready, document the dependency and continue safe audit/fixtures/tests rather than stopping.
