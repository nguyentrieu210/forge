# A3 Handoff — Inventory / Stock Reconciliation Consumer

Branch: `agent/ws09-batch-03-inventory`
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
Main at bootstrap: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Risk: **CRITICAL**
Owner: WS04 Inventory/WMS consumer

## Mission

Adopt the shared BatchAction/BatchTransaction primitive in the Stock Reconciliation path without changing stock authority, valuation semantics or correction/reversal rules.

## Required reading

1. `skills/forge-enterprise-completion/SKILL.md`
2. `CURRENT_STATUS.md`
3. `NEXT_TASKS.md`
4. program `PROGRAM_SPEC.md`, `AGENT_BOARD.md`, `NO_STOP_RULE.md`
5. `docs/agents/workstreams/WS04-inventory-wms.md`
6. `docs/agents/transaction-closure/03-INVENTORY-WMS.md`
7. current Stock Reconciliation, stock integrity/valuation, permission/warehouse and related tests
8. A1/A2 contract/executor candidate once available.

## Own

- Stock Reconciliation-specific batch declaration/adapter;
- domain mapping between generic rows and canonical stock reconciliation operation;
- preview response using domain calculations without side effects;
- commit through existing authoritative inventory/document path;
- inventory-specific permission/tenant/warehouse/reconciliation tests.

## Forbidden

- editing shared App Factory contract/executor semantics except through Dependency Request;
- direct stock ledger writes that bypass canonical authority;
- client native input-table implementation from #542;
- changing valuation/correction rules merely to fit the batch primitive;
- claiming RC/Hardened without stock reconciliation evidence.

## Work before A1/A2 lands

Audit the exact Stock Reconciliation authority path, locate existing bulk/compatibility consumer seams, define fixtures and acceptance cases. Use an internal test seam only if it does not create a competing shared primitive.

## Critical invariants

- preview writes nothing;
- commit preserves existing stock/valuation invariants;
- warehouse/company/tenant scope is enforced server-side;
- invalid row causes behavior consistent with declared batch atomicity;
- duplicate/retried request cannot duplicate stock effect;
- correction/reversal path remains explicit;
- stock reconciliation evidence can reconcile before/after quantities/value where applicable.

## Acceptance

- happy + failure + permission + tenant + idempotency tests;
- preview side-effect test;
- stock authority/reconciliation regression;
- migration replay if any schema changes;
- exact candidate head evidence;
- no production deploy.

## A3 audit — exact authority and reusable legacy delta

### Canonical authority

The registered Stock Reconciliation authority remains `StockReconciliationIntegrityController -> StockReconciliationController -> DocumentKernel/MutationStore`.

A3 does **not** introduce another controller, stock ledger, mutation store or stock posting route.

Current authority already provides the invariants A3 must preserve:

- active leaf/company warehouse validation before mutation planning;
- frozen reconciliation envelope after snapshot capture;
- physical row identity by `(item_code,batch_no)` rather than child-row index;
- no deletion of frozen snapshot rows and no duplicate/ambiguous aggregate+batch identities;
- extra physical rows are validated against the frozen reconciliation scope;
- fixed-point count/weight/valuation calculations in the canonical controller;
- save/draft planning creates no stock ledger side effect;
- submit remains the authoritative stock-posting path;
- cancellation reverses the exact submitted stock revision, releases bundle usage and enforces separation-of-duties/open-period rules.

### Historical PR #267

Disposition: **SELECTIVE DOMAIN REUSE — DO NOT CHERRY-PICK WHOLE PR**.

Useful consumer semantics retained:

- update one existing snapshotted Stock Reconciliation draft rather than create another document;
- pasted/batch data must cover every frozen snapshot row;
- physical extras may be appended but remain subject to canonical scope/master validation;
- duplicate `(item_code,batch_no)` and aggregate+batch ambiguity fail closed;
- maximum 500 rows;
- existing snapshot row order/`row_id` stays stable;
- bulk edit does not submit and does not directly write Stock Ledger;
- replay comparison is domain evidence only; shared executor owns authoritative idempotency.

Not reused from #267:

- Alumdoor-worker-specific handler/routing;
- its shared `DocumentKernel.preview()` change;
- client/input-table implementation;
- any generic execution/idempotency primitive.

## A3 implementation before shared contract convergence

Added `server/packages/clouderp-erpnext/src/stock-reconciliation-batch.ts` as a **domain-only mapper**.

It:

- accepts only editable physical-count inputs;
- normalizes item/batch identity and fixed-point non-negative count/weight/rate inputs;
- caps one batch at 500 rows;
- requires complete frozen snapshot coverage;
- preserves frozen row order and original `row_id`;
- appends newly discovered physical rows deterministically as `BATCH-EXTRA-*`;
- refuses duplicate or aggregate+batch ambiguous rows;
- does not copy caller-supplied book quantity/value or computed variance authority;
- deliberately delegates scope/master/warehouse/company/valuation checks to the canonical Stock Reconciliation controller;
- exposes only a domain replay-value comparison; it explicitly does not claim shared idempotency.

