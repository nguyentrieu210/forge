# WS09 Batch Productization Program

Date: **2026-08-04**
Status: **BOOTSTRAPPED — IMPLEMENTATION NOT STARTED**
Program branch: `program/ws09-batch-productization-20260804`
Exact baseline: `main@cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Program owner: coordinator / WS09
Execution topology: **PROGRAM — 5 workers**

## 1. Mission

Turn the existing App Factory `AppAction.input_tables` seam into reusable **BatchAction / BatchTransaction** platform primitives, then prove reuse through Inventory Stock Reconciliation and Manufacturing BOM consumers without hard-coding either vertical into the shared runtime.

This program follows `skills/forge-enterprise-completion/SKILL.md` and `docs/agents/AUTO_AGENT_ORCHESTRATION.md`.

## 2. Current truth

- Enterprise Transaction Closure is closed for its declared scope.
- WS09 is the first Platform Productization priority.
- Canonical PR #362 already merged server/tooling support for first-class `AppAction.input_tables`, BPM/App Factory work and rollback/revision seams.
- Delivery PR #542 implements the client-side first-class `input_tables` consumption boundary, but remains draft because executable validation evidence is still missing.
- The current main advanced to `cf5dd0da...` through a UI presentation revert. That commit does not change server business authority.

No worker may claim #542 merged or validated unless exact GitHub evidence proves it.

## 3. Target architecture

```text
App manifest / builder
  -> BatchAction metadata contract
      -> generic batch executor
          -> domain-owned item operation
              -> canonical document/domain controller
                  -> authoritative side effect / ledger / audit

Consumers:
  Inventory Stock Reconciliation
  Manufacturing BOM parent+child/version operations
```

The generic layer owns orchestration semantics only. Domain controllers remain authoritative for stock, BOM, ledger, valuation, permissions and lifecycle rules.

## 4. Shared contract goals

The program must define one reusable contract for:

- batch identity and idempotency key;
- input table and row identity;
- operation mode: preview / commit;
- atomicity policy: all-or-nothing vs explicitly declared independent items;
- deterministic ordering;
- per-item success/error result envelope;
- retry/replay semantics;
- correction/cancel ownership;
- permission delegation to the target domain action;
- tenant/org context propagation from trusted server context;
- audit correlation IDs;
- bounded batch size;
- stable output usable by generic UI/reporting.

The platform contract must not know Stock Reconciliation fields, BOM schema, warehouse rules, valuation logic or manufacturing costing rules.

## 5. Worker topology

```text
CONTROL
  -> A1 CONTRACT
      -> A2 EXECUTION ENGINE
          -> A3 INVENTORY CONSUMER
          -> A4 BOM CONSUMER
  -> A5 QA / CONVERGENCE

External dependency:
  PR #542 native client input_tables evidence/promotion
```

A5 starts immediately with baseline/evidence audit and fixtures, but final convergence depends on A1-A4 candidate heads.

## 6. Merge order

1. A1 contract reviewed and accepted into program convergence candidate.
2. A2 executor rebased/replayed on accepted A1 contract.
3. A3 and A4 consume the same accepted contract independently.
4. #542 is integrated only after its executable gates are green; no worker may bypass that gate by duplicating the client contract elsewhere.
5. A5 constructs one exact convergence candidate and runs the combined evidence matrix.
6. Backend/schema/migration/business-rule changes stop before merge/deploy until explicit user approval.

## 7. Program acceptance gates

### Shared contract
- no vertical-specific field/schema names in generic primitive;
- immutable/side-effect-free preview contract;
- idempotency/replay semantics explicit;
- tenant/permission context server-authoritative;
- deterministic result envelope;
- compatibility strategy documented.

### Execution engine
- successful batch path;
- partial/failure semantics match declared atomicity;
- repeated idempotency key cannot duplicate committed side effects;
- retry after failed transport is deterministic;
- target domain validation remains authoritative;
- audit correlation exists;
- no client-trusted tenant/role authority.

### Inventory consumer
- canonical Stock Reconciliation/domain path used;
- preview has no stock side effects;
- commit uses domain validation and inventory authority;
- correction/reversal semantics explicitly preserved;
- tenant/warehouse/permission tests;
- reconciliation/evidence appropriate for stock risk.

### BOM consumer
- parent/child/version operation contract explicit;
- no duplicate version/amend behavior;
- domain controller remains authority;
- preview is side-effect free;
- deterministic result and correction strategy;
- manufacturing regression evidence.

### Convergence
- exact heads and merge base recorded;
- no ownership overlap/duplicate primitive;
- targeted tests + package gates + typecheck/build appropriate to changed scope;
- migrations replayed if any migration exists;
- capability maturity only promoted when evidence justifies it;
- no production deploy inferred from merge.

## 8. Risk

- A1: **STANDARD** — shared metadata/API contract.
- A2: **CRITICAL** if it can commit multiple authoritative documents/side effects; otherwise STANDARD until execution authority is wired.
- A3: **CRITICAL** — inventory/stock authority.
- A4: **STANDARD**, upgraded to CRITICAL if the implementation posts stock/GL/cost side effects.
- A5: evidence/convergence; inherits the highest changed risk.

## 9. Forbidden shortcuts

- Do not implement Stock/BOM-specific branching inside App Factory generic runtime.
- Do not bypass document kernel/domain controller for speed.
- Do not use UI permission as authority.
- Do not claim atomicity unless transaction behavior is actually proven.
- Do not silently continue failed rows if contract declares all-or-nothing.
- Do not call a batch `Hardened` because unit tests pass.
- Do not merge stale historical PRs wholesale; replay only verified net-new deltas.
- Do not merge/deploy non-UI work without explicit approval.

## 10. External dependency — PR #542

PR #542 is the client consumption lane for first-class `input_tables`. It is not part of this control branch and must not be duplicated by A1-A4.

If a consumer requires UI before #542 is validated, use server fixtures/contract tests and record a Dependency Request rather than editing the same client boundary.

## 11. Program completion record

Fill only after convergence:

- exact final main base:
- A1 head/PR:
- A2 head/PR:
- A3 head/PR:
- A4 head/PR:
- A5 convergence head/PR:
- validation runs/jobs:
- migrations:
- production deployment: **NOT PERFORMED unless explicitly recorded otherwise**
- capability maturity changes:
