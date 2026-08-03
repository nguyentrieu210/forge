# A5 Convergence Checkpoint 01 — live A2/A3/A4 audit

Date: **2026-08-04**  
A5 branch: `agent/ws09-batch-05-convergence`  
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`  
Main audited: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`  
Risk: **CRITICAL inherited**  
Merge/deploy: **NOT PERFORMED**

## 1. Exact live worker state

A5 re-fetched the worker PRs after the initial baseline artifact because parallel workers were active.

| Lane | PR | Exact head at checkpoint | Commits / files | State |
|---|---:|---|---|---|
| A1 contract | #548 | `e1dd7b4b69296d4916c0a5172ece92aac3cf23d7` | 1 / 1 | **bootstrap only** |
| A2 executor | #549 | `d564569a5350eab411e46d5a61167e352eb30151` | 5 / 4 | implementation present |
| A3 inventory | #550 | `d36981ed3bd53f16552dfff96783fc6bf520fa80` | 5 / 4 | implementation present |
| A4 BOM | #551 | `25af161e3b22258ab8061b7ef97988a6ac5ce5c9` | 6 / 3 | audit + regression present; shared adapter intentionally not wired |

No pull-request workflow run is observable for the exact A2, A3 or A4 heads above. Their tests are therefore **source evidence only** at this checkpoint.

## 2. A2 exact-diff audit

Changed ownership surface:

- `server/packages/batch-executor/package.json`
- `server/packages/batch-executor/src/index.ts`
- `server/tests/batch-executor.test.mjs`
- A2 handoff

### 2.1 Ownership result

**STATIC PASS — no vertical leakage found.**

The new executor package contains no Stock Reconciliation, warehouse, valuation, BOM, manufacturing, GL or client UI rule. It explicitly labels `BatchExecutionPlan` and `BatchExecutionTrace` as runtime/internal seams rather than the A1-owned public AppAction/BatchAction contract.

Trusted tenant/actor/trace context is a separate server-supplied object. Preview and commit callbacks are separated. Atomic commit refuses to run without an injected authoritative transaction runner. Commit refuses to run without an idempotency key and replay store.

These are the correct ownership boundaries for A2.

### 2.2 Existing source evidence

The authored tests cover:

- preview never invokes commit and carries trusted context;
- deterministic item order / stable `operationId`;
- independent-mode per-item error continuation;
- exact successful replay without repeating domain callbacks;
- same idempotency key + different request hash conflict;
- commit refusal without replay protection;
- atomic commit refusal without transaction runner;
- rollback correlation on atomic failure;
- duplicate item ID rejection before domain callback.

No executable PASS is claimed because the exact head has no observable workflow run.

### 2.3 CRITICAL convergence defect — ambiguous success window

A5 found a retry/durability gap that prevents acceptance of A2 as a production commit primitive yet.

Current flow is structurally:

```text
replayStore.claim()
  -> domain commit / atomicRunner.run()
  -> replayStore.complete()
```

`replayStore.complete()` happens after authoritative domain work returns. If domain work has committed successfully but replay completion fails, or the process dies in that interval, the batch claim/result is not durably finalized with the authoritative side effect. In the ordinary error path the executor may release the claim. A retry can therefore re-enter domain commit.

A2 generates stable per-item `operationId = batchId:itemId`, which is the correct correlation seam, but the executor does not currently enforce that every commit-capable domain adapter binds that operation ID to canonical document/domain idempotency. Existing source tests prove replay only **after successful replay-store completion**; they do not simulate the ambiguous success window.

This matters for both:

- `atomic`: transaction commit can succeed before replay finalization;
- `independent`: one or more item commits can succeed before final batch replay completion.

A5 routed **Dependency Request / convergence blocker** to A2 PR #549 and a matching contract requirement to A1 PR #548.

Acceptance options belong to A1/A2, not A5:

1. couple replay finalization to the authoritative commit transaction where architecture permits; or
2. make canonical per-item idempotency using the stable operation ID a mandatory executor/domain-adapter contract, then prove ambiguous retry cannot duplicate domain side effects.

