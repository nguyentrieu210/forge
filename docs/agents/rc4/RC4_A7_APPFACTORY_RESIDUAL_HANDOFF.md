# RC4-A7 — App Factory Residual RC Closure

Status: **READY**
Branch: `agent/rc4-07-appfactory-residual`
PR: **#606**
Seed: exact `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Verified substantive candidate: `2c640ec1656e617ffa6c780888b2fe4b56ab55ea`
Risk: **CRITICAL** where process persistence / tenant migration / workflow authority changes.
Owner stream: **WS09**

## Mission result

A7 closed the independently owned WS09 runtime gap without rebuilding the already-converged BatchAction/BatchTransaction or AppAction input-table authority.

The branch now provides a persisted, tenant-scoped App Factory approval-process runtime around the existing WS09 BPM primitives and keeps materialized app rollback fail-closed until WS13 supplies an applied-state-aware reverse-migration contract.

No production deployment, tenant migration, DNS/secret/provider mutation or merge has been performed.

## Read / audit basis

The implementation was re-audited after the user explicitly requested the documentation be read again. Source truth used:

- `skills/forge-enterprise-completion/SKILL.md`
- exact `main`, A7 branch and PR state
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `PROJECT_CONTEXT.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `docs/agents/workstreams/WS09-bpm-app-factory.md`
- `docs/agents/rc/RC3_A2_PLATFORM_IAM_APPFACTORY_EVIDENCE.md`
- `docs/agents/rc/RC3_A5_INDEPENDENT_QA.md`
- WS09 Batch Productization convergence/evidence under `docs/agents/platform-productization/ws09-batch-program/`

The audit confirmed the intended residual baseline:

- `B01-005` Parallel approval: `Missing` in RC3 canonical evidence despite existing evaluator primitives because no persisted/runtime-connected process authority existed.
- `B01-009` Escalation: `Missing`; deterministic timer/escalation primitives existed but no persisted process state/provider delivery proof.
- `B01-010` SLA/timer: `Missing` for the same runtime/evidence gap.
- `B02-006` App rollback: `Foundation`; presentation-only rollback exists and intentionally refuses materialized metadata rollback.

## Delivered authority

### 1. Persisted approval-process runtime

New `server/packages/app-registry/src/app-factory-approval-runtime.ts` plus tenant migration `0114_app_factory_approval_runtime.sql` add process-control persistence only:

- process snapshot pins `definition_name`, `definition_key`, server-assigned definition version, target DocType/name/version, approval plan and timer plan;
- append-only decision facts record stage, actor, decision, matched approver, optional delegation and process revision;
- command receipts bind tenant + command ID + process + actor + payload hash for exact retry/replay semantics;
- one pending process per definition/target is enforced by a partial unique index;
- process revision uses optimistic concurrency and each process is serialized through its existing Durable Object key;
- read-only `inspect` returns current revision/open stage/decision/timer evidence without advancing process revision or manufacturing a write receipt.

### 2. Existing WS09/WS11 contracts are reused, not forked

The runtime reuses:

- existing `bpm-approval.ts` any/all/quorum evaluator and distinct-actor rules;
- existing `bpm-timer.ts` deterministic due/escalation planner;
- existing `AppFactoryDefinitionResolver` for one effective Active Process definition;
- existing `MetadataPermissionService` for server-side target permission checks;
- existing `D1OrganizationSecurityGuard.checkSoD()` and `canActThroughDelegation()` for WS11 segregation-of-duties and delegation authority.

No second approval-policy, delegation, BatchAction, BatchTransaction, document or ledger authority was introduced.

### 3. Authoritative kernel wiring

`server/apps/tenant-worker/src/aggregate-do.ts` now:

- registers the existing `AppFactoryDefinitionController` before the generic metadata fallback;
- routes only the virtual `App Factory Approval Process` aggregate to the new process-control runtime;
- leaves all target business-document, stock, finance, payment and other domain mutation on the canonical document kernel/controllers.

A7 contains an explicit CI guard rejecting direct `INSERT` into `documents`, GL, stock or payment authority from the approval runtime.

### 4. App Factory package contract corrected

The audit found that the first-party App Factory source package could not pass its own canonical manifest parser:

- `App Factory Definition` redeclared reserved system field `status`;
- `client.catalog_mode` used unsupported value `native` while the canonical contract accepts `manifest | workspace | hybrid`.

A7 corrected this without changing the lifecycle meaning:

- app metadata now uses `definition_status` (`Draft / Active / Retired`), DocType revision `2`;
- controller/resolver can still read legacy `data.status`, but every new authoritative write emits `definition_status`; canonical document `.status` remains the lifecycle status;
- app version is `0.1.1`;
- `catalog_mode` is `manifest`, matching the app's manifest-owned navigation.

### 5. Rollback evidence path corrected, scope deliberately not broadened

`server/tests/app-revision-history.test.mjs` referenced stale migration `0049_app_revision_history.sql`; exact canonical migration is `0088_app_revision_history.sql`. A7 corrects the regression path and normalizes Node 22 SQLite row prototypes for data-equivalent assertions.

The rollback planner/executor still refuses materialized metadata differences. A7 does **not** add blind reverse SQL or infer unapplied/applied migration state.

