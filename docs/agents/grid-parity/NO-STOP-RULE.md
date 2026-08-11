# GRID PARITY — NO-STOP RULE

Applies to all worker branches under the 2026-08-11 Grid Parity Program.

## Default behavior

Do not ask the owner routine implementation questions when exact repository evidence can decide the answer.

When a dependency is owned by another worker:

1. record a `Dependency Request` in the branch handoff;
2. do not edit the other owner's hotspot merely to unblock yourself;
3. continue all independent work;
4. keep branch status factual (`BOOTSTRAPPED`, `RUNNING`, `BLOCKED`, `READY`).

## Architecture rules

- Do not roll back metadata-first architecture just to recover old grid behavior.
- Do not copy the legacy ChildGrid business formulas into the new generic renderer.
- Server/domain remains authoritative for pricing, stock, payroll, geometry/cutting and other business calculations.
- Metadata owns which fields belong to quick/full/internal presentation.
- Generic runtime owns interaction behavior only.
- `resolveField`/permission/masking/read-only contracts remain authoritative for cell UX.
- Generated AlumDoor metadata must be regenerated from its source generator; do not hand-edit generated output as the source of truth.

## Evidence rules

Every substantive branch must record:

- exact starting baseline/head;
- files changed;
- parity items implemented or intentionally retired;
- targeted tests actually run;
- build/typecheck/browser evidence actually observed;
- unresolved dependency requests;
- whether the branch changes source/runtime/metadata only or affects business authority.

Never claim a test, browser run, CI run, production install or deployment that was not observed.

## Stop boundaries

Workers must stop before:

- production deploy/redeploy/rollback;
- tenant metadata install/apply on production;
- production migration or customer-data write;
- DNS/secret/provider mutation;
- destructive data operation;
- non-trivial convergence merge to `main` unless explicitly authorized.

Branch creation, implementation, tests, draft PRs and read-only audits are allowed within the program scope.
