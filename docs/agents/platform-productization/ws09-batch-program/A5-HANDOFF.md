# A5 Handoff — QA / Convergence

Branch: `agent/ws09-batch-05-convergence`
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
Main at bootstrap: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Risk: inherits highest upstream risk
Owner: independent evidence / convergence

## Mission

Independently audit A1–A4, prevent duplicate primitives/authority drift, assemble one exact convergence candidate and produce evidence sufficient for a defensible maturity recommendation.

## Required reading

1. `skills/forge-enterprise-completion/SKILL.md`
2. `CURRENT_STATUS.md`
3. `NEXT_TASKS.md`
4. program `PROGRAM_SPEC.md`, `AGENT_BOARD.md`, `NO_STOP_RULE.md`
5. WS09, WS04, WS05 workstream docs
6. Transaction Closure inventory/manufacturing evidence
7. exact A1–A4 heads/PRs when available
8. PR #542 validation status as an external dependency.

## Own

- exact-head diff audit;
- ownership and duplicate-primitive audit;
- compatibility/evidence matrix;
- cross-consumer test plan;
- convergence/replay branch preparation;
- capability maturity recommendation;
- final convergence documentation.

## Forbidden

- inventing or silently changing batch contract semantics;
- fixing substantive Stock/BOM behavior directly when owner branch can fix it;
- claiming tests not executed;
- claiming #542 merged/validated without evidence;
- merging/deploying program output.

## Start immediately

Before upstream implementation is ready:

- baseline current AppAction/input-table/BPM/stock/BOM evidence;
- define exact required validation matrix;
- identify CI/run patterns that can provide executable proof;
- build an ownership conflict checklist;
- define capability IDs affected and current maturity without promotion.

## A5 execution progress — 2026-08-04

A5 has started and saved substantive evidence on this branch.

Canonical A5 artifacts:

1. `A5-QA-CONVERGENCE.md`
   - exact program/main baseline;
   - current AppAction/input-table, Stock Reconciliation and BOM authority audit;
   - cross-consumer validation matrix;
   - ownership/duplicate-primitive checklist;
   - exact #542 workflow truth;
   - conservative capability maturity baseline.
2. `A5-CONVERGENCE-CHECKPOINT-01.md`
   - audits the first live A2/A3/A4 implementation heads;
   - identifies and routes a CRITICAL A2 ambiguous-retry durability blocker;
   - records source evidence versus executable evidence.
3. `A5-CONVERGENCE-CHECKPOINT-02.md`
   - refreshes exact worker heads after A2/A3 completion/dependency commits;
   - distinguishes implementation SHA from completion-doc SHA;
   - confirms the A2 retry blocker remains open and final convergence is still unsafe.

### Live worker truth at latest checkpoint

- A1 #548: `e1dd7b4b69296d4916c0a5172ece92aac3cf23d7` — bootstrap only; canonical public contract absent.
- A2 #549: `2f5a699e4d2485659f4ecc45acfe866c165d6095` — vertical-neutral runtime executor present; static ownership audit PASS; A2 self-reports isolated strict compile + targeted harness evidence, but exact GitHub workflow evidence remains absent; A5 ambiguous-success retry durability blocker remains unresolved. A2 recommends Foundation only.
- A3 #550: `0af59fc44f5bd235da7eebfb0aa7934fb02391a2` — completion-doc head; PR identifies implementation head `d36981ed3bd53f16552dfff96783fc6bf520fa80`. Stock Reconciliation domain mapper + canonical-controller preview source evidence present; no direct stock authority added; executable test remains NOT EXECUTED and shared commit integration awaits A1/A2.
- A4 #551: `25af161e3b22258ab8061b7ef97988a6ac5ce5c9` — BOM lifecycle audit + focused duplicate/Active revision regression; correctly does not bind to provisional A2 before A1.

### Dependency routing performed

**A5-DR-01 -> #542 / WS14 validation owner**

