# UI05 — QA / CONVERGENCE

Date: 2026-08-03
Baseline: `main@55e105e7a03f6bffc70a5ddb0e52d125e5b8d270`
Branch: `agent/ui-05-qa`
Role: integration contract review, genericity proof, E2E/performance/evidence

## Mission

Act as the independent verifier for the MetaForge UI Factory program. Build the acceptance matrix, identify cross-branch contract conflicts early, design second-reference proofs, and create targeted tests/evidence without becoming a second owner of production implementation.

## Read first

1. exact branch/main/PR state;
2. `CURRENT_STATUS.md`, `NEXT_TASKS.md`;
3. `skills/forge-enterprise-completion/SKILL.md`;
4. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
5. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
6. `server/docs/METAFORGE-BULK-VIEW-ARCHITECTURE-20260802.md`;
7. current Matrix reference code in `ItemPriceMatrixPanel.tsx` and its routing special case;
8. existing test/browser/evidence conventions;
9. Draft PR #370 planning docs if useful.

## Owned scope

Preferred ownership:

- test plans, integration fixtures, browser/E2E tests, performance smoke tests;
- static/domain-leak checks;
- cross-branch contract review docs;
- second-reference fixtures/configuration drafts when they do not redefine production owner contracts;
- convergence evidence and maturity assessment.

Do not rewrite META/RUNTIME/PRICING production code unless fixing an isolated test-only defect. File Dependency Requests instead.

## Acceptance matrix

Build a test matrix covering these dimensions:

### Contract

- valid Matrix metadata accepted;
- malformed axis/cell/action bindings fail closed;
- compiler transport preserves metadata;
- runtime adapter receives deterministic view-model;
- no route/action namespace collision.

### Genericity

Static/runtime checks must reject or flag shared Matrix renderer conditions using business names such as:

- Item Price;
- Price List;
- UOM;
- Supplier Item;
- Warehouse;
- Alumdoor.

The exact implementation can use fixtures, grep/static checks and code review evidence. The rule is architectural, not merely cosmetic.

### Security/data authority

- server permission denial;
- tenant isolation;
- stale OCC conflict;
- idempotent/retry-safe compound action behavior;
- transaction/ledger target cannot use unsafe generic update;
- client role/tenant claims cannot override trusted server context.

### UX parity

For Alumdoor Item Price reference, verify desktop/tablet/mobile:

- hierarchy navigation;
- both search scopes;
- price columns;
- UOM rows/conversion;
- enable/disable cell;
- edit/create/update/remove flows;
- sticky axes;
- focus mode;
- hidden columns;
- dirty guard;
- loading/empty/error/conflict states;
- keyboard/touch behavior;
- large catalog completeness.

### Performance

Create bounded engineering checks, not fake SLA claims:

- no N x M request explosion;
- bounded/searchable axes;
- sparse cell data supported;
- large matrix does not eagerly render an unbounded Cartesian product;
- stale searches can be cancelled/ignored;
- stable render/update behavior under repeated edits.

## Second-reference proof ladder

Prepare fixtures and acceptance for at least these generic relationships:

1. `Supplier x Item` — procurement relationship;
2. `Item x Warehouse/Reorder` — inventory policy;
3. `Item Group x Account` — mapping matrix;
4. `User x Role` — privileged matrix, test only after WS11 review.

A second reference passes only when it requires metadata/domain action changes, not a new business-name conditional in shared renderer.

## Convergence review

When other branch outputs become available, classify every overlapping delta:

- keep;
- extract generic;
- superseded;
- reject.

Do not recommend blind branch merges.

Expected convergence order:

1. META contract;
2. RUNTIME adaptation to canonical contract;
3. PRICING projection/actions;
4. ALUM metadata/reference wiring;
5. QA full targeted/browser/evidence pass;
6. only then remove Item Price special case;
7. second-reference proof.

## Maturity gates

- `Foundation`: schema/API seam exists.
- `Wired`: Matrix works end-to-end for reference path.
- `RC`: Item Price parity + invariants + targeted regression + second-reference evidence.
- `Hardened`: production-grade failure/security/performance/release evidence in declared scope.

Never promote from test count alone.

## Deliverables

- cross-branch acceptance matrix;
- conflict/hotspot report;
- second-reference fixture plan/tests;
- static no-domain-leak check;
- security/OCC/idempotency test plan/evidence;
- browser matrix for mobile/tablet/desktop;
- performance smoke plan/evidence;
- convergence recommendation with exact branch/SHA evidence.

## Acceptance

Wave A is complete when QA can state clearly:

- what can be tested independently now;
- what waits on each other branch;
- which contracts conflict;
- whether Matrix architecture can support second references without a fork;
- exact evidence required before RC;
- exact evidence required before deleting the current Item Price special-case.

Branch remains unmerged/un-deployed pending convergence approval.

## Prompt to start this agent

`Đọc docs/agents/ui-factory/UI05-QA.md và Forge Enterprise Completion Skill. Làm independent QA/convergence owner: dựng acceptance matrix, genericity/security/OCC/performance/browser tests, chuẩn bị second-reference Supplier×Item và Item×Warehouse. Không giành ownership production code của META/RUNTIME/PRICING/ALUM; nếu thấy gap ghi Dependency Request. Không merge/deploy.`