## Explicit invariants

1. Trusted tenant/user/roles come from the authenticated command boundary; process payload cannot choose a tenant or actor.
2. Target DocPerm is checked server-side at process start/inspect/decision as appropriate.
3. Each decision must match an approver selector in the currently open stage.
4. User selectors must match the live actor; role selectors require the live role or an existing WS11 delegation proof.
5. Existing WS11 SoD authority must allow the approval action.
6. Target document version is pinned at process start; changed or cancelled targets fail closed and require restart/correction.
7. Process `expected_version` prevents stale concurrent decisions.
8. A command ID may replay only for the same tenant/process/actor/payload hash.
9. Decision facts are append-only; the same actor cannot vote twice in one stage.
10. Timer/escalation state is deterministic from persisted stage-open evidence; no provider success is inferred.
11. App Factory process tables never become document/ledger/business-record authority.
12. Materialized app rollback remains blocked without explicit applied-state-aware reverse migration.

## Exact executable evidence

Substantive candidate `2c640ec1656e617ffa6c780888b2fe4b56ab55ea` ran GitHub Actions workflow **RC4 A7 App Factory Validation**:

- run: **30869377420**
- job: **91868007636**
- conclusion: **SUCCESS**
- exact checkout: `2c640ec1656e617ffa6c780888b2fe4b56ab55ea`
- App Factory/BPM/definition/package matrix: **36/36 PASS**
- rollback/revision matrix: **11/11 PASS**
- SQL verifier: `FRAPPE_PLATFORM_AND_ERP_CORE_SCHEMA_PASS`
- SQL fixed-point/reference guards: `SQLITE_SCHEMA_TRIGGER_FIXED_POINT_AND_REFERENCE_GUARDS_PASS`
- no-direct-document/ledger-write authority guard: PASS
- changed-authority TypeScript guard: PASS

The scoped TypeScript graph still prints repository baseline `exactOptionalPropertyTypes` errors in other packages such as `clouderp-selling`, `clouderp-erpnext` and one `frappe-model` path. They do not intersect A7 changed authority and are not claimed fixed or globally green.

This handoff documentation commit changes the PR head after the substantive candidate. The exact post-handoff PR-head validation must also remain green before merge approval; no implementation/evidence claim should be weakened if that rerun differs.

## Capability recommendation — conservative

Do not edit the canonical 956-ID status before convergence/merge. Recommended A0/coordinator re-audit after merge:

| Capability | RC3 baseline | A7 recommendation | Boundary |
|---|---|---|---|
| `B01-005` Parallel approval | Missing | **Wired candidate** | Persisted/runtime-connected quorum + OCC/idempotency/permission/SoD/delegation evidence exists; no browser/domain-transition/production promotion evidence, so not RC/Hardened. |
| `B01-009` Escalation | Missing | **Foundation/Wired candidate** | Persisted deterministic escalation state/event keys are inspectable; autonomous delivery/retry/provider evidence remains WS12 dependency. |
| `B01-010` SLA/timer | Missing | **Foundation/Wired candidate** | Persisted stage-open/timer state and overdue evaluation exist; scheduler/provider recovery evidence is not in A7. |
| `B02-006` App rollback | Foundation | **Foundation retained** | Presentation rollback is tested; materialized reverse migration remains intentionally blocked. |

No `Hardened` claim is made.

## Dependency Requests

### DR-A7-01 -> A3 / WS13 — materialized app reverse migration

Need the canonical migration applied-state identity and reverse/correction contract before A7 can safely automate rollback of materialized DocTypes/workflows/custom fields/fixtures.

Required properties:

- exact applied migration identity/version/tenant evidence;
- explicit reversible operation classification rather than guessed down-SQL;
- preflight/reconciliation for destructive field/state/data changes;
- retry/correction semantics and migration replay;
- no reuse of migration numbers already present/applied.

Blocking: **yes** for generic materialized `B02-006` promotion; **no** for the approval runtime delivered here.

### DR-A7-02 -> A2 / WS12 — timer/escalation delivery and recovery

Need provider/runtime evidence for autonomous due/escalation dispatch:

- scheduler/workflow trigger ownership;
- exact-once/idempotent event consumption or deterministic replay;
- retry/DLQ/recovery/alert evidence;
- tenant isolation and stale-process suppression.

Blocking: **yes** for claiming autonomous escalation/SLA RC; **no** for deterministic persisted timer state.

## Migration ownership / parallel RC4 review

At the last exact parallel review:

- A4 owns `0113_vn_vat_account_mapping_guard_hardening.sql`;
- A5 has no tenant migration in its current diff;
- A7 reserves `0114_app_factory_approval_runtime.sql`;
- A7 remains based on exact `main@1f0b089...` with no current-main drift at the substantive validation point.

Coordinator must re-check numbering if another migration lands before convergence; A7 must not renumber or overwrite an applied migration blindly.

## Merge/deploy boundary

This branch changes backend/shared runtime behavior and tenant schema. It is **not UI-only**.

- PR `#606` is open against `main`.
- Status is `READY`, not `DONE`.
- Do **not** merge, apply tenant migration or deploy production without explicit user approval after exact final PR-head validation.