#542 has an observable validation run now; prior prose saying there was no run is stale. Exact run `30850149684`, job `91807894696` failed during `@metaforge/views` TypeScript build because workspace chart/visual dependencies were unresolved. Locked install and core typecheck passed; targeted input-table Node test did not execute; runtime production build was skipped. #542 remains draft/unmerged/unvalidated.

**A5-DR-02 -> A2 #549 + A1 #548**

A2 acquires a replay claim, executes authoritative domain work, then finalizes the replay result. If domain commit succeeds but replay finalization fails or the process becomes ambiguous in that window, retry safety depends on per-item canonical idempotency that the current executor does not enforce/prove. A5 routed this directly to A2 and added the corresponding public-contract requirement to A1. Latest A2 dependency docs also identify the absence of a multi-document DocumentKernel transaction scope; A2 correctly refuses to fake `atomic` semantics.

### Current convergence decision

**FINAL CONVERGENCE CANDIDATE NOT CONSTRUCTED.**

This is evidence-based, not idle waiting. Final assembly is blocked by:

1. A1 public contract absent;
2. A2 ambiguous-retry durability not closed/proven;
3. authoritative multi-document atomic transaction scope absent or not explicitly removed from the public contract;
4. A3/A4 not yet wired through one accepted A1/A2 revision;
5. no exact GitHub workflow run for current A2/A3/A4 heads;
6. #542 native client gate remains red.

No capability promotion is justified yet.

## Final convergence checks

- A1 contract is the only canonical batch contract;
- A2 executor contains no vertical business rules;
- A3/A4 consume the same primitive;
- preview is side-effect free across both consumers;
- idempotency/retry evidence spans shared executor + consumers;
- tenant/permission paths are server-authoritative;
- stock correction/reconciliation and BOM version/correction evidence exist;
- migrations replay if present;
- exact current main drift is audited before convergence;
- executable test/build/package gates are recorded with exact run/job/head;
- capability promotion is evidence-based only.

## Completion Record

Baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
A1 head/PR: `e1dd7b4b69296d4916c0a5172ece92aac3cf23d7` / #548 — bootstrap only
A2 head/PR: `2f5a699e4d2485659f4ecc45acfe866c165d6095` / #549 — runtime implementation + dependency docs; A5-DR-02 open
A3 head/PR: `0af59fc44f5bd235da7eebfb0aa7934fb02391a2` / #550 — completion-doc head; implementation `d36981ed3bd53f16552dfff96783fc6bf520fa80`
A4 head/PR: `25af161e3b22258ab8061b7ef97988a6ac5ce5c9` / #551 — domain audit/regression present, shared integration intentionally pending
#542 status: open draft/unmerged; run `30850149684`, job `91807894696` FAILURE; native targeted test/runtime build unproven
Convergence head/PR: A5 branch / #552; final combined candidate not constructed
Validation runs/jobs: no exact GitHub A2/A3/A4 run observable; #542 external failed run recorded above
Tests executed: A5 claims no local/executable repository test run; static exact-source/PR/workflow audit only. A2 worker-reported isolated tests are not promoted to independent A5 PASS.
Tests not executed: final shared contract/executor/Stock/BOM combined matrix; exact integrated A2/A3/A4 gates; #542 targeted/runtime build
Migrations: none introduced by A5
Authority diff audit: A2 vertical-neutral static PASS; A3 no new stock authority static PASS; A4 no duplicate shared/BOM primitive static PASS; final combined audit pending
Recommended maturity changes: none
Production deployment: NO

## Startup prompt

You are **Agent A5 — WS09 Batch QA/Convergence** in `nguyentrieu210/forge`.

Work only on `agent/ws09-batch-05-convergence`, baseline `8259d9bac1d2098d9e66195cb22e14072cd75139`. Begin independent baseline/evidence audit immediately; do not wait idly for A1–A4. Define the cross-consumer validation matrix and ownership checks. When candidate heads arrive, compare exact diffs, ensure there is one canonical batch contract/executor, route substantive defects back to owners, and construct a convergence candidate only after dependencies are satisfied. Treat absent CI as UNPROVEN. Do not merge/deploy. Open a draft PR against `program/ws09-batch-productization-20260804` when convergence artifacts are substantive.