The package barrel exports the mapper. No production route consumes it yet.

Added `server/tests/stock-reconciliation-batch-consumer.test.mjs` with source regressions for:

1. frozen identity/order and caller book-state rejection;
2. missing/duplicate/ambiguous/oversized batches;
3. controller-backed save preview with zero GL/Stock/Payment/Fulfillment/Bundle side effects;
4. extra-row scope rejection by the canonical controller;
5. deterministic domain replay-value comparison across equivalent decimal representations.

These tests are **SOURCE ADDED, NOT EXECUTED** in this worker environment. No executable PASS is claimed.

## Dependency state

### A1 — canonical contract

Audited exact A1 head `e1dd7b4b69296d4916c0a5172ece92aac3cf23d7`: it is still bootstrap/handoff only.

Dependency Request posted on PR #548. A3 needs A1's accepted vertical-neutral declaration for input table -> domain operation binding, preview/commit, row/batch identity, idempotency, atomicity/result semantics and trusted-context boundary. A3 will not freeze a competing public contract.

### A2 — generic executor

Latest audited A2 head: `2b739f43a9171322bf196414e10b6596f04da63b`.

A2 now has a runtime-only executor seam with separate preview/commit callbacks, trusted server context, stable operation correlation, replay-store requirements and fail-closed atomic runner requirements. A2 explicitly states this is not the A1 public contract, so A3 does not import/freeze that runtime seam before A1 convergence.

Dependency Request posted on PR #549. Final A3 wiring needs A2 to invoke the domain mapper + ordinary Stock Reconciliation controller/document path without client-trusted tenant/roles and with canonical commit idempotency/retry behavior.

A2's multi-document atomic-runner dependency does not need to be duplicated in A3. Stock Reconciliation A3 remains one canonical reconciliation-document consumer; generic atomicity semantics remain owned by A1/A2/WS00.

## Completion Record

Baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
A1/A2 heads consumed: **NONE YET** — A1 public contract not implemented; A2 runtime head `2b739f43a9171322bf196414e10b6596f04da63b` audited but intentionally not imported before A1 convergence.
Implementation head before this evidence-doc commit: `d36981ed3bd53f16552dfff96783fc6bf520fa80`
PR: #550 draft against `program/ws09-batch-productization-20260804`
Changed authority: **NO** — domain mapper + barrel export + regression source only; no controller/registry/ledger/kernel/schema/migration/production route change.
Tests executed: **NONE executable in this environment**. GitHub workflow query for implementation head returned no runs; no PASS inferred.
Tests not executed: new `stock-reconciliation-batch-consumer.test.mjs`; existing `stock-reconciliation-integrity.test.mjs`; server strict TypeScript/typecheck; package/full server tests; full build/integration/E2E. All remain **UNPROVEN**.
Migrations: **NONE**.
Permission/tenant evidence: canonical controller uses command/server context and tenant-scoped readers; source regression asserts controller reads remain on the trusted tenant. Final shared-executor tenant/permission test is blocked on A1/A2 convergence.
Stock reconciliation/correction evidence: existing canonical source covers frozen snapshot, positive/negative/zero ledger deltas, exact submitted-revision reversal, bundle usage release, separation of duties and locked-period rejection. New source regression covers zero-side-effect save planning through that same controller. No new stock authority is created.
Dependencies remaining: A1 accepted public BatchAction/BatchTransaction contract; A2 accepted adapter/executor integration after A1; executable CRITICAL validation on the converged exact head.
Recommended maturity: Batch Stock Reconciliation consumer remains **Foundation candidate** until shared primitive wiring + executable CRITICAL evidence land. Existing `W01-011 Stock Reconciliation` maturity is unchanged; do not promote from this worker.
Merge/deploy performed: **NO**.

## Startup prompt

You are **Agent A3 — WS09 Inventory Batch Consumer** in `nguyentrieu210/forge`.

Work only on `agent/ws09-batch-03-inventory`, baseline `8259d9bac1d2098d9e66195cb22e14072cd75139`. Audit WS04 and exact Stock Reconciliation authority first. Your job is to consume A1/A2's shared batch primitive; never create another one. Preview must be side-effect free. Commit must use the existing authoritative inventory/document path and preserve stock/valuation/correction invariants, warehouse/company/tenant permissions and idempotency. Add CRITICAL evidence. Open a draft PR against the program control branch and stop before merge/deploy. If shared primitive changes are needed, send a Dependency Request to A1/A2 and continue independent fixtures/tests/audit.