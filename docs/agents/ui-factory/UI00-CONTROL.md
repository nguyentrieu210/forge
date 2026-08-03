# UI00 — MetaForge UI Factory Control

Date: 2026-08-03
Baseline: `main@55e105e7a03f6bffc70a5ddb0e52d125e5b8d270`
Branch: `agent/ui-00-control`
Role: coordination / convergence only

## Mission

Coordinate the post-WS00–17 MetaForge UI Factory program without becoming another implementation owner.

North Star outcome:

> Business intent + metadata + domain actions -> MetaForge shared runtime -> enterprise-grade UI, without app-specific React forks.

The first reference extraction is Alumdoor Item Price Manager. Preserve its UX quality while converting the pattern into a reusable Matrix primitive. The program then expands toward the Enterprise UI Pattern System described in Draft PR #370.

## Parallel branches

| Branch | Short name | Owns |
| --- | --- | --- |
| `agent/ui-01-meta` | META | UI Grammar schema, `viewPolicy.matrix`, compiler/validator |
| `agent/ui-02-runtime` | RUNTIME | generic Matrix renderer, layout/runtime/mobile/a11y |
| `agent/ui-03-pricing` | PRICING | pricing projection/actions, compound save, OCC/idempotency |
| `agent/ui-04-alumdoor` | ALUM | current-price UX reference, parity fixtures, metadata wiring plan |
| `agent/ui-05-qa` | QA | integration contract review, second references, E2E/perf/evidence plan |

All six branches were created from the same exact baseline above.

## Canonical sources

Before doing any work, re-read in this order:

1. exact GitHub branch/main/PR state;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `PROJECT_CONTEXT.md` if present;
5. `skills/forge-enterprise-completion/SKILL.md`;
6. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
7. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
8. `server/docs/METAFORGE-BULK-VIEW-ARCHITECTURE-20260802.md`;
9. Draft PR #370 planning docs when reconciling the program.

Code + migrations + tests + exact GitHub state win over stale docs.

## Program invariants

1. Shared runtime must not gain new business-name conditionals such as `if (doctype === ...)`.
2. Metadata describes UI intent/binding; domain packages own business correctness.
3. Server permissions remain authoritative.
4. Pricing, stock, finance, IAM and other unsafe writes must not become generic client-side document mutation merely for UI convenience.
5. OCC/idempotency/audit/tenant boundaries remain intact.
6. Existing good Alumdoor Price Manager UX must be preserved or improved.
7. Matrix is not declared generic from one example. Minimum proof ladder:
   - Item/UOM x Price List;
   - Supplier x Item;
   - Item x Warehouse/Reorder;
   - Item Group x Account;
   - User x Role only after WS11 security review.
8. Do not merge/deploy non-UI/runtime-contract/backend work without explicit user approval.
9. UI-only fast-path applies only after blast-radius proof and only when the diff is truly presentation-only.

## Ownership boundaries

### META owns

- canonical metadata types;
- Matrix schema and validation;
- compiler/manifest transport;
- deterministic authoring contract.

META does not implement React renderers or pricing logic.

### RUNTIME owns

- shared Matrix renderer;
- generic renderer view-model boundary;
- keyboard/touch/mobile/responsive behavior;
- reusable presentation primitives.

RUNTIME must not edit canonical metadata contracts owned by META. If blocked, write a Dependency Request rather than silently redefining the contract.

### PRICING owns

- generic pricing-domain read projection/action semantics needed by Item Price reference;
- UOM/Price List/Item Price correctness;
- compound save behavior;
- OCC/idempotency/partial failure semantics;
- server permission path.

PRICING must not own renderer layout.

### ALUM owns

- exact current Item Price Manager behavior inventory;
- parity acceptance fixtures;
- Alumdoor metadata mapping to generic Matrix;
- regression proof that genericization does not make the UX worse.

ALUM must not fork shared runtime.

### QA owns

- cross-branch contract review;
- integration and second-reference test design;
- negative tests for domain leakage;
- large-matrix performance envelope;
- browser/E2E/evidence plan;
- convergence checklist.

QA should not become a second implementation owner unless fixing a test-only defect.

## Parallel execution wave

### Wave A — run all five agents in parallel

- META: contract/compiler foundation.
- RUNTIME: renderer architecture against a local semantic view-model, without touching canonical meta types.
- PRICING: server projection/action contract and current mutation audit.
- ALUM: reference behavior/fixtures and metadata mapping.
- QA: acceptance matrix, second-reference fixtures and conflict map.

### Wave B — convergence

After Wave A outputs exist:

1. reconcile META canonical contract with RUNTIME view-model;
2. connect PRICING named projection/actions;
3. wire ALUM metadata;
4. run QA contract/static/targeted/browser evidence;
5. remove the shared runtime `Item Price` special-case only after parity passes.

### Wave C — generic proof

Use the same renderer for Supplier x Item, then Item x Warehouse/Reorder, then Item Group x Account. Refine shared schema only when the gap is demonstrably cross-domain.

## Shared hotspot policy

Do not let multiple agents edit the same shared contract file concurrently.

Expected hotspots:

- `client/packages/core/src/types/meta.ts` -> META only.
- server-side metadata/compiler equivalents -> META only.
- `client/packages/views/src/**` Matrix/runtime files -> RUNTIME only.
- `server/packages/clouderp-pricing/**` and pricing action/projection code -> PRICING only.
- Alumdoor app metadata/fixtures/reference docs -> ALUM only.
- QA test/evidence docs/scripts that do not redefine production behavior -> QA only.

If an agent needs another owner to change a hotspot, record:

```text
Dependency Request
Owner: <branch>
Need: <contract/change>
Why: <blocking reason>
Can continue independently: yes/no
```

Then continue all independent work.

## Definition of Wave A done

Each implementation branch must finish with:

- exact base/current-main comparison recorded;
- changed-file summary;
- tests/evidence executed;
- unresolved Dependency Requests;
- explicit statement of files it owns/touched;
- maturity assessment (`Missing/Foundation/Wired/RC/Hardened`);
- no merge/deploy unless allowed by project policy.

## Convergence gate

Do not converge by blindly merging all branches. Classify each delta:

- keep;
- extract generic;
- superseded;
- reject.

The first integrated Matrix slice is accepted only when:

1. metadata selects Matrix without business-name conditionals;
2. renderer has no pricing literals;
3. pricing writes are server-authoritative;
4. Alumdoor Price Manager is UX parity or better on desktop/mobile;
5. permission/OCC/error states are proven;
6. second-reference path is viable without renderer fork.

## Prompt to start the control agent

`Đọc docs/agents/ui-factory/UI00-CONTROL.md, Forge Enterprise Completion Skill, exact GitHub state và điều phối các nhánh UI Factory. Không implement thay owner khác. Audit tiến độ, dependency, conflict, evidence và lập thứ tự convergence. Không merge/deploy non-UI nếu chưa được duyệt.`