Required regression before A5 acceptance:

```text
item/domain commit succeeds
-> replayStore.complete fails or response becomes ambiguous
-> retry exact same idempotency key/request
-> no duplicate authoritative side effect
-> deterministic final result/recovery semantics
```

Until this is resolved and executed, A5 classifies A2 as **implementation present, CRITICAL retry semantics UNPROVEN**.

## 3. A3 exact-diff audit

Changed ownership surface:

- `server/packages/clouderp-erpnext/src/stock-reconciliation-batch.ts`
- `server/packages/clouderp-erpnext/src/index.ts`
- `server/tests/stock-reconciliation-batch-consumer.test.mjs`
- A3 handoff

### 3.1 Ownership result

**STATIC PASS — no new stock authority found.**

A3 adds a domain mapper around an **existing snapshotted Stock Reconciliation draft**. It deliberately does not define generic batch identity, atomicity, trusted tenant context or persistence.

The mapper:

- caps batch rows at 500;
- preserves frozen snapshot row ordering and existing `row_id`;
- requires full coverage of frozen snapshot identities;
- rejects duplicate and aggregate-vs-batch ambiguous identities;
- only maps editable physical-count fields;
- appends newly discovered physical identities deterministically;
- leaves scope/master/warehouse/valuation validation to the canonical Stock Reconciliation controller.

No direct Stock Ledger write, valuation ledger or alternate reconciliation store is introduced.

### 3.2 Preview source evidence

The new regression constructs the mapped draft and invokes `StockReconciliationIntegrityController.buildPlan()` with a trusted tenant context. The assertions require:

- canonical controller calculations recompute variance from the frozen book state;
- Draft/save preview creates zero Stock Ledger entries;
- zero GL entries;
- zero payment/fulfillment/bundle-usage side effects;
- all underlying reads use the trusted tenant;
- an extra physical row outside the declared Item Group is rejected by canonical domain scope validation.

This is strong source evidence that the A3 mapper composes with canonical authority rather than reimplementing it.

### 3.3 Remaining A3 convergence gaps

A3 is **not yet a BatchAction consumer end-to-end** because A1 is absent and A2 is provisional.

Still required after shared convergence:

- map exact accepted A1 contract into A2 and this A3 domain mapper;
- prove commit goes through canonical DocumentKernel/Stock Reconciliation mutation path;
- bind shared operation/idempotency identity to canonical mutation receipt so ambiguous retry cannot duplicate stock effect;
- prove declared atomicity behavior with invalid rows;
- run positive/negative/zero variance commit evidence on the combined candidate;
- run cancel/exact reversal after a batch-originated commit;
- run warehouse/company/tenant/permission failures through the real server route;
- execute the tests on the exact integrated head.

A5 therefore accepts A3 only as **domain adapter + preview fixture candidate**, not as completed CRITICAL consumer.

## 4. A4 exact-diff audit

Changed ownership surface:

- `docs/agents/platform-productization/ws09-batch-program/A4-BOM-CONSUMER-AUDIT.md`
- A4 handoff
- two focused additions to `server/tests/manufacturing-bom-bulk-api.test.mjs`

### 4.1 Ownership result

**STATIC PASS — correct decision not to bind to provisional A2.**

A4 explicitly records that A1 is still absent and A2's plan is runtime-only. It therefore does not create or freeze a second public contract and does not duplicate the existing BOM bulk implementation.

The audit correctly retains domain authority in:

- `manufacturing-lifecycle.ts` for BOM lifecycle/version/effective/checksum rules;
- `manufacturing-bom-bulk.ts` for bounded domain mapping / pure preview / fingerprint;
- `manufacturing-bom-bulk-api.ts` for server permission, trusted tenant, Draft replay and canonical create delegation.

### 4.2 New source regression

A4 adds focused assertions that:

- multiple records for the same company/item/revision fail before any canonical write;
- an Active/submitted revision is never silently overwritten even if the business payload otherwise matches.

These are valid BOM correction/version invariants and stay within WS05 ownership.

