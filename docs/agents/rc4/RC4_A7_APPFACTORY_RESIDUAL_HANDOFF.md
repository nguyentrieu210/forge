# RC4-A7 — App Factory Residual RC Closure

Status: **BOOTSTRAPPED**
Branch: `agent/rc4-07-appfactory-residual`
Seed: exact `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Risk: **CRITICAL** where rollback/migration/workflow authority changes.
Owner stream: **WS09**

## Mission

Close the residual App Factory gaps left after WS09 Batch Productization. Do **not** rebuild BatchAction/BatchTransaction or create a second compiler/runtime authority.

## Read first

- `skills/forge-enterprise-completion/SKILL.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `docs/agents/workstreams/WS09-bpm-app-factory.md`
- `docs/agents/rc/RC3_A2_PLATFORM_IAM_APPFACTORY_EVIDENCE.md`
- `docs/agents/rc/RC3_A5_INDEPENDENT_QA.md`
- WS09 Batch Productization convergence/evidence under `docs/agents/platform-productization/ws09-batch-program/`

## Primary scope

1. Generic materialized app revision rollback / reverse-migration contract with deterministic safety checks.
2. Approval depth: quorum, timer, escalation and reusable approval/action contracts where capability evidence is still below RC.
3. Preserve first-class AppAction input-table and BatchAction/BatchTransaction authority already converged; only fill proven residual gaps.
4. Permission/tenant/audit/idempotency evidence for workflow and app revision operations.
5. Focused executable regressions and migration replay where schema changes are required.

## Forbidden / avoid

- No second BatchAction/BatchTransaction implementation.
- No direct domain ledger/business writes from App Factory runtime.
- No blind reverse migration for potentially applied schema changes.
- No edits to WS11 security or WS14 shared presentation to bypass a dependency.

## Dependencies

- A1/WS11 for IAM/approval/security policy constraints.
- A3/WS13 for migration/applied-state identity when rollback touches schema.
- A6/WS14 for renderer/UI consumption; backend contracts can proceed independently.

Record Dependency Requests and continue independent WS09-owned implementation.

## Acceptance

RC promotion requires explicit invariants, permission/tenant evidence, failure/correction/retry semantics and executable tests. Hardened requires production-grade evidence and is not inferred from merge state.

## Merge/deploy boundary

Non-UI/contract work is not auto-merged. Commit, test, open PR and **stop before merge/deploy** until explicit user approval. Pure presentation-only changes, if any, must remain separable from the contract PR.
