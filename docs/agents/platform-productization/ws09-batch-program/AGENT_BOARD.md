# WS09 Batch Productization — Agent Board

Program baseline: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Control branch: `program/ws09-batch-productization-20260804`
Status: **BOOTSTRAPPED**

| Agent | Branch | Mission | Primary ownership | Risk | Depends on |
|---|---|---|---|---|---|
| A1 | `agent/ws09-batch-01-contract` | Define canonical BatchAction/BatchTransaction metadata + result contract | App Factory/app-registry contract, compiler/schema-facing contract tests | STANDARD | control baseline |
| A2 | `agent/ws09-batch-02-executor` | Implement generic server batch execution/idempotency/audit primitive | generic executor/orchestrator only; no Stock/BOM business rules | CRITICAL when commit-capable | A1 contract |
| A3 | `agent/ws09-batch-03-inventory` | Adopt generic primitive in Stock Reconciliation path | Inventory/WS04 consumer-specific code + stock regression | CRITICAL | A1+A2 |
| A4 | `agent/ws09-batch-04-bom` | Adopt generic primitive for BOM parent/child/version operations | Manufacturing/WS05 consumer-specific code + regression | STANDARD/CRITICAL by side effects | A1+A2 |
| A5 | `agent/ws09-batch-05-convergence` | Independent audit, evidence matrix, integration and convergence | tests/evidence/convergence docs; no competing implementation primitive | inherits max risk | all candidate heads |

## Ownership rules

### A1 — Contract
Owns the semantic shape only. It may change shared App Factory/app-registry manifest/compiler contracts and corresponding tests. It must not implement stock reconciliation, BOM behavior, or production UI.

Deliverables:
- canonical `BatchAction` / `BatchTransaction` contract;
- preview/commit/result/atomicity/idempotency semantics;
- bounded validation and parser/compiler coverage;
- migration/compatibility decision;
- Dependency Request to A2 if execution needs a shared seam not represented in contract.

### A2 — Executor
Owns shared execution infrastructure only. It consumes A1; it does not invent a second contract.

Deliverables:
- generic batch executor;
- trusted tenant/user/permission context propagation;
- idempotency/replay guard;
- deterministic ordered result envelope;
- atomicity behavior and failure tests;
- audit correlation;
- no vertical field names or domain-specific rules.

### A3 — Inventory
Owns the Stock Reconciliation consumer. It may not edit shared App Factory contract except through a Dependency Request to A1/A2.

Deliverables:
- Stock Reconciliation uses the generic primitive;
- side-effect-free preview;
- authoritative commit through existing inventory/document authority;
- no direct stock ledger bypass;
- permission/warehouse/tenant/idempotency/correction evidence;
- focused stock reconciliation regressions.

### A4 — BOM
Owns the Manufacturing/BOM consumer. It may not edit generic primitive internals except through Dependency Request.

Deliverables:
- parent/child/version bulk operation using shared primitive;
- explicit version/amend/correction semantics;
- side-effect-free preview;
- authoritative manufacturing controller path;
- focused BOM/manufacturing regressions.

### A5 — QA / Convergence
Owns evidence and convergence, not shared feature implementation.

Deliverables:
- exact-head diff/ownership audit;
- contract compatibility matrix;
- targeted + cross-consumer validation matrix;
- migration replay evidence if applicable;
- capability maturity recommendation without over-promotion;
- final convergence PR/candidate only after upstream worker heads are ready.

## Forbidden overlap

- A3/A4 must not create their own batch execution primitive.
- A2 must not encode Stock or BOM schema/rules.
- A1 must not rewrite UI native input-table work from PR #542.
- A5 must not silently fix domain behavior in convergence; route defects back to owning worker unless a trivial merge-only correction is unavoidable and documented.

## Dependency request format

```text
Dependency Request
From: A<n>
To: A<n>/workstream
Need: <specific shared change>
Why owner belongs there: <reason>
Blocked scope: <exact subsection>
Independent work remaining: <yes/no + list>
Evidence: <path/test/diff>
```

## Merge discipline

Workers open draft PRs against the **program/control branch**, not directly against `main`, unless coordinator explicitly changes the convergence topology. No worker merges itself.

Final program merge/deploy remains blocked pending explicit approval and required validation evidence.
