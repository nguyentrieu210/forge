# A4 Handoff — Manufacturing / BOM Consumer

Branch: `agent/ws09-batch-04-bom`
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
Main at bootstrap: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Risk: **STANDARD**, upgrade to **CRITICAL** if stock/GL/cost side effects enter scope
Owner: WS05 Manufacturing/QMS consumer

## Mission

Adopt the shared BatchAction/BatchTransaction primitive for BOM parent/child/version bulk operations while preserving canonical BOM lifecycle, version/amend semantics and manufacturing authority.

## Required reading

1. `skills/forge-enterprise-completion/SKILL.md`
2. `CURRENT_STATUS.md`
3. `NEXT_TASKS.md`
4. program `PROGRAM_SPEC.md`, `AGENT_BOARD.md`, `NO_STOP_RULE.md`
5. `docs/agents/workstreams/WS05-manufacturing-qms.md`
6. `docs/agents/transaction-closure/02-MANUFACTURING.md`
7. current BOM metadata/controllers/versioning/manufacturing tests
8. A1/A2 contract/executor candidate once available.

## Own

- BOM-specific batch declaration/adapter;
- parent/child/version row mapping;
- preview of planned BOM mutations;
- commit through canonical BOM/manufacturing authority;
- BOM version/amend/correction regression.

## Forbidden

- editing generic batch contract/executor semantics except through Dependency Request;
- creating a second batch primitive;
- stock/GL/cost posting unless explicitly required by existing BOM authority and then risk must be upgraded;
- client native input-table implementation from #542;
- silently overwriting active BOM/version history.

## Work before A1/A2 lands

Audit exact BOM lifecycle and historical bulk/version gaps; define fixtures for parent + child + version operations. Continue tests/spec work without freezing a competing shared contract.

## Invariants

- preview is side-effect free;
- deterministic parent/child ordering;
- duplicate/version collisions fail explicitly;
- active/default BOM semantics are preserved;
- amend/version history is not silently overwritten;
- permission/company/tenant context remains server-authoritative;
- retry/idempotency behavior follows shared executor semantics;
- correction path is explicit.

## Acceptance

- parent/child/version happy path;
- invalid child/version collision failure path;
- preview no-write proof;
- permission/tenant regression;
- retry/idempotency integration evidence;
- manufacturing package gates appropriate to changed code;
- no merge/deploy without approval.

## Current A4 progress — 2026-08-04

Exact BOM/WS05 audit is recorded in `A4-BOM-CONSUMER-AUDIT.md`.

Independent regression added to `server/tests/manufacturing-bom-bulk-api.test.mjs`:

- duplicate matching company/item/revision records fail before write;
- an Active/submitted revision is never overwritten even if the requested business payload otherwise matches.

The existing canonical bulk path already proves, at source level, Draft-only mapping, stable child ordering/fingerprint, side-effect-free preview, exact readable Draft replay, fail-closed payload collision, canonical resource creation and trusted server tenant/read scope. No shared batch primitive was duplicated.

### Dependency Request

From: A4
To: A1/A2
Need: accepted shared BatchAction/BatchTransaction contract plus executor/domain-callback seam.
Why owner belongs there: A1 owns the shared metadata/result contract; A2 owns generic execution/idempotency/audit orchestration.
Blocked scope: final BOM adapter registration, shared retry/idempotency integration evidence and shared result-envelope assertions.
Independent work remaining: BOM lifecycle/version/correction audit and focused regression are complete enough to integrate once the shared heads exist.
Evidence: `A4-BOM-CONSUMER-AUDIT.md`, `manufacturing-lifecycle.ts`, `manufacturing-bom-bulk.ts`, `manufacturing-bom-bulk-api.ts`, `manufacturing-bom-bulk*.test.mjs`.

## Completion Record

Baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
A1/A2 heads consumed: **NONE YET** — observed bootstrap-only heads A1 `e1dd7b4b69296d4916c0a5172ece92aac3cf23d7`, A2 `c8e151d90211baa1fcc828ac1f4d6082c77b9d90`; no accepted shared implementation available at audit time.
Head: `35e2b8e1ebd7640e85bbe8a566df904ab9e0acda` before this handoff update.
PR: `#551` draft -> `program/ws09-batch-productization-20260804`
Changed authority: no BOM write/lifecycle authority changed; only focused regression + A4 audit/evidence docs.
Risk final: **STANDARD**; no stock/GL/cost side effects entered scope.
Tests executed: no executable test run in this session; source/diff audit only.
Tests not executed: `server/tests/manufacturing-bom-bulk.test.mjs`, `server/tests/manufacturing-bom-bulk-api.test.mjs`, final A1/A2 integration matrix, manufacturing package gates. Direct GitHub clone failed because the execution container could not resolve `github.com`.
Migrations: none.
Permission/tenant evidence: Tenant Worker supplies authenticated `tenantId`/actor, requires BOM create+read permission, filters matching revisions through `canReadDocument`, and fails closed when a matching revision is outside read scope.
Version/correction evidence: canonical lifecycle rejects duplicate submitted revision/effective overlap; bulk create replays only an exact Draft, refuses Active/submitted revision overwrite, and therefore preserves correction/version history through canonical lifecycle/new revision rather than silent mutation.
Dependencies remaining: A1 accepted contract + A2 accepted executor seam, then A4 adapter wiring and executable shared idempotency evidence.
Recommended maturity: **no promotion** for shared BOM batch productization until A1/A2 are actually consumed and executable integration evidence exists.
Merge/deploy performed: NO

## Startup prompt

You are **Agent A4 — WS09 BOM Batch Consumer** in `nguyentrieu210/forge`.

Work only on `agent/ws09-batch-04-bom`, baseline `8259d9bac1d2098d9e66195cb22e14072cd75139`. Audit WS05 and exact BOM lifecycle/version authority first. Consume A1/A2's shared primitive; do not create another. Implement parent/child/version bulk behavior with side-effect-free preview, deterministic ordering, explicit version/amend/correction semantics and server-side permission/tenant authority. Keep manufacturing-specific rules in WS05. Upgrade risk to CRITICAL if stock/GL/cost side effects are touched. Add focused regressions and open a draft PR against the program control branch. Do not merge/deploy. Route shared needs to A1/A2 via Dependency Request and continue independent work.
