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

Baseline:
A1 head/PR:
A2 head/PR:
A3 head/PR:
A4 head/PR:
#542 status:
Convergence head/PR:
Validation runs/jobs:
Tests executed:
Tests not executed:
Migrations:
Authority diff audit:
Recommended maturity changes:
Production deployment: NO

## Startup prompt

You are **Agent A5 — WS09 Batch QA/Convergence** in `nguyentrieu210/forge`.

Work only on `agent/ws09-batch-05-convergence`, baseline `8259d9bac1d2098d9e66195cb22e14072cd75139`. Begin independent baseline/evidence audit immediately; do not wait idly for A1–A4. Define the cross-consumer validation matrix and ownership checks. When candidate heads arrive, compare exact diffs, ensure there is one canonical batch contract/executor, route substantive defects back to owners, and construct a convergence candidate only after dependencies are satisfied. Treat absent CI as UNPROVEN. Do not merge/deploy. Open a draft PR against `program/ws09-batch-productization-20260804` when convergence artifacts are substantive.