### 4.3 Remaining A4 convergence gaps

- consume exact accepted A1 public contract;
- integrate through accepted A2 executor seam;
- prove shared idempotency + existing BOM business replay cannot duplicate Drafts after ambiguous retry;
- prove preview zero-write and trusted permission/tenant behavior on the combined route;
- execute BOM regression/package gates on exact integrated head.

A4 remains **consumer-ready domain evidence, shared integration blocked**.

## 5. Cross-worker duplicate primitive audit

At this checkpoint:

| Check | Result |
|---|---|
| A1 is sole public contract owner | **YES by ownership, but implementation absent** |
| A2 labels its plan runtime-only | **PASS** |
| A2 contains vertical business rules | **NONE FOUND** |
| A3 defines another shared primitive | **NO** |
| A3 writes Stock Ledger directly | **NO** |
| A4 defines another shared primitive | **NO** |
| A4 duplicates BOM bulk implementation | **NO** |
| A3/A4 can consume one accepted A1/A2 primitive today | **NO — dependency unresolved** |
| #542 native client validated | **NO — external run is red** |

No ownership overlap currently justifies rejecting A2/A3/A4 wholesale.

## 6. External #542 remains red

A5 baseline audit already recorded exact external run:

- run `30850149684`;
- job `91807894696`;
- locked dependency install PASS;
- core typecheck PASS;
- views gate FAIL during TypeScript build on unresolved `@metaforge/charts` / `@metaforge/visual` dependencies;
- targeted input-table Node test therefore not proven executed;
- runtime production build skipped.

No claim of native input-table validation or integration is allowed yet.

## 7. Current convergence decision

**DO NOT CONSTRUCT FINAL CONVERGENCE CANDIDATE YET.**

Blocking reasons:

1. A1 canonical public BatchAction/BatchTransaction contract is still absent.
2. A2 ambiguous-success retry durability is not closed/proven.
3. A3/A4 have not consumed one accepted A1/A2 revision.
4. exact A2/A3/A4 executable validation is absent.
5. #542 native client dependency remains red.

This is not an A5 stop condition. Independent exact-head audit, defect routing and evidence recording are complete for the currently available candidate heads.

## 8. Dependency routing performed

### A5-DR-02 -> A2 / A1

Topic: ambiguous commit success vs replay-store finalization.

Recorded directly on A2 PR #549 and A1 PR #548. Required contract + regression are described in section 2.3.

### Existing A5-DR-01 -> #542 / WS14 validation owner

Topic: build the required workspace dependency graph, then execute native input-table targeted regression and runtime build on exact delivery candidate.

## 9. Maturity recommendation at checkpoint

No capability promotion.

- `B02-016`: remains **Wired**; generic batch executor public contract/integration not yet closed.
- `W01-011`: remains **Wired** in canonical capability status; batch adapter preview evidence alone does not promote it.
- `W02-009`, `W02-014`: remain **Wired** and continue to reuse Stock Reconciliation.
- `M01-001..M01-005`: no promotion from A4 source-only tests; existing domain evidence remains separate from shared batch productization maturity.

No `RC` or `Hardened` claim is made by A5.

## 10. Checkpoint completion record

Baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`  
Main audited: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`  
A1: #548 `e1dd7b4b69296d4916c0a5172ece92aac3cf23d7` — bootstrap only  
A2: #549 `d564569a5350eab411e46d5a61167e352eb30151` — implementation present; ambiguous-retry blocker routed  
A3: #550 `d36981ed3bd53f16552dfff96783fc6bf520fa80` — domain mapper + preview/source regressions present  
A4: #551 `25af161e3b22258ab8061b7ef97988a6ac5ce5c9` — audit + version/collision source regressions present  
#542: draft/unmerged; external validation run red  
Exact A2/A3/A4 workflow runs: **none observable**  
Final convergence candidate: **not constructed**  
Migrations introduced by A5: **none**  
Authority changes by A5: **none; documentation/evidence only**  
Merge/deploy: **NO**
